"use client";

/**
 * SPIKE — the real scroll-to-chat transition, rendered entirely by WebGL2.
 *
 * Why this exists: `OrbWarp` refracts the page with an SVG filter graph,
 * because WebGL cannot read the pixels behind its own canvas and the
 * HTML-in-Canvas APIs that would fix that (`texElementImage2D`,
 * `drawElementImage`) are unavailable here. So `LiquidGlassCanvas` runs in
 * "overlay" mode: procedural reflection only, refraction delegated to SVG.
 *
 * If the page is itself GL, that constraint disappears — the page becomes a
 * texture and the glass samples it like any other. This runs the REAL fragment
 * shader from `LiquidGlassCanvas` with `uHasPage = 1`, the mode the site can
 * never otherwise reach, along the REAL trajectory from `lib/scrollchat`.
 *
 * Nothing about the motion is reimplemented here. `orbGeometryAt`, `flyToChip`,
 * `ORB_TUNING_DEFAULTS` and the chip constants are imported from the modules the
 * shipping transition uses, for the reason `orbGeometry`'s own docstring gives:
 * two copies of a trajectory are two trajectories, and the only symptom is "the
 * bench doesn't move like the real thing" with no obvious cause.
 *
 * Per frame:
 *   1. surface -> framebuffer: page panned by scroll, crossfaded to the chat
 *   2. present:  framebuffer -> screen
 *   3. glass:    the imported shader, sampling the framebuffer as `uPage`
 *
 * Both surfaces are uploaded ONCE. Scrolling and the whole transition only move
 * uniforms, so they cost nothing on the CPU — which is the headline result and
 * the reason this is worth measuring rather than reasoning about.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FRAGMENT_SHADER,
  VERTEX_SHADER,
} from "@/components/scrollchat/LiquidGlassCanvas";
import { CHIP_CENTER_FROM_BOTTOM, CHIP_DIAMETER } from "@/lib/scrollchat/chip";
import {
  flyToChip,
  linearStep,
  orbGeometryAt,
  orbSizeUnit,
} from "@/lib/scrollchat/orbGeometry";
import { ORB_TUNING_DEFAULTS } from "@/lib/scrollchat/orbTuning";
import {
  type RasterizedSurfaces,
  rasterizeHomeSurfaces,
} from "@/lib/scrollchat/domRasterizer";
import OrbDialPanel from "./OrbDialPanel";
import {
  ORB_COLOUR_DEFAULTS,
  ORB_DIAL_DEFAULTS,
  type OrbColours,
  type OrbDialValues,
  hexToRgb,
} from "./orbDialKit";

/**
 * Draws the page, panned by the scroll offset, crossfaded to the chat.
 *
 * `OrbWarp` stacks an opaque page layer at `opacity: 1 - swap` over an opaque
 * chat layer, which composites to exactly `mix(page, chat, swap)`. The chat is
 * `position: absolute; inset: 0`, so it samples in viewport space and does NOT
 * move with the scroll — the page slides underneath it.
 *
 * Writing row 0 of the framebuffer as the TOP of the viewport is deliberate:
 * the imported glass shader samples with `vec2(uv.x, 1.0 - uv.y)`, i.e. it
 * expects a canvas-oriented (top-left origin) texture. Matching that convention
 * here means the glass shader can be used verbatim, with no edits.
 */
const SURFACE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uDocument;
uniform sampler2D uChat;
uniform vec2  uResolution;      // viewport, device pixels
uniform float uDocumentHeight;  // full document, device pixels
uniform float uScroll;          // device pixels from the document top
uniform float uSwap;            // 0 = page, 1 = chat, OUTSIDE the orb
uniform float uSwapInside;      // the same, for the disc
uniform vec2  uOrbCentre;       // device pixels, y up
uniform float uOrbRadius;       // device pixels
uniform float uPorthole;        // 0 = one global crossfade, 1 = porthole

