"use client";

import { useEffect, useRef, useState } from "react";

/**
 * WebGL2 liquid glass over live page content.
 *
 * The optics follow Canvas UI's `Glass` rather than a textbook sphere, because
 * a sphere is the wrong model for this look. A sphere bends light everywhere,
 * which gives a slow gradient across the whole disc and a washed-out middle. A
 * real lens of this kind is optically FLAT across most of its face and turns
 * away sharply at the rim, so the centre stays clean and all the bending — and
 * all the Fresnel — happens in a narrow band. That profile is what reads as
 * liquid glass, and it is also the profile `scripts/generate-glass-maps.mjs`
 * already bakes for the SVG layer, so both layers now agree.
 *
 * Page pixels reach the shader by one of two experimental HTML-in-Canvas entry
 * points, tried in that order:
 *
 *   1. `gl.texElementImage2D(target, internalformat, element)` — uploads the
 *      element straight to a texture.
 *   2. `ctx.drawElementImage(element, x, y)` on a `<canvas layoutsubtree>` 2D
 *      context, then `texImage2D` from that canvas. This is Canvas UI's path.
 *
 * Note that the capture is driven from the render loop rather than from
 * `canvas.onpaint`/`requestPaint()`. Canvas UI gates on `requestPaint` being
 * present, and that method has since been dropped while `drawElementImage`
 * stayed — so gating on it disables the effect on browsers that would in fact
 * support it. Polling in rAF costs a capture per frame and works either way.
 *
 * With neither entry point the component falls back to `"overlay"`: the canvas
 * paints only what needs no page pixels — the Fresnel-weighted environment
 * reflection and the rim shine — as a premultiplied layer over untouched
 * content. Refraction in that mode is the SVG `feDisplacementMap` layer's job.
 */

type CaptureMode = "texElement" | "drawElement" | "overlay" | "none";

type PaintableCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

type ElementImageGl = WebGL2RenderingContext & {
  texElementImage2D?: (
    target: number,
    internalformat: number,
    element: Element
  ) => void;
};

const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uPage;
uniform vec2  uResolution;  // drawing buffer size, device pixels
uniform vec2  uCenter;      // lens centre, device pixels, y up
uniform vec2  uHalf;        // lens half-extents, device pixels
uniform float uCorner;      // corner radius, device pixels
uniform float uEdge;        // fraction of the face that stays flat (0..0.98)
uniform float uBevel;       // how sharply the rim turns away (0.5..10)
uniform float uIor;
uniform float uDepth;       // optical depth in device pixels
uniform float uAberration;
uniform float uReflect;
uniform float uShine;
uniform float uZoom;
uniform float uHasPage;     // 1 = uPage holds the live DOM

const float PI = 3.14159265358979;
const float AIR_IOR = 1.0003;
const vec3 INCIDENT = vec3(0.0, 0.0, 1.0);
const vec3 VIEW = vec3(0.0, 0.0, -1.0);
const int SPECTRUM_TAPS = 9;

float pow2(float x) { return x * x; }
float pow5(float x) { float x2 = x * x; return x2 * x2 * x; }
float linearStep(float e0, float e1, float x) {
  return clamp((x - e0) / (e1 - e0), 0.0, 1.0);
}

/** Signed distance to a rounded box. A circle is the corner-radius extreme. */
float sdf(vec2 p) {
  vec2 q = abs(p) - (uHalf - vec2(uCorner));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner;
}

