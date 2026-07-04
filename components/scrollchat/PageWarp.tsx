"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useScrollChat } from "./ScrollChatProvider";
import ChatFooter from "./ChatFooter";
import { CHIP_DIAMETER, CHIP_CENTER_FROM_BOTTOM } from "@/lib/scrollchat/chip";

/**
 * Warps the live page into the chat as the visitor pulls past the bottom. The
 * AI chat is a STATIONARY full-screen layer that lives BEHIND the page
 * (`ChatFooter`); the page is the only thing that moves — it dissolves away to
 * reveal the chat already sitting behind it, then becomes the chip:
 *
 *   1. FISHEYE — an SVG `feDisplacementMap` bulges the bottom viewport like a
 *      lens while you pull.
 *   2. COLLAPSE — the page folds into a shrinking `clip-path: circle()`. As the
 *      circle shrinks, the black chat behind shows through more and more — the
 *      page "dissolves into the background". At commit, `progress` springs to 1
 *      so the circle completes ("teleport into a full circle").
 *   3. FLY — driven by the separate `fly` value (animated AFTER `progress`
 *      reaches 1), the COMPLETE circle — which is the real warped page — springs
 *      down and shrinks into the chip slot above the input. The chip IS the
 *      warped home screen, not a placeholder.
 *
 * Everything is driven IMPERATIVELY off the `progress` + `fly` MotionValues so a
 * single `clearStyles()` guarantees a pristine teardown the instant both return
 * to rest — closing the chat never leaves the page "cooked".
 *
 * IMPORTANT: `filter`/`transform`/`clip-path` change stacking + re-base
 * `position:fixed` descendants, so at rest we apply NOTHING (styles fully
 * cleared), and `url(#missing)` is never referenced (it renders invisible).
 */

/**
 * Peak displacement in px at the warp's apex. NEGATIVE = convex bulge (magnifies
 * the center — the classic fisheye); flip to positive for a concave pinch.
 */
const FISHEYE_STRENGTH = -90;

