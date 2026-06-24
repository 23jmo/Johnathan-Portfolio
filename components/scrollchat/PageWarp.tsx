"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useTransform } from "framer-motion";
import { useScrollChat } from "./ScrollChatProvider";
import ChatFooter from "./ChatFooter";

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
/** Resting chip diameter (px) once the circle has flown into the chat. */
const CHIP_DIAMETER = 38;
/** Chip CENTER, in px above the viewport bottom (just above the input bar). */
const CHIP_CENTER_FROM_BOTTOM = 132;

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
  const { progress, fly, reducedMotion, phase } = useScrollChat();
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  // Mirror of `region` readable inside the imperative warp loop without it
  // becoming a hook dependency (the loop runs on every progress frame).
  const regionRef = useRef<Region | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [mapUri, setMapUri] = useState("");

  // The chip-slot ring fades in as the circle lands as the chip (fly → 1).
  const ringOpacity = useTransform(fly, [0.5, 1], [0, 1]);

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
  useEffect(() => {
    if (reducedMotion) return;
    let applied = false;

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
      const reg = regionRef.current;
      if (!c || !k) return;

      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const cx = reg ? reg.w / 2 : vw / 2;
      const cyDoc = window.scrollY + vh / 2;

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
      if (d) {
        d.setAttribute("scale", String(FISHEYE_STRENGTH * p * (1 - collapse)));
      }
      // A url() to a missing filter renders the element fully invisible in
      // Blink/WebKit, so only reference it once the def exists.
      const hasDef = !!document.getElementById("scrollchat-fisheye");
      const lens = hasDef ? "url(#scrollchat-fisheye)" : "";

      // INNER (contentRef): ONLY the bottom lens — deliberately NO whole-page
      // brightness/blur/opacity (the page never dims; only its bottom feathers).
      c.style.filter = lens;
      c.style.willChange = lens ? "filter" : "";

      // OUTER (clipRef): lift (pull) → circle + fly (commit).
      // The page MUST be opaque so it fully occludes the chat behind it — only
      // the feathered bottom edge should reveal the chat. The page's own bg
      // normally lives on <body> (which the lift doesn't move), so we paint the
      // page background onto the clip layer itself for the duration of the warp.
      k.style.background = "var(--background)";

      // Feather ONLY a modest band at the page's bottom edge while pulling, so
      // the chat peeks through softly there (a "little bit", not a whole-page
      // fade). The band grows with the lift and dissolves as the circle forms.
      const feather =
        Math.max(40, lift * 0.7) * (1 - smoothstep(f / 0.25));
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
      const rMax = (Math.hypot(cx * 2, vh) / 2) * 1.25;
      const r = rMax + (CIRCLE_MIN_RADIUS - rMax) * collapse;
      k.style.clipPath = f > 0.0001 ? `circle(${r}px at ${cx}px ${cyDoc}px)` : "none";

      // Transform: interpolate from the lifted page (TY = −lift, full size) to
      // the chip slot (chip size, just above the input). The clip circle's
      // center sits at (cx, cyDoc) in local space; transform-origin matches so
      // the scale pivots there.
      const sFinal = CHIP_DIAMETER / (2 * CIRCLE_MIN_RADIUS);
      const S = 1 + (sFinal - 1) * flyEase;
      const TX = (vw / 2 - cx) * flyEase;
      const TYPull = -lift;
      const TYChip = vh / 2 - CHIP_CENTER_FROM_BOTTOM;
      const TY = TYPull + (TYChip - TYPull) * flyEase;
      k.style.transformOrigin = `${cx}px ${cyDoc}px`;
      k.style.transform = `translate(${TX}px, ${TY}px) scale(${S})`;
      k.style.opacity = "1";
      k.style.position = "relative";
      k.style.zIndex = "9996";
      k.style.pointerEvents = "none";
      k.style.willChange = "transform, clip-path";

      applied = true;
    };

    const maybeRest = () => {
      const p = clamp01(progress.get());
      const f = clamp01(fly.get());
      if (p <= 0.0008 && f <= 0.0008) {
        if (applied) clearStyles();
        return true;
      }
      return false;
    };

    const unsubProgress = progress.on("change", () => {
      if (maybeRest()) return;
      apply(clamp01(progress.get()), clamp01(fly.get()));
    });
    const unsubFly = fly.on("change", () => {
      if (maybeRest()) return;
      apply(clamp01(progress.get()), clamp01(fly.get()));
    });

    return () => {
      unsubProgress();
      unsubFly();
      clearStyles();
    };
  }, [progress, fly, reducedMotion]);

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

      {/* The chip slot: a soft ring + glow that frames the warped page-circle
          once it lands as the chip (fades in with `fly`). The circle itself —
          the real warped page — sits just behind this ring at the same spot. */}
      {phase !== "idle" && (
        <motion.div
          aria-hidden
          style={{
            opacity: ringOpacity,
            width: CHIP_DIAMETER,
            height: CHIP_DIAMETER,
            bottom: CHIP_CENTER_FROM_BOTTOM - CHIP_DIAMETER / 2,
          }}
          className="pointer-events-none fixed left-1/2 z-[9997] -translate-x-1/2 rounded-full ring-1 ring-white/30 shadow-[0_0_22px_2px_rgba(140,150,255,0.45)]"
        />
      )}
    </>
  );
}