// Page reads happen in linear space and the final write re-encodes. Blending
// refracted taps in sRGB is what makes this kind of effect look muddy — the
// midtones sag because the space is perceptual, not radiometric.
vec3 page(vec2 px, float lod) {
  vec2 uv = clamp(px / uResolution, vec2(0.0005), vec2(0.9995));
  return pow(textureLod(uPage, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

vec3 pageAA(vec2 px, float minLod) {
  float footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

/**
 * Index of refraction for a wavelength in nanometres.
 *
 * Real glass disperses far too little to see at this scale, so the spread is
 * the one number pushed well past reality — everything else follows from it.
 */
float iorForWavelength(float wavelength) {
  float spread = uAberration * 0.1;
  return mix(
    uIor + spread,
    uIor - spread,
    1.0 - pow(1.0 - linearStep(450.0, 650.0, wavelength), 4.0)
  );
}

/** Approximate sRGB response for a wavelength, so the taps read as a spectrum. */
vec3 spectrumWeight(float wavelength) {
  float t = linearStep(380.0, 660.0, wavelength);
  return vec3(
    smoothstep(0.55, 0.95, t),
    exp(-16.0 * pow2(t - 0.55)),
    smoothstep(0.55, 0.15, t)
  );
}

/**
 * Where a ray entering the glass lands on the page.
 *
 * Scaling the refracted vector so its z-component equals the optical depth is
 * what turns "a direction" into "a landing point": the ray is followed until it
 * has travelled uDepth toward the page, and its xy at that moment is the offset.
 */
vec2 refractedOffset(vec3 normal, float glassIor) {
  vec3 ray = refract(INCIDENT, normal, AIR_IOR / glassIor);
  ray /= max(abs(ray.z), 1e-4) / uDepth;
  return ray.xy;
}

float fresnelSchlick(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow5(1.0 - cosTheta);
}

float smithSchlickDenom(float cosTheta, float k) {
  return cosTheta * (1.0 - k) + k;
}

float ggx(float roughness, float NDotL, float NDotV, float NDotH) {
  if (NDotL <= 0.0) return 0.0;
  float a2 = pow2(roughness);
  float d = a2 / (PI * pow2(pow2(NDotH) * (a2 - 1.0) + 1.0));
  float k = roughness * 0.5;
  float v = 1.0 / (smithSchlickDenom(NDotL, k)
    * smithSchlickDenom(clamp(NDotV, 0.0, 1.0), k));
  return NDotL * d * v;
}

/**
 * A procedural environment: one soft key lobe up and to the left, a vertical
 * sky gradient, and a floor bounce. Only used in overlay mode, where there are
 * no page pixels to reflect. No texture, no upload.
 */
vec3 env(vec3 direction) {
  vec3 key = normalize(vec3(-0.6, 0.8, 0.3));
  float lobe = pow(max(dot(direction, key), 0.0), 12.0);
  float sky = direction.y * 0.5 + 0.5;
  vec3 gradient = mix(vec3(0.30, 0.33, 0.40), vec3(0.96, 0.97, 1.0), sky);
  float floorBounce = pow(max(-direction.y, 0.0), 2.5) * 0.35;
  return gradient + vec3(1.0) * lobe * 1.4
    + vec3(0.85, 0.88, 0.95) * floorBounce;
}

void main() {
  vec2 fragPx = gl_FragCoord.xy;
  vec2 p = fragPx - uCenter;
  float sd = sdf(p);

  // 1.5px of coverage antialiasing on the silhouette.
  float mask = 1.0 - smoothstep(-1.5, 0.0, sd);
  if (mask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  // The rim ramp. Everything inside uEdge of the face is dead flat; the
  // remaining band turns away, and uBevel decides how abruptly.
  float minHalf = min(uHalf.x, uHalf.y);
  float edgeWidth = max(minHalf * (1.0 - clamp(uEdge, 0.0, 0.98)), 1.0);
  float rim = pow(linearStep(-edgeWidth, 0.0, sd), uBevel);

  // The normal comes from the distance field's gradient, so it follows whatever
  // shape the SDF describes — circle, squircle, capsule — with no per-shape
  // maths. At the silhouette it lies flat in the plane (z = 0), which is what
  // drives Fresnel to 1 all the way around the outline.
  vec2 gradient = vec2(
    sdf(p + vec2(1.0, 0.0)) - sdf(p - vec2(1.0, 0.0)),
    sdf(p + vec2(0.0, 1.0)) - sdf(p - vec2(0.0, 1.0))
  );
  vec3 rimNormal = vec3(normalize(gradient + vec2(1e-5)), 0.0);
  vec3 normal = normalize(mix(vec3(0.0, 0.0, -1.0), rimNormal, rim));

  float NDotV = clamp(dot(VIEW, normal), 0.0, 1.0);
  float f0 = pow2((uIor - AIR_IOR) / (uIor + AIR_IOR));

  // The rim shine: two arcs, brighter on the key side. This is the one painted
  // term in the shader, and it earns its place by keeping the lens legible over
  // flat backgrounds where clear glass would be genuinely invisible.
  float keyDot = dot(rimNormal.xy, normalize(vec2(-0.6, 0.8)));
  float band = pow(rim, 1.8);
  float arcs = pow(abs(keyDot), 3.0) * (keyDot > 0.0 ? 0.5 : 0.28);

  if (uHasPage < 0.5) {
    // Overlay mode: premultiplied "what the glass adds" over "what it blocks".
    // The clear middle lets the page through untouched and only the rim goes
    // properly opaque, so this composites correctly over arbitrary content.
    float fresnel = fresnelSchlick(NDotV, f0) * max(uReflect, 0.0);
    vec3 reflected = env(reflect(INCIDENT, normal)) * fresnel;
    vec3 shine = vec3(band * (0.04 + arcs) * max(uShine, 0.4));
    float alpha = clamp(fresnel, 0.0, 1.0) * mask;
    fragColor = vec4((pow(reflected, vec3(1.0 / 2.2)) * alpha + shine) * mask,
                     alpha);
    return;
  }

  // Zooming samples closer to the centre, which magnifies like a crystal ball.
  vec2 basePx = uCenter + p / max(uZoom, 1.0);

  vec3 refracted = vec3(0.0);
  if (uAberration > 0.001) {
    // Each wavelength lands somewhere slightly different and is weighted by the
    // colour the eye assigns it, so a white feature comes out as a spectrum in
    // the right order and the spread widens toward the rim on its own.
    vec3 weightSum = vec3(0.0);
    for (int i = 0; i < SPECTRUM_TAPS; i++) {
      float wavelength = mix(380.0, 660.0,
        float(i) / float(SPECTRUM_TAPS - 1));
      vec3 weight = spectrumWeight(wavelength);
      vec2 offset = refractedOffset(normal, iorForWavelength(wavelength));
      refracted += pageAA(basePx + offset, 0.0) * weight;
      weightSum += weight;
    }
    refracted /= max(weightSum, vec3(0.0001));
  } else {
    refracted = pageAA(basePx + refractedOffset(normal, uIor), 0.0);
  }

  vec3 glass = refracted;
  if (uReflect > 0.001) {
    // The rim reflects the page itself, blurred by sampling a coarse mip. That
    // is only possible because the page is a texture here — it is exactly what
    // overlay mode has to substitute a procedural environment for.
    float fresnel = clamp(fresnelSchlick(NDotV, f0) * uReflect, 0.0, 1.0);
    vec3 reflectVector = reflect(INCIDENT, normal);
    vec3 light = reflectVector;
    vec3 halfway = normalize(light + VIEW);
    reflectVector /= max(abs(reflectVector.z), 1e-4) / uDepth;
    vec3 reflected = page(basePx + reflectVector.xy, 2.5)
      * ggx(0.5, dot(normal, light), NDotV, dot(normal, halfway));
    glass = mix(refracted, reflected, fresnel);
  }

  glass += band * (0.04 + arcs) * max(uShine, 0.0);
  fragColor = vec4(pow(max(glass, vec3(0.0)), vec3(1.0 / 2.2)) * mask, mask);
}`;

export interface LiquidGlassCanvasProps {
  children: React.ReactNode;
  /** Lens centre in CSS pixels, relative to this component's box. */
  center: { x: number; y: number };
  /** Lens radius, or half-height for a rectangle, in CSS pixels. */
  size: number;
  shape?: "circle" | "square" | "rectangle";
  /** Width-to-height ratio for the rectangle shape. */
  aspect?: number;
  /** Corner radius for the square and rectangle shapes, in CSS pixels. */
  corner?: number;
  /** Index of refraction. Higher bends light more strongly at the rim. */
  ior?: number;
  /** Fraction of the face that stays optically flat before the rim bends. */
  edge?: number;
  /** How sharply the rim curves away. */
  bevel?: number;
  /** Optical depth in CSS pixels — how far the glass floats above the page. */
  depth?: number;
  /** Chromatic aberration strength. 0 disables the spectral split. */
  aberration?: number;
  /** Fresnel reflection strength on the rim. 0 disables it. */
  reflection?: number;
  /** Painted rim highlight, so the lens stays visible over flat backgrounds. */
  shine?: number;
  /** Magnification, like a crystal ball. */
  zoom?: number;
  /** Force a capture mode instead of feature-detecting. For comparisons only. */
  forceMode?: CaptureMode;
  className?: string;
}

const DEFAULTS = {
  shape: "circle" as const,
  aspect: 1.7,
  corner: 32,
  ior: 1.5,
  edge: 0.7,
  bevel: 4,
  depth: 250,
  aberration: 1,
  reflection: 1,
  shine: 0.01,
  zoom: 1,
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

/**
 * Decide the capture path on throwaway contexts, before the real ones exist.
 *
 * This has to happen off the rendered canvas: which path wins determines the
 * DOM shape, and the canvases cannot be built until that shape is known. Both
 * probes are dropped immediately so they do not count against the browser's
 * per-document context cap.
 */
let cachedMode: CaptureMode | null = null;
function detectMode(): CaptureMode {
  if (cachedMode) return cachedMode;
  const probe = document.createElement("canvas").getContext("webgl2", {
    // Refuse software rasterization: a spectral loop on a blocklisted GPU
    // freezes the tab, and the flat fallback is strictly the better widget.
    failIfMajorPerformanceCaveat: true,
  }) as ElementImageGl | null;
  if (!probe) return (cachedMode = "none");

  let mode: CaptureMode = "overlay";
  if (typeof probe.texElementImage2D === "function") {
    mode = "texElement";
  } else {
    const context2d = document
      .createElement("canvas")
      .getContext("2d") as ElementImageContext | null;
    if (context2d && typeof context2d.drawElementImage === "function") {
      mode = "drawElement";
    }
  }
  probe.getExtension("WEBGL_lose_context")?.loseContext();
  return (cachedMode = mode);
}

export default function LiquidGlassCanvas({
  children,
  center,
  size,
  shape = DEFAULTS.shape,
  aspect = DEFAULTS.aspect,
  corner = DEFAULTS.corner,
  ior = DEFAULTS.ior,
  edge = DEFAULTS.edge,
  bevel = DEFAULTS.bevel,
  depth = DEFAULTS.depth,
  aberration = DEFAULTS.aberration,
  reflection = DEFAULTS.reflection,
  shine = DEFAULTS.shine,
  zoom = DEFAULTS.zoom,
  forceMode,
  className,
}: LiquidGlassCanvasProps) {
  const outputRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Null until mounted. Rendering the overlay shape on the server and on the
  // first client pass keeps the markup identical across hydration, and it is
  // also the correct no-JS output: the content, unglazed.
  const [mode, setMode] = useState<CaptureMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live values for the render loop, so tuning never restarts it.
  const uniforms = useRef({
    center,
    size,
    shape,
    aspect,
    corner,
    ior,
    edge,
    bevel,
    depth,
    aberration,
    reflection,
    shine,
    zoom,
  });
  uniforms.current = {
    center,
    size,
    shape,
    aspect,
    corner,
    ior,
    edge,
    bevel,
    depth,
    aberration,
    reflection,
    shine,
    zoom,
  };

  useEffect(() => {
    setMode(forceMode ?? detectMode());
  }, [forceMode]);

  useEffect(() => {
    if (mode === null || mode === "none") return;
    const output = outputRef.current;
    const content = contentRef.current;
    if (!output || !content) return;

    const capture = mode === "texElement" || mode === "drawElement";
    const gl = output.getContext("webgl2", {
      failIfMajorPerformanceCaveat: true,
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true,
    }) as ElementImageGl | null;
    if (!gl) {
      setMode("none");
      setError("no webgl2");
      return;
    }

    const sourceCanvas = sourceRef.current as PaintableCanvas | null;
    const sourceContext =
      mode === "drawElement" && sourceCanvas
        ? (sourceCanvas.getContext("2d") as ElementImageContext | null)
        : null;
    if (mode === "drawElement" && !sourceContext?.drawElementImage) {
      setMode("overlay");
      setError("drawElementImage vanished");
      return;
    }

    let program: WebGLProgram | null = null;
    let frame = 0;
    let disposed = false;

    try {
      program = gl.createProgram();
      if (!program) throw new Error("could not create program");
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
      }
    } catch (cause) {
      setMode("none");
      setError(String(cause));
      return;
    }

    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Mipmaps are mandatory: the refraction perturbs the sample position, and
    // without a mip chain the coarse taps alias badly over fine text.
    const texture = capture ? gl.createTexture() : null;
    if (texture) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    const uniformLocation = (name: string) =>
      gl.getUniformLocation(program!, name);
    const locations = {
      page: uniformLocation("uPage"),
      resolution: uniformLocation("uResolution"),
      center: uniformLocation("uCenter"),
      half: uniformLocation("uHalf"),
      corner: uniformLocation("uCorner"),
      edge: uniformLocation("uEdge"),
      bevel: uniformLocation("uBevel"),
      ior: uniformLocation("uIor"),
      depth: uniformLocation("uDepth"),
      aberration: uniformLocation("uAberration"),
      reflection: uniformLocation("uReflect"),
      shine: uniformLocation("uShine"),
      zoom: uniformLocation("uZoom"),
      hasPage: uniformLocation("uHasPage"),
    };

    const onContextLost = (event: Event) => {
      // Context loss is routine under GPU resets and tab pressure, not exotic —
      // preventing the default is what allows a graceful drop to the fallback.
      event.preventDefault();
      disposed = true;
      cancelAnimationFrame(frame);
      setMode("none");
      setError("context lost");
    };
    output.addEventListener("webglcontextlost", onContextLost);

    let visible = true;
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? true;
    });
    intersection.observe(output);

    const render = () => {
      if (disposed) return;
      frame = requestAnimationFrame(render);
      if (!visible || document.visibilityState !== "visible") return;

      // Fill cost scales with the square of the ratio and this shader samples
      // the page nine times per pixel, so cap rather than take the display's
      // full density.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(content.offsetWidth * ratio);
      const height = Math.round(content.offsetHeight * ratio);
      if (width === 0 || height === 0) return;
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }

      if (capture) {
        // The element image is only valid until the browser composites, so the
        // capture has to happen in the same task as the draw that reads it.
        try {
          if (mode === "texElement") {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texElementImage2D!(gl.TEXTURE_2D, gl.RGBA8, content);
          } else {
            if (sourceCanvas!.width !== width) sourceCanvas!.width = width;
            if (sourceCanvas!.height !== height) sourceCanvas!.height = height;
            sourceCanvas!.requestPaint?.();
            sourceContext!.reset();
            sourceContext!.drawElementImage!(content, 0, 0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              sourceCanvas!
            );
          }
          gl.generateMipmap(gl.TEXTURE_2D);
        } catch (cause) {
          disposed = true;
          cancelAnimationFrame(frame);
          setMode("overlay");
          setError(`capture failed: ${cause}`);
          return;
        }
      }

      const live = uniforms.current;
      const halfHeight = Math.max(live.size, 8) * ratio;
      const halfWidth =
        live.shape === "rectangle"
          ? halfHeight * Math.min(Math.max(live.aspect, 1), 4)
          : halfHeight;
      const cornerRadius =
        live.shape === "circle"
          ? Math.min(halfWidth, halfHeight)
          : Math.min(
              Math.max(live.corner, 0) * ratio,
              Math.min(halfWidth, halfHeight)
            );

      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Only the lens and a little slack around it can possibly be non-zero, so
      // scissor the rest away rather than shading the whole page every frame.
      const centreX = live.center.x * ratio;
      const centreY = height - live.center.y * ratio;
      const margin = 4 * ratio;
      const scissorX = Math.max(0, Math.floor(centreX - halfWidth - margin));
      const scissorY = Math.max(0, Math.floor(centreY - halfHeight - margin));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        scissorX,
        scissorY,
        Math.min(width - scissorX, Math.ceil((halfWidth + margin) * 2)),
        Math.min(height - scissorY, Math.ceil((halfHeight + margin) * 2))
      );

      gl.uniform1i(locations.page, 0);
      gl.uniform1f(locations.hasPage, capture ? 1 : 0);
      gl.uniform2f(locations.resolution, width, height);
      gl.uniform2f(locations.center, centreX, centreY);
      gl.uniform2f(locations.half, halfWidth, halfHeight);
      gl.uniform1f(locations.corner, cornerRadius);
      gl.uniform1f(locations.edge, Math.min(Math.max(live.edge, 0), 0.98));
      gl.uniform1f(locations.bevel, Math.max(live.bevel, 0.5));
      gl.uniform1f(locations.ior, Math.min(Math.max(live.ior, 1.01), 2.5));
      gl.uniform1f(locations.depth, Math.max(live.depth, 0) * ratio);
      gl.uniform1f(locations.aberration, Math.max(live.aberration, 0));
      gl.uniform1f(locations.reflection, Math.max(live.reflection, 0));
      gl.uniform1f(locations.shine, Math.max(live.shine, 0));
      gl.uniform1f(locations.zoom, Math.max(live.zoom, 1));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      intersection.disconnect();
      output.removeEventListener("webglcontextlost", onContextLost);
      if (texture) gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, [mode]);

  // `layoutsubtree` is what makes a canvas lay out and paint its own children;
  // without it they are inert fallback content and there is nothing to capture.
  // The element must be a DIRECT child of that canvas, which is why the
  // drawElement path nests the content inside it and the others do not.
  const body = (
    <div ref={contentRef} data-glass-content>
      {children}
    </div>
  );

  return (
    <div
      className={className}
      style={{ position: "relative", isolation: "isolate" }}
    >
      {mode === "drawElement" ? (
        <canvas
          ref={sourceRef}
          // @ts-expect-error — `layoutsubtree` is not in React's JSX types yet.
          layoutsubtree="true"
          suppressHydrationWarning
          style={{ display: "block", width: "100%", height: "auto" }}
        >
          {body}
        </canvas>
      ) : (
        body
      )}
      {mode !== null && mode !== "none" && (
        <canvas
          ref={outputRef}
          aria-hidden
          data-glass-output={mode}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      )}
      {mode === "none" && (
        <div data-glass-fallback hidden data-error={error ?? "unavailable"} />
      )}
    </div>
  );
}
