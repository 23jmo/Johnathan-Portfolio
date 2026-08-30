"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { FRAGMENT_SHADER, VERTEX_SHADER } from "./LiquidGlassCanvas";
import { resolveOrbOptics, ORB_GLASS_OPTICS } from "@/lib/scrollchat/orbGlassOptics";
import type { LiveCapture } from "@/lib/scrollchat/liveSurfaceCapture";

/**
 * The transition, rendered in WebGL over the resting DOM page.
 *
 * This is the transient hybrid: while the gesture runs, the viewport is the
 * `/webgl-page` spike — an opaque, fully shader-composed frame. The moment it
 * ends the canvas unmounts and the page is ordinary DOM again, selectable and
 * focusable and findable, with live Spotify and live YouTube. Nothing about the
 * resting page is a texture.
 *
 * It composes the whole frame rather than only the orb because of ONE property
 * the DOM cannot express: the crossfade from page to chat is PER-PIXEL. The orb
 * is a porthole — the chat fills in around it while the disc goes on holding the
 * page, and only catches up as the orb dissolves. CSS `opacity` fades a whole
 * element, including the part behind the glass, so an orb over a DOM crossfade
 * refracts a page that is busy disappearing. That reads as the page fading out
 * from under the orb instead of the orb swallowing it, and no amount of tuning
 * recovers it, because the information the shader needs (both images, at full
 * strength, at the same instant) is gone by the time the orb samples it.
 *
 * Three passes, which is the spike's structure unchanged:
 *
 *   1. SURFACE, into an offscreen framebuffer — mix the page and chat captures
 *      with the porthole mask.
 *   2. PRESENT — blit that buffer to the screen.
 *   3. GLASS — the orb, sampling the buffer as a texture, blended on top.
 *
 * The framebuffer is what pass 3 needs: the glass shader refracts by SAMPLING
 * the composed scene, and it cannot read the framebuffer it is drawing into.
 * That indirection is also what lets pass 3 use `LiquidGlassCanvas`'s shader
 * completely unmodified, in the `uHasPage = 1` mode the site could never reach
 * before.
 */

/**
 * Mix the two captures, holding the page inside the orb.
 *
 * Adapted from the spike in exactly one way: there the page texture is the whole
 * document at a synthetic 4000px viewport, so it samples by document offset.
 * Here the page is held still for the length of the gesture and the capture is
 * one viewport band, so a plain viewport UV is both correct and cheaper.
 */
const SURFACE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uPageTex;
uniform sampler2D uChatTex;
uniform vec2  uResolution;   // viewport, device pixels
uniform float uSwap;         // 0 = page, 1 = chat, OUTSIDE the orb
uniform float uSwapInside;   // the same, for the disc
uniform vec2  uOrbCentre;    // device pixels, y DOWN (see the note in the pass)
uniform float uOrbRadius;    // device pixels
uniform float uPorthole;     // 0 = one global crossfade, 1 = porthole

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 page = texture(uPageTex, uv).rgb;
  vec3 chat = texture(uChatTex, uv).rgb;

  // Per-pixel rather than global, so the disc can hold the page while the chat
  // has already filled in around it. One texel of feather is all the boundary
  // needs: the glass drawn on top covers it, and a softer edge would read as a
  // halo rather than as a rim.
  float insideOrb = 1.0 - smoothstep(
    uOrbRadius - 1.0, uOrbRadius + 1.0, length(gl_FragCoord.xy - uOrbCentre));
  float swap = mix(uSwap, uSwapInside, insideOrb * clamp(uPorthole, 0.0, 1.0));

  fragColor = vec4(mix(page, chat, clamp(swap, 0.0, 1.0)), 1.0);
}`;

const PRESENT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2 uResolution;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  fragColor = textureLod(uScene, vec2(uv.x, 1.0 - uv.y), 0.0);
}`;