void main() {
  vec2 viewportUv = gl_FragCoord.xy / uResolution;
  float documentY = uScroll + gl_FragCoord.y;
  vec3 page = texture(uDocument,
    vec2(viewportUv.x, documentY / uDocumentHeight)).rgb;
  vec3 chat = texture(uChat, viewportUv).rgb;

  // The crossfade is per-pixel rather than global, so the disc can hold the page
  // while the chat has already filled in around it. One texel of feather is all
  // the antialiasing the boundary needs: the glass drawn on top covers it, and a
  // softer edge would read as a halo rather than as a rim.
  float insideOrb = 1.0 - smoothstep(
    uOrbRadius - 1.0, uOrbRadius + 1.0, length(gl_FragCoord.xy - uOrbCentre));
  float swap = mix(uSwap, uSwapInside, insideOrb * clamp(uPorthole, 0.0, 1.0));

  fragColor = vec4(mix(page, chat, clamp(swap, 0.0, 1.0)), 1.0);
}`;

/**
 * The orb's own surface — everything that is a property of the GLASS rather than
 * of what is behind it.
 *
 * On the real site this is `OrbSurface`, a DOM element carrying three
 * `box-shadow`s and a radial gradient. It is deliberately NOT inside the SVG
 * filter there, because none of it depends on the page. On an all-GL page there
 * is no DOM to hang it on, so it is reproduced here as one more pass. Without it
 * the orb has no silhouette at all: the meniscus hairline is what separates a
 * SMALL orb from the page, and the contact shadow is what sits it on top of one.
 *
 * The CSS semantics being matched, exactly:
 *   - an outer `box-shadow` is clipped to OUTSIDE the border box
 *   - blur radius B is a Gaussian with sigma = B/2, which `smoothstep` over
 *     +/-sigma approximates closely and far more cheaply than a real kernel
 *   - `inset 0 0 0 Wpx` is a hard ring of width W just INSIDE the silhouette
 *   - paint order is meniscus, then background, then outer rim, then shadow
 */
const ORB_SURFACE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uCenter;         // device pixels, y up, matching the glass pass
uniform float uRadius;         // device pixels
uniform float uMeniscus;       // meniscus ring width, device pixels
uniform float uMeniscusAlpha;
uniform vec3  uMeniscusColour;
uniform float uRimAlpha;
uniform float uRimBlur;        // as a fraction of the radius
uniform vec3  uRimColour;
uniform float uShadow;         // contact shadow alpha
uniform float uShadowDrop;     // downward offset, as a fraction of the radius
uniform float uShadowBlur;     // as a fraction of the radius
uniform vec3  uShadowColour;
uniform float uMilk;           // body wash strength
uniform float uPresence;       // 1 while the orb is whole, 0 once it has handed off

/** Alpha of a Gaussian-blurred disc at signed distance \`d\` from its edge. */
float blurredDisc(float d, float blur) {
  float sigma = max(blur * 0.5, 0.5);
  return 1.0 - smoothstep(-sigma, sigma, d);
}

/** Premultiplied source-over. */
vec4 over(vec4 src, vec4 dst) {
  return src + dst * (1.0 - src.a);
}

void main() {
  vec2 offsetFromCentre = gl_FragCoord.xy - uCenter;
  // Signed distance to the silhouette: positive outside, negative within.
  float edgeDistance = length(offsetFromCentre) - uRadius;
  float outside = step(0.0, edgeDistance);

  // Contact shadow, offset DOWN the screen — which is -y in this convention.
  float shadowFall =
    length(offsetFromCentre + vec2(0.0, uRadius * uShadowDrop)) - uRadius;
  vec4 layer = vec4(uShadowColour, 1.0)
    * (blurredDisc(shadowFall, uRadius * uShadowBlur) * uShadow * outside);

  // The soft dark rim just outside the silhouette. This separates the sphere
  // from the page more convincingly than any highlight does.
  vec4 rim = vec4(uRimColour, 1.0)
    * (blurredDisc(edgeDistance, uRadius * uRimBlur)
       * uRimAlpha * uPresence * outside);
  layer = over(rim, layer);

  // Body wash: \`radial-gradient(circle at 50% 45%, ...)\` over the 2r box, whose
  // default farthest-corner radius works out to 1.4866r from that centre.
  if (uMilk > 0.0001) {
    float wash = length(offsetFromCentre - vec2(0.0, uRadius * 0.1))
      / (uRadius * 1.4866);
    float washAlpha =
      wash < 0.62 ? mix(0.5, 0.16, wash / 0.62)
    : wash < 0.92 ? mix(0.16, 0.55, (wash - 0.62) / 0.30)
    : wash < 1.0  ? mix(0.55, 0.0, (wash - 0.92) / 0.08)
    : 0.0;
    washAlpha *= uMilk * uPresence * (1.0 - outside);
    layer = over(vec4(vec3(1.0), 1.0) * washAlpha, layer);
  }

  // The meniscus line, riding just INSIDE the silhouette. Neutral grey at half
  // alpha, so the refracted content shows through the line instead of being
  // capped by it.
  float ring = smoothstep(-uMeniscus - 0.5, -uMeniscus + 0.5, edgeDistance)
    * (1.0 - smoothstep(-0.5, 0.5, edgeDistance));
  layer = over(
    vec4(uMeniscusColour, 1.0) * (ring * uMeniscusAlpha * uPresence), layer);

  fragColor = layer;
}`;