/** How far the page rubber-band-lifts at full pull, as a fraction of viewport. */
const LIFT_FRACTION = 0.42;
/** The completed circle's radius (px) right before it flies off as the chip. */
const CIRCLE_MIN_RADIUS = 66;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Build a radial displacement map: neutral gray edges → outward bulge at center. */
function buildFisheyeMap(regionW: number, regionH: number): string {
  const dw = Math.max(8, Math.round(regionW / 6));
  const dh = Math.max(8, Math.round(regionH / 6));
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(dw, dh);
  const cx = dw / 2;
  const cy = dh / 2;
  const radius = Math.min(dw, dh) * 0.5;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const rr = dist / radius; // 0 at center → 1 at the inscribed edge
      let r = 128;
      let g = 128;
      if (dist > 0 && rr < 1) {
        // sin profile: 0 at center AND edge, peak mid — neutral region edges
        // (seamless) while bulging the middle outward radially.
        const mag = Math.sin(rr * Math.PI);
        const ux = dx / dist;
        const uy = dy / dist;
        r = 128 + ux * mag * 127;
        g = 128 + uy * mag * 127;
      }
      const i = (y * dw + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, Math.round(r)));
      img.data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function PageWarp({ children }: { children: ReactNode }) {
  const { progress, fly, phase, reducedMotion } = useScrollChat();
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  // Latest clearStyles from the warp effect, callable by the phase failsafe.
  const clearStylesRef = useRef<(() => void) | null>(null);
  // Mirror of `region` readable inside the imperative warp loop without it
  // becoming a hook dependency (the loop runs on every progress frame).
  const regionRef = useRef<Region | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [mapUri, setMapUri] = useState("");

  // Measure the bottom-viewport filter region and (re)build the matching map.
  const recompute = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const fullH = el.scrollHeight;
    const vh = window.innerHeight;
    const h = Math.min(vh, fullH);
    const y = Math.max(0, fullH - h);
    const next = { x: 0, y, w, h };
    regionRef.current = next;
    setRegion(next);
    setMapUri(buildFisheyeMap(w, h));
  };

  // Keep the filter def present + sized to the current page.
  useEffect(() => {
    if (reducedMotion) return;
    recompute();
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reducedMotion, pathname]);

  // Drive the warp straight from progress + fly; clear ALL inline styles at rest
  // so exiting the chat restores a pristine page.
  //
  // Perf: the page is scroll-locked / wheel-prevented for the whole gesture, so
  // the viewport, scroll position, and the chip landing slot can't move — we
  // cache them ONCE on "engage" (the first applied frame) and keep the per-frame
  // apply() free of forced layout reads. A single rAF coalesces the two
  // MotionValue subscriptions so apply() runs at most once per browser frame
  // (progress + fly otherwise both fire → apply twice). And the full-page
  // fisheye filter — the dominant cost — is REMOVED (string cleared, not just
  // zeroed) the instant its bulge is imperceptible, so Blink drops the filter
  // layer instead of rasterizing every page pixel through the shader each frame.
  useEffect(() => {
    if (reducedMotion) return;
    let applied = false;

    // Per-gesture cache, (re)populated by engage() on the first applied frame.
    let vh = 0;
    let vw = 0;
    let cx = 0;
    let cyDoc = 0;
    let rMax = 0;
    let hasDef = false;
    let target = { cx: 0, cy: 0, d: CHIP_DIAMETER };

    const engage = () => {
      vh = window.innerHeight;
      vw = window.innerWidth;
      const reg = regionRef.current;
      cx = reg ? reg.w / 2 : vw / 2;
      cyDoc = window.scrollY + vh / 2;
      rMax = (Math.hypot(cx * 2, vh) / 2) * 1.25;
      hasDef = !!document.getElementById("scrollchat-fisheye");

      // Land the flying circle exactly on the in-input chip slot. Measured ONCE
      // here (the slot is stationary during the gesture); fall back to a fixed
      // slot if the chip isn't mounted (e.g. the name gate is showing).
      const chipEl = document.querySelector<HTMLElement>("[data-chat-chip]");
      if (chipEl) {
        const cr = chipEl.getBoundingClientRect();
        target = {
          cx: cr.left + cr.width / 2,
          cy: cr.top + cr.height / 2,
          d: cr.width,
        };
      } else {
        target = {
          cx: vw / 2,
          cy: vh - CHIP_CENTER_FROM_BOTTOM,
          d: CHIP_DIAMETER,
        };
      }

      // Styles that never change during a gesture — set once here (cleared in
      // clearStyles), not rewritten every frame. The page MUST be opaque so it
      // occludes the chat behind it; its bg normally lives on <body> (which the
      // lift doesn't move), so we paint it onto the clip layer for the warp.
      const k = clipRef.current;
      if (k) {
        k.style.background = "var(--background)";
        k.style.position = "relative";
        k.style.zIndex = "9996";
        k.style.pointerEvents = "none";
        k.style.willChange = "transform, clip-path";
      }
    };

    const clearStyles = () => {
      const c = contentRef.current;
      const k = clipRef.current;
      if (c) {
        c.style.transform = "";
        c.style.transformOrigin = "";
        c.style.filter = "";
        c.style.willChange = "";
      }
      if (k) {
        k.style.clipPath = "";
        k.style.opacity = "";
        k.style.position = "";
        k.style.zIndex = "";
        k.style.pointerEvents = "";
        k.style.transform = "";
        k.style.transformOrigin = "";
        k.style.willChange = "";
        k.style.background = "";
        k.style.removeProperty("mask-image");
        k.style.removeProperty("-webkit-mask-image");
      }
      applied = false;
    };

    const apply = (p: number, f: number) => {
      const c = contentRef.current;
      const k = clipRef.current;
      const d = dispRef.current;
      if (!c || !k) return;
      if (!applied) engage();

      // PULL — rubber-band lift: concave (1−(1−p)²) so each unit of scroll lifts
      // the page LESS than the last (elastic overscroll, "hard to scroll up"),
      // sliding the page up to reveal the stationary chat in the gap at bottom.
      const liftEase = 1 - (1 - p) * (1 - p);
      const lift = vh * LIFT_FRACTION * liftEase;

      // COMMIT — driven by `fly`: the lifted page snaps into a COMPLETE circle
      // (collapse, front half) then flies down into the chip slot (flyEase).
      const collapse = smoothstep(f / 0.55);
      const flyEase = smoothstep(f);

      // Bottom fisheye bend — grows with the pull, eases off as the circle forms.
      // Once the bulge is imperceptible we REMOVE the filter string entirely (not
      // just zero its scale) so Blink drops the full-page filter layer rather
      // than rasterizing every page pixel through the shader every frame.
      const effectiveScale = FISHEYE_STRENGTH * p * (1 - collapse);
      if (d) d.setAttribute("scale", String(effectiveScale));
      const lens =
        hasDef && Math.abs(effectiveScale) > 0.5 ? "url(#scrollchat-fisheye)" : "";
      // INNER (contentRef): ONLY the bottom lens — deliberately NO whole-page
      // brightness/blur/opacity (the page never dims; only its bottom feathers).
      c.style.filter = lens;
      c.style.willChange = lens ? "filter" : "";

      // Feather ONLY a modest band at the page's bottom edge while pulling, so
      // the chat peeks through softly there (a "little bit", not a whole-page
      // fade). The band grows with the lift and dissolves as the circle forms.
      const feather = Math.max(40, lift * 0.7) * (1 - smoothstep(f / 0.25));
      if (feather > 0.5) {
        const m = `linear-gradient(to bottom, #000 calc(100% - ${feather}px), transparent 100%)`;
        k.style.setProperty("mask-image", m);
        k.style.setProperty("-webkit-mask-image", m);
      } else {
        k.style.removeProperty("mask-image");
        k.style.removeProperty("-webkit-mask-image");
      }

      // Clip to a circle only during the commit; rMax is larger than the
      // viewport so the instant it engages there's no visible clip (seamless).
      const r = rMax + (CIRCLE_MIN_RADIUS - rMax) * collapse;
      k.style.clipPath = f > 0.0001 ? `circle(${r}px at ${cx}px ${cyDoc}px)` : "none";

      // Transform: interpolate from the lifted page (TY = −lift, full size) to
      // the measured chip slot (chip size, at the in-input tile). The clip
      // circle's center sits at viewport (cx, vh/2); translate it onto the
      // target center; transform-origin matches so the scale pivots there.
      const sFinal = target.d / (2 * CIRCLE_MIN_RADIUS);
      const S = 1 + (sFinal - 1) * flyEase;
      const TYPull = -lift;
      const TX = (target.cx - cx) * flyEase;
      const TY = TYPull + (target.cy - vh / 2 - TYPull) * flyEase;
      k.style.transformOrigin = `${cx}px ${cyDoc}px`;
      k.style.transform = `translate(${TX}px, ${TY}px) scale(${S})`;

      // HANDOFF — dissolve the page-circle over the fly's back half so only the
      // designed in-input chip (revealed beneath) remains; without it the raw
      // page-circle peeks out / shows THROUGH the chip. Reverses symmetrically.
      // Window [0.62, 0.9]: dissolve completes at ~33px visible diameter vs the
      // 30px tile — a near-parity crossfade ("the page BECOMES the chip"), not
      // an 81px circle vanishing while a 30px tile pops in elsewhere.
      k.style.opacity = String(1 - smoothstep((f - 0.62) / 0.28));

      applied = true;
    };

    const maybeRest = () => {
      const p = clamp01(progress.get());
      const f = clamp01(fly.get());
      if (p <= 0.0008 && f <= 0.0008) {
        // Unconditional (not gated on `applied`): after an HMR remount React
        // reuses these DOM nodes, so they can carry cooked styles from the
        // PREVIOUS effect epoch that this closure never applied.
        clearStyles();
        return true;
      }
      return false;
    };

    // Coalesce both MotionValue subscriptions into a single rAF so apply() runs
    // at most once per frame on the freshest progress + fly (no double-apply, no
    // stale-read race between the two callbacks).
    let rafId: number | null = null;
    const scheduleApply = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (maybeRest()) return;
        apply(clamp01(progress.get()), clamp01(fly.get()));
      });
    };

    const unsubProgress = progress.on("change", scheduleApply);
    const unsubFly = fly.on("change", scheduleApply);
    clearStylesRef.current = clearStyles;

    return () => {
      unsubProgress();
      unsubFly();
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearStyles();
      clearStylesRef.current = null;
    };
  }, [progress, fly, reducedMotion]);

  // Failsafe: the instant the state machine returns to "idle", force a pristine
  // page. Styles are normally cleared by maybeRest() off value-change events,
  // but that path has no authoritative backstop — a dropped final rAF (occluded
  // tab, HMR seam) would otherwise leave the page cooked with no event left to
  // heal it. Safe unconditionally: idle is only entered with both values at 0,
  // and a pull re-applies styles via change events without a phase transition.
  useEffect(() => {
    if (phase === "idle") clearStylesRef.current?.();
  }, [phase]);

  if (reducedMotion) {
    return (
      <>
        {children}
        <ChatFooter />
      </>
    );
  }

  return (
    <>
      {/* Off-screen filter def — region + map sized to the bottom viewport. */}
      <svg
        aria-hidden
        width="0"
        height="0"
        className="pointer-events-none absolute"
        style={{ position: "absolute" }}
      >
        <defs>
          {region && mapUri && (
            <filter
              id="scrollchat-fisheye"
              filterUnits="userSpaceOnUse"
              x={region.x}
              y={region.y}
              width={region.w}
              height={region.h}
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={mapUri}
                x={region.x}
                y={region.y}
                width={region.w}
                height={region.h}
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                ref={dispRef}
                in="SourceGraphic"
                in2="map"
                scale={0}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          )}
        </defs>
      </svg>

      {/* The chat lives BEHIND the page (lower z): a stationary full-screen layer
          revealed as the page-circle shrinks. Page styles are applied
          imperatively in the warp loop above. */}
      <div ref={wrapperRef} data-warp-wrapper>
        <ChatFooter />
        {/* Outer = clip porthole + fly transform; inner = fisheye/DOF/dive. */}
        <div ref={clipRef} data-warp-clip>
          <div ref={contentRef} data-warp-content>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