interface OrbSceneCanvasProps {
  /** The photographs to compose. Must match the current viewport and offset. */
  capture: LiveCapture;
  /** Lens centre in CSS pixels, relative to the viewport. */
  center: { x: number; y: number };
  /** Lens radius in CSS pixels. */
  radius: number;
  /** How present the orb is, 0..1. Drives both the reflection and the porthole. */
  presence: number;
  /** The page-to-chat crossfade OUTSIDE the orb, 0..1. */
  swap: number;
  /** What the orb's radii are fractions of. See `orbSizeUnit`. */
  sizeUnit: number;
  /** Overall bend strength, from `OrbTuning`. */
  refraction: number;
  /** How much of that bend survives the shrink, from `OrbTuning`. */
  smallBoost: number;
  /**
   * Called when this path cannot be used after all — no WebGL2, a major
   * performance caveat, a failed compile, or a lost context.
   *
   * MUST be referentially stable: this component re-renders on every frame of
   * the gesture and both effects depend on it, so a callback re-created per
   * render would tear the GL context down and rebuild it sixty times a second.
   *
   * Always a fall back to the SVG filter rather than a degraded transition.
   * Every one of those conditions is routine — hardware acceleration switched
   * off is a plain Chrome setting, and context loss happens under GPU pressure
   * — and on every one of them the SVG path is not a consolation prize, it is
   * the path the look was originally tuned on.
   */
  onUnavailable: (reason: string) => void;
}

interface Pass {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

/** Everything the GL context owns, torn down together. */
interface SceneContext {
  gl: WebGL2RenderingContext;
  surface: Pass;
  present: Pass;
  glass: Pass;
  pageTexture: WebGLTexture;
  chatTexture: WebGLTexture;
  /** The composed frame, and the thing the glass pass refracts. */
  sceneTexture: WebGLTexture;
  sceneFramebuffer: WebGLFramebuffer;
  quad: WebGLBuffer;
  /** The capture already uploaded, so a re-render does not re-upload it. */
  uploaded: LiveCapture | null;
  /** The size `sceneTexture` was last allocated at. */
  sceneWidth: number;
  sceneHeight: number;
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
    throw new Error(`Orb shader compile failed: ${log}`);
  }
  return shader;
}

