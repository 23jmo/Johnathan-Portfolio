"use client";

import { useEffect, useId, useRef, useState } from "react";
import LiquidGlassCanvas from "@/components/scrollchat/LiquidGlassCanvas";
import Glass from "@/components/canvasui/Glass";
import RefractionFilter from "@/components/scrollchat/GlassRefractionFilter";

/**
 * Scratch page for the liquid glass stack. Not linked from anywhere — it exists
 * so the two layers can be judged against real page content, separately and
 * together, before any of it goes near the homepage.
 *
 * The three panels are the whole argument:
 *   1. refraction only  — the SVG feDisplacementMap, which is what PageWarp
 *      already ships and what works in every browser.
 *   2. reflection only  — the WebGL Fresnel rim over untouched content. Needs
 *      no page pixels at all, so it also works everywhere today.
 *   3. both             — the stack. This is the look.
 */

const SPHERE_RADIUS = 120;

function DemoContent() {
  return (
    <div
      style={{
        padding: 28,
        background: "#ffffff",
        font: "16px/1.6 system-ui",
        color: "#111",
      }}
    >
      <h2 style={{ font: "700 30px system-ui", margin: "0 0 10px" }}>
        Hi, I&apos;m Johnathan Mo
      </h2>
      <p style={{ margin: "0 0 14px" }}>
        CS student at Columbia. This paragraph exists so there is real text under
        the glass — text is the honest test, because refraction that looks fine
        over a photo falls apart over type.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"].map((color) => (
          <div
            key={color}
            style={{ flex: 1, height: 76, borderRadius: 10, background: color }}
          />
        ))}
      </div>
      <p style={{ margin: 0, color: "#666", font: "13px/1.6 system-ui" }}>
        Saturated blocks next to fine text: the blocks show whether the chromatic
        spread reads as a spectrum, the text shows whether the centre stays
        optically clean.
      </p>
    </div>
  );
}

/**
 * One comparison panel.
 *
 * The offset comes from the page rather than from this panel's own listener, so
 * whichever panel the pointer is over drives all three and the sphere sits at
 * the same place inside each. Without that, moving the pointer into panel 2
 * puts panels 1 and 3's spheres off their own boxes entirely.
 */
function Panel({
  label,
  refract,
  reflect,
  offset,
  onOffset,
}: {
  label: string;
  refract: boolean;
  reflect: boolean;
  offset: { x: number; y: number };
  onOffset: (next: { x: number; y: number }) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // React's useId returns colon-wrapped ids (":r3:"), which are illegal in a
  // CSS url(#...) reference. CSS.escape would fix it in the browser, but this is
  // a client component and Next still renders it on the SERVER, where there is
  // no CSS global at all — so escaping at use time throws a ReferenceError
  // during SSR and the whole route 500s. Sanitising the id itself works in both
  // places, and the same value goes on the <filter id> so they still match.
  const filterId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    // A ResizeObserver rather than a measurement in the effect body: its
    // callback is asynchronous, so the setState it makes is not the cascading
    // render the React Compiler lint rejects.
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect) return;
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const inside =
        local.x >= 0 && local.y >= 0 && local.x <= rect.width && local.y <= rect.height;
      if (inside) onOffset(local);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [onOffset]);

  const body = (
    <div
      style={{ filter: refract ? `url(#${filterId})` : undefined }}
    >
      <DemoContent />
    </div>
  );

  return (
    <section>
      <h2
        style={{
          font: "600 12px ui-monospace, monospace",
          color: "#666",
          margin: "0 0 6px",
        }}
      >
        {label}
      </h2>
      <div ref={boxRef}>
        {refract && (
          <RefractionFilter
            id={filterId}
            center={offset}
            radius={SPHERE_RADIUS}
            box={box}
          />
        )}
        {reflect ? (
          <LiquidGlassCanvas
            center={offset}
            size={SPHERE_RADIUS}
            // Canvas UI's docs-demo configuration, so this is a like-for-like
            // comparison rather than a differently-tuned lens.
            ior={1.5}
            edge={0.7}
            bevel={4}
            depth={250}
            aberration={1}
            reflection={1}
            shine={0.01}
          >
            {body}
          </LiquidGlassCanvas>
        ) : (
          <div style={{ position: "relative", isolation: "isolate" }}>{body}</div>
        )}
      </div>
    </section>
  );
}

/**
 * Canvas UI's own component, dropped in unmodified from the published source
 * (only `rect-cache`, which their snippet imports but does not include, is
 * ours). It tracks the pointer itself and sizes its content to the box, so it
 * needs an explicit height rather than the intrinsic one the other panels use.
 */
function CanvasUiPanel() {
  return (
    <section>
      <h2
        style={{
          font: "600 12px ui-monospace, monospace",
          color: "#666",
          margin: "0 0 6px",
        }}
      >
        4 · Canvas UI &lt;Glass&gt;, verbatim
      </h2>
      <Glass
        size={120}
        aspect={1.7}
        corner={32}
        ior={1.5}
        edge={0.7}
        bevel={4}
        depth={250}
        aberration={1}
        blur={0}
        reflection={1}
        shine={0.01}
        zoom={1.5}
        follow={0.2}
        shape="circle"
        targets="h1, h2, h3, a, button, code"
        style={{ height: 344 }}
      >
        <DemoContent />
      </Glass>
    </section>
  );
}

const PANELS = [
  { label: "1 · refraction only (SVG, ships today)", refract: true, reflect: false },
  { label: "2 · reflection only (WebGL Fresnel rim)", refract: false, reflect: true },
  { label: "3 · both — the stack", refract: true, reflect: true },
];

export default function GlassDemoPage() {
  const modeRef = useRef<HTMLParagraphElement>(null);
  const [offset, setOffset] = useState({ x: 320, y: 150 });

  // Written through a ref rather than held in state: it is a one-shot debug
  // readout, and a ref write keeps it out of the render cycle entirely.
  useEffect(() => {
    const gl = document.createElement("canvas").getContext("webgl2", {
      failIfMajorPerformanceCaveat: true,
    });
    const label = !gl
      ? "none (no webgl2 / software raster)"
      : typeof (gl as unknown as { texElementImage2D?: unknown })
            .texElementImage2D === "function"
        ? "texElement (gl.texElementImage2D — shader refracts the real DOM)"
        : typeof (document.createElement("canvas").getContext("2d") as unknown as { drawElementImage?: unknown })
              .drawElementImage === "function"
          ? "drawElement (ctx.drawElementImage — shader refracts the real DOM)"
          : "overlay (no HTML-in-Canvas — reflection only, refraction from SVG)";
    if (modeRef.current) modeRef.current.textContent = `mode: ${label}`;
  }, []);

  return (
    <main style={{ padding: 24, background: "#f2f3f5", minHeight: "100vh" }}>
      <h1 style={{ font: "600 20px system-ui", margin: "0 0 4px" }}>
        Liquid glass stack
      </h1>
      <p
        ref={modeRef}
        data-glass-mode
        style={{
          font: "13px ui-monospace, monospace",
          color: "#555",
          margin: "0 0 20px",
        }}
      >
        mode: detecting
      </p>

      <div style={{ display: "grid", gap: 24, maxWidth: 860 }}>
        {PANELS.map((panel) => (
          <Panel
            key={panel.label}
            {...panel}
            offset={offset}
            onOffset={setOffset}
          />
        ))}
        <CanvasUiPanel />
      </div>
    </main>
  );
}