/** Copies the offscreen surface to the screen, undoing the top-down convention. */
const PRESENT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2 uResolution;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  fragColor = textureLod(uScene, vec2(uv.x, 1.0 - uv.y), 0.0);
}`;

/**
 * Fragment cost scales with the square of this, and the spectral loop is nine
 * dependent fetches per lens pixel, so it is capped exactly the way the SVG
 * path is. Keeping the cap identical is what makes the two comparable.
 */
const MAX_PIXEL_RATIO = 2;

/** Rasterizing the surfaces is expensive, so resizes are coalesced. */
const RESIZE_DEBOUNCE_MS = 300;

/*
 * The orb's look is no longer hardcoded here — every knob lives in
 * `orbDialKit.ts`, which owns its default, its range and the line it prints
 * when the kit is copied. See that file for what each one does.
 */

type GesturePhase =
  | "idle"
  | "pulling"
  | "holding"
  | "flying"
  | "chat"
  | "rewinding";

/**
 * Floor for the lowest spectral index. Below 1 the air-to-glass ratio inverts
 * and that wavelength stops refracting altogether, so the chromatic spread is
 * capped short of it however hard `chromaticHold` pushes.
 */
const MIN_SPECTRAL_IOR = 1.05;

/** Backstop on the chromatic compensation, so a tiny orb cannot run away. */
const CHROMATIC_GAIN_CEILING = 8;

/**
 * Where the pull ends and the flight begins on the combined 0..1 timeline.
 *
 * The scrubber lays the two stages end to end so the whole transition can be
 * stepped through as one value, and the rewind runs that SAME timeline
 * backwards — which is what makes a reset retrace the flight out of the chip
 * instead of cutting straight to the settled orb.
 */
const PULL_SHARE = 0.62;

/** A point on the combined timeline, from the two stage values. */
function combinedTimeline(progress: number, fly: number) {
  return fly > 0 ? PULL_SHARE + fly * (1 - PULL_SHARE) : progress * PULL_SHARE;
}

/** The inverse: split a combined timeline value back into the two stages. */
function splitTimeline(point: number) {
  return {
    progress: Math.min(1, Math.max(point, 0) / PULL_SHARE),
    fly: Math.max(0, (point - PULL_SHARE) / (1 - PULL_SHARE)),
  };
}

/** The range `uBevel` is documented to behave over in the glass shader. */
const MIN_BEVEL = 0.5;
const MAX_BEVEL = 10;

interface FrameStats {
  fps: number;
  medianFrameMs: number;
  documentHeight: number;
  pixelRatio: number;
  /** What the gesture is actually running on, which is the thing worth seeing. */
  gesture: string;
  /** Spectral separation as actually uploaded, so the safety clamp is visible. */
  optics: string;
  rasterizeMs: number;
  capture: string;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string
): WebGLProgram {
  const program = gl.createProgram()!;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  // Attached shaders are reference-counted; deleting them here means the
  // program owns the only reference and they die with it.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function createSurfaceTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // No mip chain on the surfaces: they are sampled 1:1 and a minified mip would
  // visibly soften the text for no benefit.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // A single opaque texel stands in until the first capture lands, so the
  // render loop can start without a branch for "no surface yet".
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255])
  );
  return texture;
}

export default function WebGLPageSpike() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [status, setStatus] = useState("rasterizing the page…");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<GesturePhase>("idle");
  const [scrubTimeline, setScrubTimeline] = useState<number | null>(null);

  // Values the render loop reads every frame. These are refs rather than state
  // because the gesture must not re-render React sixty times a second.
  const scrubRef = useRef(scrubTimeline);
  scrubRef.current = scrubTimeline;

  const [dials, setDials] = useState<OrbDialValues>(ORB_DIAL_DEFAULTS);
  const [colours, setColours] = useState<OrbColours>(ORB_COLOUR_DEFAULTS);
  // Mirrored into refs so a dial drag never re-renders the render loop. The
  // loop reads `.current` each frame and React is never in the hot path.
  const dialsRef = useRef(dials);
  dialsRef.current = dials;
  const coloursRef = useRef(colours);
  coloursRef.current = colours;
  const resetRef = useRef<(() => void) | null>(null);

  const onReplay = useCallback(() => {
    // Scrub from the top: setting the timeline drives progress and fly directly,
    // which is the deterministic way to watch the transition.
    setScrubTimeline(0);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      // A software rasterizer would make every number below meaningless, and
      // this page exists only to produce numbers.
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) {
      setError(
        "WebGL2 unavailable (or the GPU is blocklisted / acceleration is off)."
      );
      return;
    }

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    let surfaceProgram: WebGLProgram;
    let presentProgram: WebGLProgram;
    let glassProgram: WebGLProgram;
    let orbSurfaceProgram: WebGLProgram;
    try {
      surfaceProgram = linkProgram(gl, SURFACE_FRAGMENT_SHADER);
      presentProgram = linkProgram(gl, PRESENT_FRAGMENT_SHADER);
      glassProgram = linkProgram(gl, FRAGMENT_SHADER);
      orbSurfaceProgram = linkProgram(gl, ORB_SURFACE_FRAGMENT_SHADER);
    } catch (compileError) {
      setError(String(compileError));
      return;
    }

    // One fullscreen triangle, shared by all three passes. The vertex shader is
    // imported and only reads `position`, so this is all the geometry the entire
    // page needs.
    const quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    for (const program of [
      surfaceProgram,
      presentProgram,
      glassProgram,
      orbSurfaceProgram,
    ]) {
      const location = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    }

    const documentTexture = createSurfaceTexture(gl);
    const chatTexture = createSurfaceTexture(gl);
    const sceneTexture = gl.createTexture()!;
    const sceneFramebuffer = gl.createFramebuffer()!;

    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    // The glass DOES need mips: `page(px, 2.5)` reads a coarse level for the
    // blurred rim reflection, and `pageAA` picks a level from the footprint.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let pixelRatio = 1;
    let viewportWidth = 0;
    let viewportHeight = 0;
    let cssViewportWidth = 0;
    let cssViewportHeight = 0;
    let documentHeightCss = 0;
    let documentHeightDevice = 1;
    let rasterizeMs = 0;
    let captureSummary = "";
    /** The landing slot measured off the chat surface; null until it is captured. */
    let measuredChip: RasterizedSurfaces["chatChip"] = null;
    let disposed = false;
    // Guards against overlapping captures when resizes arrive in quick
    // succession: only the newest one is allowed to install its result.
    let captureToken = 0;

    // --- gesture state -----------------------------------------------------
    let scrollCss = 0;
    let gestureBudget = 0;
    let flyValue = 0;
    let gesturePhase: GesturePhase = "idle";
    let releaseTimer = 0;
    // Runs while a released-but-uncommitted pull rests at the height it
    // reached, before it is allowed to spring back.
    let holdTimer = 0;
    let animationStartedAt = 0;
    let animationFrom = 0;
    // How long the current rewind runs. Unlike the flight it is not a fixed
    // duration: reversing out of the chip has a whole extra stage to undo.
    let rewindDuration = 0;

    const setPhaseState = (next: GesturePhase) => {
      if (gesturePhase === next) return;
      gesturePhase = next;
      setPhase(next);
    };

    /**
     * Reverse the whole transition from wherever it currently stands.
     *
     * `animationFrom` holds a point on the COMBINED timeline, not a bare pull,
     * so a reset from the chat retraces the flight — the orb leaves the chip,
     * grows back to the settled sphere, and only then falls. Undoing `fly`
     * first was the difference between that and the orb blinking into
     * existence at the settle position.
     *
     * The duration follows suit: the flight segment is given back its own
     * `flyMs` so it reverses at the speed it flew, on top of the `rewindMs`
     * the pull segment already had.
     */
    const beginRewind = (progress: number, fly: number) => {
      const dial = dialsRef.current;
      animationFrom = combinedTimeline(progress, fly);
      rewindDuration = Math.max(1, fly * dial.flyMs + dial.rewindMs);
      animationStartedAt = performance.now();
      setPhaseState("rewinding");
    };

    /** Resize the drawing buffer and the offscreen colour attachment. */
    const resizeSurfaces = () => {
      cssViewportWidth = window.innerWidth;
      cssViewportHeight = window.innerHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      viewportWidth = Math.round(cssViewportWidth * pixelRatio);
      viewportHeight = Math.round(cssViewportHeight * pixelRatio);

      canvas.width = viewportWidth;
      canvas.height = viewportHeight;
      canvas.style.width = `${cssViewportWidth}px`;
      canvas.style.height = `${cssViewportHeight}px`;

      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        viewportWidth,
        viewportHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        sceneTexture,
        0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    /**
     * Capture the real surfaces and upload them.
     *
     * This is the expensive operation, and it runs on resize only — never per
     * frame, and never during the transition. Everything a browser does
     * incrementally (invalidate a region, repaint just that) collapses here into
     * "photograph the whole document", which is the honest cost of the approach.
     */
    const rebuildSurfaces = async () => {
      const token = ++captureToken;
      resizeSurfaces();
      setStatus("rasterizing the page…");
      try {
        const surfaces = await rasterizeHomeSurfaces(
          cssViewportWidth,
          cssViewportHeight,
          pixelRatio
        );
        if (disposed || token !== captureToken) return;

        if (surfaces.page.canvas.height > maxTextureSize) {
          setError(
            `Page is ${surfaces.page.canvas.height}px tall, past the ${maxTextureSize}px texture limit.`
          );
          return;
        }

        for (const [texture, capture] of [
          [documentTexture, surfaces.page],
          [chatTexture, surfaces.chat],
        ] as const) {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            capture.canvas
          );
        }

        measuredChip = surfaces.chatChip;
        documentHeightCss = surfaces.page.cssHeight;
        documentHeightDevice = surfaces.page.canvas.height;
        rasterizeMs = surfaces.rasterizeMs;
        captureSummary =
          `${Math.round(surfaces.svgBytes / 1024)}kb svg · ` +
          `${surfaces.embeddedFonts} fonts · ${surfaces.embeddedImages} imgs` +
          (surfaces.droppedImages ? ` · ${surfaces.droppedImages} dropped` : "") +
          (measuredChip
            ? ` · chip ${Math.round(measuredChip.centerX)},${Math.round(measuredChip.centerY)}`
            : " · chip NOT MEASURED");
        setStatus("");
      } catch (captureError) {
        if (disposed || token !== captureToken) return;
        setError(`Rasterizing the page failed: ${String(captureError)}`);
      }
    };

    void rebuildSurfaces();

    const uniform = (program: WebGLProgram, name: string) =>
      gl.getUniformLocation(program, name);

    const surfaceUniforms = {
      document: uniform(surfaceProgram, "uDocument"),
      chat: uniform(surfaceProgram, "uChat"),
      resolution: uniform(surfaceProgram, "uResolution"),
      documentHeight: uniform(surfaceProgram, "uDocumentHeight"),
      scroll: uniform(surfaceProgram, "uScroll"),
      swap: uniform(surfaceProgram, "uSwap"),
      swapInside: uniform(surfaceProgram, "uSwapInside"),
      orbCentre: uniform(surfaceProgram, "uOrbCentre"),
      orbRadius: uniform(surfaceProgram, "uOrbRadius"),
      porthole: uniform(surfaceProgram, "uPorthole"),
    };
    const presentUniforms = {
      scene: uniform(presentProgram, "uScene"),
      resolution: uniform(presentProgram, "uResolution"),
    };
    const glassUniforms = {
      page: uniform(glassProgram, "uPage"),
      resolution: uniform(glassProgram, "uResolution"),
      center: uniform(glassProgram, "uCenter"),
      half: uniform(glassProgram, "uHalf"),
      corner: uniform(glassProgram, "uCorner"),
      edge: uniform(glassProgram, "uEdge"),
      bevel: uniform(glassProgram, "uBevel"),
      ior: uniform(glassProgram, "uIor"),
      depth: uniform(glassProgram, "uDepth"),
      aberration: uniform(glassProgram, "uAberration"),
      reflect: uniform(glassProgram, "uReflect"),
      shine: uniform(glassProgram, "uShine"),
      zoom: uniform(glassProgram, "uZoom"),
      hasPage: uniform(glassProgram, "uHasPage"),
    };

    const orbSurfaceUniforms = {
      center: uniform(orbSurfaceProgram, "uCenter"),
      radius: uniform(orbSurfaceProgram, "uRadius"),
      meniscus: uniform(orbSurfaceProgram, "uMeniscus"),
      meniscusAlpha: uniform(orbSurfaceProgram, "uMeniscusAlpha"),
      meniscusColour: uniform(orbSurfaceProgram, "uMeniscusColour"),
      rimAlpha: uniform(orbSurfaceProgram, "uRimAlpha"),
      rimBlur: uniform(orbSurfaceProgram, "uRimBlur"),
      rimColour: uniform(orbSurfaceProgram, "uRimColour"),
      shadow: uniform(orbSurfaceProgram, "uShadow"),
      shadowDrop: uniform(orbSurfaceProgram, "uShadowDrop"),
      shadowBlur: uniform(orbSurfaceProgram, "uShadowBlur"),
      shadowColour: uniform(orbSurfaceProgram, "uShadowColour"),
      milk: uniform(orbSurfaceProgram, "uMilk"),
      presence: uniform(orbSurfaceProgram, "uPresence"),
    };

    const tuning = ORB_TUNING_DEFAULTS;

    /**
     * Resolve the transition's two independent inputs for this frame.
     *
     * `progress` is the pull, which the visitor can drag back and forth, and
     * `fly` is the commit, which only ever runs forward once the pull is
     * released past the threshold. The scrubber overrides both, laying them end
     * to end on one 0..1 timeline so the whole thing can be stepped through.
     */
    const resolveTransition = (now: number) => {
      const scrub = scrubRef.current;
      if (scrub !== null) return splitTimeline(scrub);

      const dial = dialsRef.current;
      const pull = Math.min(1, gestureBudget / dial.threshold);
      if (gesturePhase === "flying") {
        const t = Math.min(1, (now - animationStartedAt) / dial.flyMs);
        flyValue = animationFrom + (1 - animationFrom) * t;
        if (t >= 1) setPhaseState("chat");
        return { progress: 1, fly: flyValue };
      }
      if (gesturePhase === "rewinding") {
        const t = Math.min(1, (now - animationStartedAt) / rewindDuration);
        // The combined timeline walked back to 0, then split into the two
        // stages again — so the flight unwinds before the pull does.
        const point = splitTimeline(animationFrom * (1 - t));
        flyValue = point.fly;
        if (t >= 1) {
          gestureBudget = 0;
          flyValue = 0;
          setPhaseState("idle");
        }
        return point;
      }
      if (gesturePhase === "chat") return { progress: 1, fly: 1 };
      // "holding" lands here alongside "pulling" and "idle": the hold does not
      // animate anything, it simply leaves the budget untouched, so the orb
      // rests at exactly the height the pull reached.
      return { progress: pull, fly: 0 };
    };

    const frameDurations: number[] = [];
    let lastFrameTime = performance.now();
    let statsFlushedAt = lastFrameTime;
    let animationFrame = 0;

    const renderFrame = (now: number) => {
      if (disposed) return;
      animationFrame = requestAnimationFrame(renderFrame);

      const { progress, fly } = resolveTransition(now);
      const viewport = { width: cssViewportWidth, height: cssViewportHeight };
      const dial = dialsRef.current;
      const colour = coloursRef.current;

      // The page freezes the instant the pull starts, exactly as
      // `body.scrollchat-locked` does on the real site.
      const maxScrollCss = Math.max(
        0,
        (documentHeightDevice - viewportHeight) / pixelRatio
      );
      scrollCss = Math.min(Math.max(scrollCss, 0), maxScrollCss);

      // The orb's geometry is resolved BEFORE anything is drawn, because the
      // background pass needs it too: the porthole reveal is a per-pixel
      // crossfade keyed on the disc, so pass 1 has to know where the disc is.
      //
      // The trajectory functions take the shape they need as an argument, so
      // dialling motion means handing them a different shape — not forking them.
      const shape = {
        startRadius: dial.startRadius,
        endRadius: dial.endRadius,
        startBelow: dial.startBelow,
        settleY: dial.settleY,
        settleYPortrait: tuning.settleYPortrait,
        riseBias: dial.riseBias,
      };
      const settled = orbGeometryAt(progress, viewport, shape);
      const orb =
        fly > 0
          ? flyToChip(
              settled,
              // Same precedence `OrbWarp` uses: the measured chip when there is
              // one, and only then the constant. The chip rides in the composer,
              // so the constant is a guess at where it usually ends up.
              measuredChip ?? {
                centerX: viewport.width / 2,
                centerY: viewport.height - CHIP_CENTER_FROM_BOTTOM,
                radius: CHIP_DIAMETER / 2,
              },
              fly,
              dial.lob * viewport.height
            )
          : settled;

      // The orb dissolves onto the chip rather than shrinking into it: the last
      // few pixels of travel are far too small for any refraction to read.
      const orbPresence =
        1 - linearStep(fly, dial.dissolveFrom, dial.dissolveTo);

      // 0 at full size, 1 at the small end. `smallBoost` therefore leaves the
      // big orb at exactly the tuned refraction and only lifts the shrinking
      // one — without it the small orb goes flat and loses its edge, because the
      // optical depth scales with a radius that is by then very small.
      const smallness =
        1 - Math.min(1, orb.radius / Math.max(1, orbSizeUnit(viewport) * 0.35));
      const orbRadiusCssNow = orb.radius;
      const radiusDeviceNow = orb.radius * pixelRatio;
      const refractionEnvelope =
        orbPresence * dial.refraction * (1 + dial.smallBoost * smallness);

      /**
       * Spectral separation is proportional to optical depth, and depth is
       * proportional to radius, so the fringe collapses in absolute pixels as
       * the orb lands. Colour fringing is an absolute-pixel percept — below a
       * pixel or two of separation the taps just average back to grey — so a
       * dimensionless `aberration` dial silently weakens all the way down.
       *
       * `chromaticHold` cancels a chosen fraction of that: raising the spread
       * by (referenceDepth / depth)^hold makes the separation scale as
       * depth^(1-hold), so 0.5 turns the ~4x collapse at landing into ~2x.
       *
       * Measured against the depth the orb has at its START radius, and with
       * `orbPresence` deliberately excluded — during the dissolve presence
       * drives the real depth to zero, which would send the ratio to infinity.
       */
      /**
       * The refracting shoulder, floored at an absolute width.
       *
       * `uEdge` is the fraction of the face that stays FLAT, so the shoulder is
       * `radius * (1 - uEdge)` — a pure ratio, which means it thins in lockstep
       * with the orb and the small orb reads as flat glass. A real droplet does
       * not behave that way: surface tension sets its shoulder at a roughly
       * fixed physical width, so shrinking one eats into the flat top instead,
       * and a small enough droplet is entirely rim.
       *
       * Solving `radius * (1 - edge) >= floor` for edge reproduces exactly that
       * without touching the imported shader: below a crossover radius of
       * `floor / (1 - edge)` the flat centre gives way, reaching zero — all
       * shoulder — once the radius is down to the floor itself.
       */
      const edgeFloorDevice = dial.edgeFloorPx * pixelRatio;
      const effectiveEdge = Math.min(
        Math.max(Math.min(dial.edge, 1 - edgeFloorDevice / Math.max(radiusDeviceNow, 1)), 0),
        0.98
      );

      /**
       * The bevel, eased toward `bevelSmall` as the orb shrinks.
       *
       * `uBevel` is the exponent on the rim ramp, so it decides how much of the
       * shoulder actually bends: high crushes the curvature against the
       * silhouette and leaves a flat face, low spreads it inward.
       *
       * Which is the same size law as the edge floor. Gravity flattens a large
       * droplet into a puddle — flat top, curvature only at the rim — while
       * surface tension holds a small one near-spherical, curving across its
       * whole face. Large orb wants a high bevel, small orb a low one.
       */
      const effectiveBevel = Math.min(
        Math.max(
          dial.bevel + (dial.bevelSmall - dial.bevel) * smallness,
          MIN_BEVEL
        ),
        MAX_BEVEL
      );

      const referenceDepth =
        dial.startRadius *
        orbSizeUnit(viewport) *
        pixelRatio *
        dial.refraction *
        0.5;
      const geometricDepth =
        orb.radius *
        pixelRatio *
        dial.refraction *
        (1 + dial.smallBoost * smallness) *
        0.5;
      const chromaticGain = Math.min(
        CHROMATIC_GAIN_CEILING,
        Math.pow(
          Math.max(referenceDepth, 1) / Math.max(geometricDepth, 1),
          dial.chromaticHold
        )
      );
      // The spread offsets the index of refraction either side of `ior`. Let it
      // reach 1 and the low tap refracts the wrong way (eta > 1 total-internal-
      // reflects, `refract` returns 0 and that wavelength stops displacing at
      // all), so it is capped short of that rather than allowed to invert.
      const maxSpread = Math.max(0, dial.ior - MIN_SPECTRAL_IOR);
      const wantedSpread = dial.aberration * 0.1 * chromaticGain;
      const spectralSpread = Math.min(wantedSpread, maxSpread);
      const chromaticClamped = wantedSpread > maxSpread + 1e-6;
      // `uAberration` IS the spread, scaled by 0.1 inside the shader.
      const effectiveAberration = spectralSpread * 10;

      const onScreen = orb.centerY - orb.radius < viewport.height;
      const orbVisible = orbPresence > 0.001 && onScreen && progress > 0.0001;

      // Pass 1 — the surfaces into the offscreen buffer.
      const swap = linearStep(
        progress,
        dialsRef.current.swapFrom,
        dialsRef.current.swapTo
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFramebuffer);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.disable(gl.BLEND);
      gl.useProgram(surfaceProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, documentTexture);
      gl.uniform1i(surfaceUniforms.document, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, chatTexture);
      gl.uniform1i(surfaceUniforms.chat, 1);
      gl.uniform2f(surfaceUniforms.resolution, viewportWidth, viewportHeight);
      gl.uniform1f(surfaceUniforms.documentHeight, documentHeightDevice);
      gl.uniform1f(surfaceUniforms.scroll, scrollCss * pixelRatio);
      gl.uniform1f(surfaceUniforms.swap, swap);
      // Inside the disc the page persists for as long as the orb does, then
      // catches up to the outside exactly as the orb dissolves. Tying it to
      // `orbPresence` rather than to progress is what stops the disc popping
      // from page to chat at the instant the glass disappears.
      gl.uniform1f(surfaceUniforms.swapInside, swap * (1 - orbPresence));
      // NOT flipped, unlike the glass pass. This pass writes the framebuffer
      // top-down — row 0 is the viewport TOP, which is the convention that lets
      // the imported glass shader be used verbatim — so a viewport y is already
      // a `gl_FragCoord.y` here. Flipping it puts the porthole at the mirrored
      // position and leaves page fragments floating opposite the orb.
      gl.uniform2f(
        surfaceUniforms.orbCentre,
        orb.centerX * pixelRatio,
        orb.centerY * pixelRatio
      );
      gl.uniform1f(surfaceUniforms.orbRadius, orb.radius * pixelRatio);
      gl.uniform1f(surfaceUniforms.porthole, orbVisible ? dial.porthole : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // The glass reads coarse mips for its blurred rim reflection, so the chain
      // has to be rebuilt every frame the surface moves.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.generateMipmap(gl.TEXTURE_2D);

      // Pass 2 — present that buffer to the screen.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.useProgram(presentProgram);
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.uniform1i(presentUniforms.scene, 0);
      gl.uniform2f(presentUniforms.resolution, viewportWidth, viewportHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Pass 3 — the orb, in the `uHasPage = 1` mode the real site cannot reach.
      if (orbVisible) {
        gl.enable(gl.BLEND);
        // The shader emits premultiplied `vec4(colour * mask, mask)`.
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(glassProgram);
        gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
        gl.uniform1i(glassUniforms.page, 0);

        const radiusDevice = orb.radius * pixelRatio;
        gl.uniform2f(glassUniforms.resolution, viewportWidth, viewportHeight);
        // The shader's y axis points up, the trajectory's points down.
        gl.uniform2f(
          glassUniforms.center,
          orb.centerX * pixelRatio,
          viewportHeight - orb.centerY * pixelRatio
        );
        gl.uniform2f(glassUniforms.half, radiusDevice, radiusDevice);
        gl.uniform1f(glassUniforms.corner, radiusDevice);
        gl.uniform1f(glassUniforms.edge, effectiveEdge);
        gl.uniform1f(glassUniforms.bevel, effectiveBevel);
        gl.uniform1f(glassUniforms.ior, dial.ior);
        // `refraction` is authored against the orb's own scale, so the optical
        // depth has to track the radius or the bend would vanish as it shrinks.
        gl.uniform1f(glassUniforms.depth, radiusDevice * refractionEnvelope * 0.5);
        gl.uniform1f(glassUniforms.aberration, effectiveAberration);
        gl.uniform1f(glassUniforms.reflect, dial.reflect * orbPresence);
        gl.uniform1f(glassUniforms.shine, dial.shine);
        gl.uniform1f(glassUniforms.zoom, dial.magnify);
        gl.uniform1f(glassUniforms.hasPage, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Pass 4 — the meniscus, the outer rim and the contact shadow, ON TOP of
        // the refracted content, exactly where `OrbSurface` sits in the DOM.
        gl.useProgram(orbSurfaceProgram);
        gl.uniform2f(
          orbSurfaceUniforms.center,
          orb.centerX * pixelRatio,
          viewportHeight - orb.centerY * pixelRatio
        );
        gl.uniform1f(orbSurfaceUniforms.radius, radiusDevice);
        // Floored so the hairline survives at the small end, where the fraction
        // of the radius would otherwise fall below a pixel and vanish entirely.
        gl.uniform1f(
          orbSurfaceUniforms.meniscus,
          Math.max(
            dial.meniscusFloorPx * pixelRatio,
            radiusDevice * dial.meniscusScale
          )
        );
        gl.uniform1f(orbSurfaceUniforms.meniscusAlpha, dial.meniscusAlpha);
        gl.uniform3fv(
          orbSurfaceUniforms.meniscusColour,
          hexToRgb(colour.meniscus)
        );
        gl.uniform1f(orbSurfaceUniforms.rimAlpha, dial.rimAlpha);
        gl.uniform1f(orbSurfaceUniforms.rimBlur, dial.rimBlur);
        gl.uniform3fv(orbSurfaceUniforms.rimColour, hexToRgb(colour.rim));
        gl.uniform1f(orbSurfaceUniforms.shadow, dial.shadow * orbPresence);
        gl.uniform1f(orbSurfaceUniforms.shadowDrop, dial.shadowDrop);
        gl.uniform1f(orbSurfaceUniforms.shadowBlur, dial.shadowBlur);
        gl.uniform3fv(orbSurfaceUniforms.shadowColour, hexToRgb(colour.shadow));
        gl.uniform1f(
          orbSurfaceUniforms.milk,
          dial.milk + (dial.milkSmall - dial.milk) * smallness
        );
        gl.uniform1f(orbSurfaceUniforms.presence, orbPresence);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.disable(gl.BLEND);
      }

      frameDurations.push(now - lastFrameTime);
      lastFrameTime = now;
      if (now - statsFlushedAt > 500 && frameDurations.length > 1) {
        const sorted = [...frameDurations].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        setStats({
          fps: Math.round(1000 / Math.max(median, 0.001)),
          medianFrameMs: Number(median.toFixed(1)),
          documentHeight: Math.round(documentHeightCss),
          pixelRatio,
          gesture:
            `pull ${Math.round(gestureBudget)}/${dial.threshold}` +
            ` · commit ${dial.commitRatio}`,
          optics:
            `bevel ${effectiveBevel.toFixed(1)}` +
            ` · edge ${effectiveEdge.toFixed(2)}` +
            ` · shoulder ${Math.round(
              (orbRadiusCssNow * (1 - effectiveEdge))
            )}px` +
            ` · aberr ${effectiveAberration.toFixed(2)}` +
            ` (×${chromaticGain.toFixed(2)})` +
            (chromaticClamped ? " CLAMPED" : ""),
          rasterizeMs,
          capture: captureSummary,
        });
        frameDurations.length = 0;
        statsFlushedAt = now;
      }
    };
    animationFrame = requestAnimationFrame(renderFrame);

    /**
     * The overscroll gesture, in the same shape `OverscrollController` uses:
     * scroll normally to the bottom, then further wheel accumulates a px budget
     * against `GESTURE_THRESHOLD`, and releasing past `COMMIT_RATIO` commits.
     */
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // The root layout wraps every route in `ScrollChatStage`, whose overscroll
      // controller watches window-level wheel events. This page never scrolls
      // the document, so that controller would read "already at the bottom" and
      // fire its own orb gesture over the top of the spike.
      event.stopPropagation();
      if (scrubRef.current !== null) return;

      const dial = dialsRef.current;
      const maxScrollCss = Math.max(
        0,
        (documentHeightDevice - viewportHeight) / pixelRatio
      );

      if (gesturePhase === "chat" || gesturePhase === "flying") {
        // Scrolling up out of the chat reverses the whole transition, flight
        // included — the orb comes back OUT of the chip rather than appearing
        // at the settle position.
        if (event.deltaY < 0) {
          gestureBudget = dial.threshold;
          beginRewind(1, gesturePhase === "chat" ? 1 : flyValue);
        }
        return;
      }

      if (gesturePhase === "holding") {
        window.clearTimeout(holdTimer);
        if (event.deltaY < 0) {
          // Abandoning the pull mid-hold falls back gracefully rather than
          // snapping the orb to nothing.
          beginRewind(Math.min(1, gestureBudget / dial.threshold), 0);
          return;
        }
        // A pull that resumes inside the window continues from the SAME
        // budget. That is the entire point of the hold: hesitating must not
        // cost the visitor the climb they already made.
        setPhaseState("pulling");
      }

      const atBottom = scrollCss >= maxScrollCss - 1;
      if (!atBottom || event.deltaY < 0) {
        // Only PAGE scrolling is scaled. The pull below accumulates raw wheel
        // pixels, so `threshold` keeps meaning the same physical gesture no
        // matter how fast the page itself is set to move.
        scrollCss = Math.min(
          Math.max(scrollCss + event.deltaY * dial.scrollSpeed, 0),
          maxScrollCss
        );
        if (event.deltaY < 0) gestureBudget = 0;
        return;
      }

      gestureBudget = Math.min(dial.threshold, gestureBudget + event.deltaY);
      setPhaseState("pulling");

      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        if (gesturePhase !== "pulling") return;
        const pull = gestureBudget / dial.threshold;
        if (pull >= dial.commitRatio) {
          animationFrom = 0;
          animationStartedAt = performance.now();
          setPhaseState("flying");
          return;
        }
        // Below the commit ratio the pull is not abandoned yet — it rests
        // where it was left for `hold` ms, and only then springs back.
        setPhaseState("holding");
        window.clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          if (gesturePhase !== "holding") return;
          beginRewind(Math.min(1, gestureBudget / dial.threshold), 0);
        }, dial.hold);
      }, dial.releaseMs);
    };

    const reset = () => {
      window.clearTimeout(releaseTimer);
      window.clearTimeout(holdTimer);
      gestureBudget = 0;
      flyValue = 0;
      scrollCss = 0;
      setPhaseState("idle");
    };
    resetRef.current = reset;

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => void rebuildSurfaces(), RESIZE_DEBOUNCE_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !animationFrame) {
        lastFrameTime = performance.now();
        animationFrame = requestAnimationFrame(renderFrame);
      } else if (document.visibilityState !== "visible") {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      setError("WebGL context lost — the whole page went with it.");
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(resizeTimer);
      window.clearTimeout(releaseTimer);
      window.clearTimeout(holdTimer);
      resetRef.current = null;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("wheel", onWheel);
      gl.deleteTexture(documentTexture);
      gl.deleteTexture(chatTexture);
      gl.deleteTexture(sceneTexture);
      gl.deleteFramebuffer(sceneFramebuffer);
      gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(surfaceProgram);
      gl.deleteProgram(presentProgram);
      gl.deleteProgram(glassProgram);
      gl.deleteProgram(orbSurfaceProgram);
    };
  }, []);

  const phaseLabel = useMemo(
    () =>
      scrubTimeline !== null
        ? `scrubbing ${(scrubTimeline * 100).toFixed(0)}%`
        : phase,
    [phase, scrubTimeline]
  );

  return (
    // The z-index clears the root layout's dev dials, custom cursor and chat
    // chip, which are siblings of this route and would otherwise cover it.
    <div className="fixed inset-0 z-[10000] overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-hidden
      />

      {error && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-foreground">
          {error}
        </div>
      )}

      <div className="absolute left-4 top-4 w-64 rounded-xl border border-border bg-background/80 p-3 font-mono text-[11px] leading-relaxed text-foreground backdrop-blur">
        <div className="mb-2 font-semibold">WebGL page spike</div>
        {status ? (
          <div className="mb-3 text-muted">{status}</div>
        ) : stats ? (
          <div className="mb-3 space-y-0.5 text-muted">
            <div>
              {stats.fps} fps · {stats.medianFrameMs} ms median
            </div>
            <div>
              doc {stats.documentHeight}px · dpr {stats.pixelRatio}
            </div>
            <div>{stats.gesture}</div>
            <div>{stats.optics}</div>
            <div>rasterize {stats.rasterizeMs} ms (once)</div>
            <div>{stats.capture}</div>
            <div>phase: {phaseLabel}</div>
          </div>
        ) : (
          <div className="mb-3 text-muted">measuring…</div>
        )}

        <label className="mb-1.5 block">
          <span className="flex justify-between text-muted">
            <span>timeline</span>
            <span>{scrubTimeline === null ? "live" : scrubTimeline.toFixed(2)}</span>
          </span>
          <input
            className="w-full"
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={scrubTimeline ?? 0}
            onChange={(event) => setScrubTimeline(Number(event.target.value))}
          />
        </label>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded border border-border px-2 py-1 hover:bg-foreground/5"
            onClick={onReplay}
          >
            scrub
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 hover:bg-foreground/5"
            onClick={() => {
              setScrubTimeline(null);
              resetRef.current?.();
            }}
          >
            live
          </button>
        </div>

        <p className="mt-2 text-muted">
          Scroll to the bottom, then keep scrolling to pull the orb up.
        </p>
      </div>

      <div className="absolute right-4 top-4">
        <OrbDialPanel
          values={dials}
          colours={colours}
          onChange={(key, value) =>
            setDials((current) => ({ ...current, [key]: value }))
          }
          onColourChange={(key, value) =>
            setColours((current) => ({ ...current, [key]: value }))
          }
          onReset={() => {
            setDials(ORB_DIAL_DEFAULTS);
            setColours(ORB_COLOUR_DEFAULTS);
          }}
        />
      </div>
    </div>
  );
}