function linkPass(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
  names: readonly string[]
): Pass {
  const program = gl.createProgram()!;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Orb program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  // Attached shaders are reference-counted, so the program now holds the only
  // reference and they die with it.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

const SURFACE_UNIFORMS = [
  "uPageTex",
  "uChatTex",
  "uResolution",
  "uSwap",
  "uSwapInside",
  "uOrbCentre",
  "uOrbRadius",
  "uPorthole",
] as const;

const PRESENT_UNIFORMS = ["uScene", "uResolution"] as const;

const GLASS_UNIFORMS = [
  "uPage",
  "uResolution",
  "uCenter",
  "uHalf",
  "uCorner",
  "uEdge",
  "uBevel",
  "uIor",
  "uDepth",
  "uAberration",
  "uReflect",
  "uShine",
  "uZoom",
  "uHasPage",
] as const;

/** A capture texture: sampled 1:1, so no mip chain and nothing to rebuild. */
function createCaptureTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createSceneContext(canvas: HTMLCanvasElement): SceneContext {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    // Refuse a software rasterizer. A displacement-per-wavelength shader on a
    // CPU rasterizer is a slideshow, and the SVG path is strictly the better
    // transition on those machines.
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) throw new Error("No WebGL2 context for the orb.");

  const surface = linkPass(gl, SURFACE_FRAGMENT_SHADER, SURFACE_UNIFORMS);
  const present = linkPass(gl, PRESENT_FRAGMENT_SHADER, PRESENT_UNIFORMS);
  const glass = linkPass(gl, FRAGMENT_SHADER, GLASS_UNIFORMS);

  const pageTexture = createCaptureTexture(gl);
  const chatTexture = createCaptureTexture(gl);

  const sceneTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  // The scene texture DOES need mips: the glass reads a coarse level for its
  // blurred rim reflection, and `pageAA` picks a level from the sample
  // footprint. Without a chain every one of those `textureLod` calls returns
  // black and the orb comes out ringed in darkness.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const sceneFramebuffer = gl.createFramebuffer()!;

  /*
   * One oversized triangle covering clip space.
   *
   * Every pass runs off `gl_FragCoord`, so this is all the geometry the scene
   * needs — but it still has to be REAL geometry. The vertex shader reads an
   * `in vec2 position` attribute rather than deriving corners from
   * `gl_VertexID`, so drawing without a bound buffer hands it the default
   * attribute value (0, 0) for all three vertices: a degenerate triangle. The
   * draw SUCCEEDS, no pixels are produced, and the result is indistinguishable
   * from a working scene that happens to be off screen.
   */
  gl.bindVertexArray(gl.createVertexArray());
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  // The three programs are compiled from the same vertex shader, so `position`
  // may land on a different index in each; every one has to be pointed at the
  // buffer.
  for (const pass of [surface, present, glass]) {
    const location = gl.getAttribLocation(pass.program, "position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }

  return {
    gl,
    surface,
    present,
    glass,
    pageTexture,
    chatTexture,
    sceneTexture,
    sceneFramebuffer,
    quad,
    uploaded: null,
    sceneWidth: 0,
    sceneHeight: 0,
  };
}

export default function OrbSceneCanvas({
  capture,
  center,
  radius,
  presence,
  swap,
  sizeUnit,
  refraction,
  smallBoost,
  onUnavailable,
}: OrbSceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<SceneContext | null>(null);

  const teardown = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    contextRef.current = null;
    const { gl } = context;
    gl.deleteTexture(context.pageTexture);
    gl.deleteTexture(context.chatTexture);
    gl.deleteTexture(context.sceneTexture);
    gl.deleteFramebuffer(context.sceneFramebuffer);
    gl.deleteBuffer(context.quad);
    for (const pass of [context.surface, context.present, context.glass]) {
      gl.deleteProgram(pass.program);
    }
    /*
     * Deliberately NOT `WEBGL_lose_context.loseContext()`.
     *
     * Forcing the loss frees the drawing buffer sooner, but the resulting
     * `webglcontextlost` event is QUEUED, not dispatched synchronously — so it
     * arrives after this cleanup has finished, and a component that unmounts
     * and immediately re-mounts on the same canvas (which is exactly what React
     * Strict Mode does on every mount in development) has already re-attached
     * its listener by then. The teardown's own event then lands on the new
     * instance and reports the context as lost, which is how a perfectly
     * healthy GPU ends up permanently on the fallback path. Worse, a canvas
     * whose context was force-lost hands the SAME dead context back to the next
     * `getContext` call, so the re-mount cannot recover either.
     *
     * There is only ever one of these on screen and it is unmounted the moment
     * the gesture ends, so its context is collected with the canvas element and
     * nothing accumulates toward the per-document cap.
     */
  }, []);

  // Context loss is routine under GPU pressure and tab eviction, not exotic.
  // Handing the frame back to the SVG path is the whole recovery.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onLost = (event: Event) => {
      event.preventDefault();
      // A loss arriving when we hold no context is one we caused by tearing
      // down, not one the GPU inflicted. A genuine loss always interrupts a
      // live context.
      if (!contextRef.current) return;
      contextRef.current = null;
      onUnavailable("context lost");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      teardown();
    };
  }, [teardown, onUnavailable]);

  /*
   * One draw per render, in a layout effect.
   *
   * Deliberately NOT a `requestAnimationFrame` loop. `OrbWarp` already
   * re-renders on every frame of the gesture and owns the trajectory, so a loop
   * here would either duplicate that clock or drift against it — and a loop
   * that redraws when nothing moved is pure waste, because outside the gesture
   * this component is not mounted at all. A layout effect also runs before
   * paint, so the scene and the DOM material drawn over it land in the same
   * frame instead of the glass trailing its own rim by one.
   */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!contextRef.current) {
      try {
        contextRef.current = createSceneContext(canvas);
      } catch (error: unknown) {
        onUnavailable(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    const context = contextRef.current;
    const { gl } = context;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const viewportWidth = Math.round(
      document.documentElement.clientWidth * pixelRatio
    );
    const viewportHeight = Math.round(window.innerHeight * pixelRatio);
    if (canvas.width !== viewportWidth || canvas.height !== viewportHeight) {
      canvas.width = viewportWidth;
      canvas.height = viewportHeight;
    }

    // (Re)allocate the offscreen colour buffer whenever the viewport changes.
    if (
      context.sceneWidth !== viewportWidth ||
      context.sceneHeight !== viewportHeight
    ) {
      gl.bindTexture(gl.TEXTURE_2D, context.sceneTexture);
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
      gl.bindFramebuffer(gl.FRAMEBUFFER, context.sceneFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        context.sceneTexture,
        0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      context.sceneWidth = viewportWidth;
      context.sceneHeight = viewportHeight;
    }

    if (context.uploaded !== capture) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, context.pageTexture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
        capture.page.canvas
      );
      if (capture.chat) {
        gl.bindTexture(gl.TEXTURE_2D, context.chatTexture);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
          capture.chat.canvas
        );
      }
      context.uploaded = capture;
    }

    const radiusDevice = radius * pixelRatio;

    // Pass 1 — compose the page and the chat into the offscreen buffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, context.sceneFramebuffer);
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(context.surface.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, context.pageTexture);
    gl.uniform1i(context.surface.uniforms.uPageTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, context.chatTexture);
    gl.uniform1i(context.surface.uniforms.uChatTex, 1);
    gl.uniform2f(context.surface.uniforms.uResolution, viewportWidth, viewportHeight);
    gl.uniform1f(context.surface.uniforms.uSwap, swap);
    // Inside the disc the page persists for as long as the orb does, then
    // catches up to the outside exactly as the orb dissolves. Tying it to
    // `presence` rather than to progress is what stops the disc popping from
    // page to chat at the instant the glass disappears.
    gl.uniform1f(context.surface.uniforms.uSwapInside, swap * (1 - presence));
    // NOT flipped, unlike the glass pass. This pass writes the framebuffer
    // top-down — row 0 is the viewport TOP, which is the convention that lets
    // the imported glass shader be used verbatim — so a viewport y is already a
    // `gl_FragCoord.y` here. Flipping it puts the porthole at the mirrored
    // position and leaves page fragments floating opposite the orb.
    gl.uniform2f(
      context.surface.uniforms.uOrbCentre,
      center.x * pixelRatio,
      center.y * pixelRatio
    );
    gl.uniform1f(context.surface.uniforms.uOrbRadius, radiusDevice);
    // No chat capture means nothing to cross into, so the porthole is moot and
    // the surface is just the page.
    gl.uniform1f(context.surface.uniforms.uPorthole, capture.chat ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // The glass reads coarse mips for its blurred rim reflection, so the chain
    // has to be rebuilt every frame the surface moves.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, context.sceneTexture);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Pass 2 — present that buffer to the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    gl.useProgram(context.present.program);
    gl.bindTexture(gl.TEXTURE_2D, context.sceneTexture);
    gl.uniform1i(context.present.uniforms.uScene, 0);
    gl.uniform2f(context.present.uniforms.uResolution, viewportWidth, viewportHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 3 — the orb, refracting the composed scene.
    gl.enable(gl.BLEND);
    // The glass shader emits premultiplied `vec4(colour * mask, mask)`.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(context.glass.program);
    gl.bindTexture(gl.TEXTURE_2D, context.sceneTexture);
    gl.uniform1i(context.glass.uniforms.uPage, 0);

    const optics = resolveOrbOptics(
      radius,
      sizeUnit,
      refraction,
      smallBoost,
      pixelRatio
    );
    gl.uniform2f(context.glass.uniforms.uResolution, viewportWidth, viewportHeight);
    // The glass shader's y axis points up; the orb's trajectory is in CSS
    // pixels, whose y points down.
    gl.uniform2f(
      context.glass.uniforms.uCenter,
      center.x * pixelRatio,
      viewportHeight - center.y * pixelRatio
    );
    gl.uniform2f(context.glass.uniforms.uHalf, radiusDevice, radiusDevice);
    // A circle is the square SDF with the corner radius run all the way out.
    gl.uniform1f(context.glass.uniforms.uCorner, radiusDevice);
    gl.uniform1f(context.glass.uniforms.uEdge, optics.edge);
    gl.uniform1f(context.glass.uniforms.uBevel, optics.bevel);
    gl.uniform1f(context.glass.uniforms.uIor, ORB_GLASS_OPTICS.ior);
    gl.uniform1f(context.glass.uniforms.uDepth, optics.depth);
    gl.uniform1f(context.glass.uniforms.uAberration, optics.aberration);
    gl.uniform1f(context.glass.uniforms.uReflect, ORB_GLASS_OPTICS.reflect * presence);
    gl.uniform1f(context.glass.uniforms.uShine, ORB_GLASS_OPTICS.shine);
    gl.uniform1f(context.glass.uniforms.uZoom, ORB_GLASS_OPTICS.magnify);
    gl.uniform1f(context.glass.uniforms.uHasPage, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, [
    capture,
    center,
    radius,
    presence,
    swap,
    sizeUnit,
    refraction,
    smallBoost,
    onUnavailable,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        /*
         * Above the page and the chat, both of which it is now standing in for,
         * and below the orb's material at 9997 — the meniscus, rim and contact
         * shadow are properties of the GLASS rather than of what is behind it,
         * so they stay in the DOM and draw over this exactly as they draw over
         * the SVG path's output.
         */
        zIndex: 9996,
        pointerEvents: "none",
      }}
    />
  );
}
