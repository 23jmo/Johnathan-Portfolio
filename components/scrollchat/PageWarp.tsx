"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
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
 *   1. WARP + COLLAPSE — as you pull, a per-channel SVG `feDisplacementMap`
 *      refracts the page like LIQUID GLASS (with chromatic aberration) while it
 *      folds into a shrinking `clip-path: circle()`. Both are driven by
 *      `progress`, so at MAX pull the page is already a COMPLETE glass sphere
 *      floating in the viewport, with the chat revealed around it. Releasing
 *      below the commit line un-forms it back into the flat page.
 *   2. FLY — driven by the separate `fly` value (animated AFTER `progress`
 *      reaches 1), the finished sphere — the real warped page — springs down
 *      and shrinks into the chip slot above the input. The chip IS the warped
 *      home screen, not a placeholder.
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
 * Peak rim refraction, expressed as a FRACTION OF THE BEZEL WIDTH (not a fixed
 * px) — this keeps the glass smooth at every size the sphere passes through
 * (the bezel is a fraction of the radius, so a fixed-px bend that looked subtle
 * on the large mid-pull sphere would teleport pixels on the small final one).
 *
 * The displacement gradient AT THE RIM is REFRACT × GLASS_RIM_EXP, and the
 * magnification folds into a doubled "echo" once that gradient passes 1. At the
 * current 0.88 × 2.6 ≈ 2.29 the rim is driven FAR past that caustic, so the
 * outermost ring folds MULTIPLE times — content smears into CONCENTRIC bands
 * that wrap the silhouette (right next to the edge), while the interior of the
 * band (lower gradient) still magnifies as a single clean image. REFRACT also
 * sets the absolute pixel displacement (r×BEZEL×REFRACT), so it's kept high to
 * pull content far, not merely stretch it.
 */
const GLASS_REFRACT = 0.88;

/** How far the page rubber-band-lifts at full pull, as a fraction of viewport.
 *  Modest now — the dominant motion is the ball-up, not the lift — and it eases
 *  out entirely as the sphere forms so the finished circle sits centered. */
const LIFT_FRACTION = 0.18;
/** The completed circle's radius (px) right before it flies off as the chip. */
const CIRCLE_MIN_RADIUS = 66;

/**
 * Chromatic aberration spread: the fractional difference in rim-refraction
 * strength between the red and blue channels (blue bends MORE, like real
 * glass). Because the refraction only lives in the bezel, this splits the
 * channels into prismatic colour ONLY at the sphere's edge — never the centre.
 */
const CHROMATIC_SPREAD = 0.16;

/**
 * The glass map is rendered once at this resolution as a UNIT square, then
 * rescaled per-frame onto the shrinking sphere via <feImage>. 256 gives the
 * thin bezel enough gradient to read smoothly even when the sphere is large.
 */
const GLASS_MAP_SIZE = 256;

/**
 * Fraction of the radius occupied by the refracting bezel. The inner
 * (1 − BEZEL) of the disc is perfectly clear; only this outer band bends. Small
 * = a tight glassy rim (Apple / wabi); large = a soft, thick lens edge. 0.50
 * spreads the distortion across the outer HALF of the radius (only the inner 50%
 * stays clear) — a much thicker warped band, i.e. the falloff toward the centre
 * is far gentler. (Note: bezel width does NOT affect folding — the gradient is
 * set by REFRACT × exponent alone — so widening the band only spreads the same
 * bend over more area, it can never echo.)
 */
const GLASS_BEZEL = 0.5;

/**
 * Exponent of the bezel refraction profile (mag = e^RIM_EXP across the band).
 * Controls how the bend is DISTRIBUTED through the bezel, and with it how hard
 * the very edge spikes relative to the interior:
 *   - ~1.1 spreads the bend evenly (strong across the whole band, rim gradient
 *     just under the caustic → no fold anywhere).
 *   - HIGHER concentrates the bend into the outermost ring: the interior of the
 *     band stays gentle while the very rim spikes WAY past the caustic into a
 *     tight multi-fold — content WRAPS CONCENTRIC with the silhouette in a
 *     band right at the edge, while the exponent keeps that fold a thin ring so
 *     it never doubles readable body text further in.
 * The rim gradient is RIM_EXP × REFRACT; at 2.6 × 0.88 ≈ 2.29 the outermost
 * ~10% of the radius folds hard into those concentric bands, the rest
 * magnifies cleanly.
 */
const GLASS_RIM_EXP = 2.6;

/**
 * Edge blur — the rim of the glass softly blurs the refracted content so it
 * "melds" through the edge (Apple liquid-glass), instead of the hard, crisp
 * meniscus. BLUR_INNER is where the blur starts (fraction of the radius; the
 * inner disc stays perfectly sharp), ramping to full at the rim. The blur radius
 * is r × BLUR_FRACTION so it scales with the shrinking sphere and melds equally
 * at every size.
 */
const BLUR_INNER = 0.72;
const BLUR_FRACTION = 0.06;

/**
 * The three colour channels of the chromatic-aberration pass. Each refracts the
 * page through the SAME bezel map at a slightly different strength (set per-frame
 * in apply(): blue bends most, red least), is isolated to its own channel by the
 * `matrix`, then the three are screen-blended back together — the mismatch is
 * what fringes the sphere's edge with prismatic colour. Driving the filter from
 * this array (instead of three copy-pasted <feDisplacementMap>/<feColorMatrix>
 * blocks) keeps the channels guaranteed in sync.
 */
const GLASS_CHANNELS = [
  { key: "r", matrix: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { key: "g", matrix: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { key: "b", matrix: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" },
] as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/**
 * Build a UNIT-square liquid-glass displacement map: an inscribed disc that is
 * NEUTRAL (no displacement) through its clear middle and refracts only in the
 * outer bezel — exactly how a real glass slab bends light just where its surface
 * curves, at the rim. The refraction magnitude is the horizontal component of
 * the glass surface's NORMAL: ~0 across the flat interior, rising to a bounded
 * peak at the very edge. Encoded so feDisplacementMap bends the page RADIALLY at
 * the rim; the per-channel scales then fringe that rim with chromatic colour.
 *
 * Rendered once at a fixed size — apply() rescales/repositions it each frame so
 * the bezel tracks the shrinking sphere instead of sitting still.
 */
function buildGlassMap(): string {
  const n = GLASS_MAP_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(n, n);
  const c = n / 2;
  const radius = n / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - c + 0.5;
      const dy = y - c + 0.5;
      const dist = Math.hypot(dx, dy);
      const rr = dist / radius; // 0 centre → 1 at the inscribed rim
      let r = 128;
      let g = 128;
      if (dist > 0.0001 && rr < 1) {
        // Bezel coordinate e: 0 at the inner edge of the bezel → 1 at the rim
        // (and 0 across the whole clear interior). mag = e^RIM_EXP concentrates
        // the bend toward the rim: the inner band magnifies as a clean single
        // image, and the outermost ring — where the gradient (RIM_EXP·REFRACT)
        // is driven FAR past the caustic — folds MULTIPLE times, smearing content
        // into CONCENTRIC bands that wrap the silhouette right at the edge. The
        // exponent stays >1 so the onset at the inner bezel edge is smooth
        // (slope → 0 there), no hard ring where the distortion begins.
        const e = 1 - Math.min(1, (1 - rr) / GLASS_BEZEL);
        const mag = Math.pow(e, GLASS_RIM_EXP);
        const ux = dx / dist;
        const uy = dy / dist;
        r = 128 + ux * mag * 127;
        g = 128 + uy * mag * 127;
      }
      const i = (y * n + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, Math.round(r)));
      img.data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Build a UNIT-square RIM ALPHA MASK: fully transparent through the clear centre
 * (rr < BLUR_INNER) and ramping to fully opaque at the rim. Positioned onto the
 * sphere like the glass map, it's the `in2` of the edge-blur composite — the
 * blurred copy of the refracted page is kept ONLY where this mask is opaque, so
 * the softening lives at the edge while the centre stays crisp.
 */
function buildBlurMask(): string {
  const n = GLASS_MAP_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(n, n);
  const center = n / 2;
  const radius = n / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const rr = Math.hypot(dx, dy) / radius; // 0 centre → 1 at the inscribed rim
      // Transparent through the sharp interior, smooth ramp to opaque at the rim.
      const alpha = rr < 1 ? smoothstep((rr - BLUR_INNER) / (1 - BLUR_INNER)) : 0;
      const i = (y * n + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(alpha * 255);
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
  const { progress, fly, phase, reducedMotion, armed } = useScrollChat();
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // One displacement node per colour channel (see GLASS_CHANNELS) — same lens
  // map, slightly different strength — so the sphere refracts like glass WITH
  // chromatic aberration (prismatic edge fringing) instead of a flat bulge.
  const dispRefs = useRef<(SVGFEDisplacementMapElement | null)[]>([]);
  // The glass map's <feImage>. Its x/y/width/height are rewritten every frame so
  // the refracting bezel stays glued to the shrinking sphere's rim.
  const feImageRef = useRef<SVGFEImageElement>(null);
  // Edge-blur nodes: the rim alpha mask's <feImage> (tracks the sphere like the
  // glass map) and the <feGaussianBlur> whose stdDeviation is scaled per-frame.
  const blurMaskRef = useRef<SVGFEImageElement>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  // The glass BODY overlay — a translucent gray sheen (stronger at the rim), a
  // top specular highlight, and a rim/contact shadow, seated over the sphere so
  // it reads as a physical lens, not just a distortion. Refraction bends pixels;
  // this adds the material. Positioned/scaled to the circle every frame.
  const sheenRef = useRef<HTMLDivElement>(null);
  // The pre-warm decoy that carries the glass filter while the gesture is only
  // ARMED, so Blink allocates the filtered surface before the pull (see the
  // pre-warm effect below).
  const prewarmRef = useRef<HTMLDivElement>(null);
  // Latest clearStyles from the warp effect, callable by the phase failsafe.
  const clearStylesRef = useRef<(() => void) | null>(null);
  // Mirror of `region` readable inside the imperative warp loop without it
  // becoming a hook dependency (the loop runs on every progress frame).
  const regionRef = useRef<Region | null>(null);
  // Guards the one-time glass-map build (see recompute) against resize churn.
  const mapBuiltRef = useRef(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [mapUri, setMapUri] = useState("");
  const [blurMaskUri, setBlurMaskUri] = useState("");

  // Measure the bottom-viewport filter region, and build the glass map the FIRST
  // time only. The map's content depends solely on the module constants, not the
  // region size (apply() rescales the single unit-square map onto the sphere), so
  // rebuilding it on every resize — a 256×256 pixel loop + toDataURL that also
  // churns a fresh <feImage> href identity — was pure waste.
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
    if (!mapBuiltRef.current) {
      mapBuiltRef.current = true;
      const glassMapUri = buildGlassMap();
      const rimMaskUri = buildBlurMask();
      setMapUri(glassMapUri);
      setBlurMaskUri(rimMaskUri);
      // Decode both PNGs NOW. `<feImage href>` would otherwise decode them the
      // first time the filter actually runs — i.e. inside the gesture's first
      // frame. They're data URIs, so this warms the same memory-cache entry the
      // filter will resolve, at a moment where a decode costs nothing.
      for (const dataUri of [glassMapUri, rimMaskUri]) {
        if (!dataUri) continue;
        const warmImage = new Image();
        warmImage.src = dataUri;
        void warmImage.decode().catch(() => {});
      }
    }
  };

  // Keep the filter region sized to the current page.
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
    // Final fly scale — depends only on the (cached) chip slot size, so it's
    // computed once in engage() rather than every frame.
    let sFinal = 1;

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
      sFinal = target.d / (2 * CIRCLE_MIN_RADIUS);

      // Styles that never change during a gesture — set once here (cleared in
      // clearStyles), not rewritten every frame. The page MUST be opaque so it
      // occludes the chat behind it; its bg normally lives on <body> (which the
      // lift doesn't move), so we paint it onto the clip layer for the warp.
      // transform-origin also pins here: the clip pivots the fly scale at the
      // sphere centre (cx, cyDoc), and both are cached for the whole gesture.
      const k = clipRef.current;
      if (k) {
        k.style.background = "var(--background)";
        k.style.position = "relative";
        k.style.zIndex = "9996";
        k.style.pointerEvents = "none";
        k.style.willChange = "transform, clip-path";
        k.style.transformOrigin = `${cx}px ${cyDoc}px`;
      }
    };

    const clearStyles = () => {
      const c = contentRef.current;
      const k = clipRef.current;
      const sheen = sheenRef.current;
      if (sheen) {
        // display:none removes the shadow/gradient blob from paint entirely at
        // rest (a 0-size fixed div would still cast its box-shadow otherwise).
        sheen.style.display = "none";
        sheen.style.transform = "";
        sheen.style.opacity = "";
        sheen.style.width = "";
        sheen.style.height = "";
        sheen.style.left = "";
        sheen.style.top = "";
      }
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
      const fi = feImageRef.current;
      if (!c || !k) return;
      if (!applied) engage();

      // PULL now does the WARP: the page curls into a sphere as you pull past
      // the bottom, COMPLETE at p=1. `collapse` is driven by `progress` (was
      // `fly`), so at max pull the page is already a finished circle floating in
      // the viewport — the commit only has to fly it down into the chip.
      const collapse = smoothstep(p);
      const flyEase = smoothstep(f);

      // Rubber-band lift: concave (1−(1−p)²) so each unit of scroll lifts LESS
      // than the last (elastic "hard to pull"). It EASES OUT as the ball forms
      // (×(1−collapse)) so the finished sphere sits centered, ready to fly.
      const liftEase = 1 - (1 - p) * (1 - p);
      const lift = vh * LIFT_FRACTION * liftEase * (1 - collapse);

      // Clip to the forming circle. rMax > the viewport diagonal so the clip is
      // invisible until the collapse has progressed; the sqrt pulls the visible
      // ball-up into the back HALF of the pull (not just its final tenth), so
      // you watch the page round into a sphere as you drag.
      const circleForm = Math.sqrt(collapse);
      const r = rMax + (CIRCLE_MIN_RADIUS - rMax) * circleForm;
      k.style.clipPath = p > 0.0001 ? `circle(${r}px at ${cx}px ${cyDoc}px)` : "none";

      // Rim-refraction strength (peak edge displacement, px): a fraction of the
      // CURRENT bezel width (r × BEZEL), so the bend stays smooth as the sphere
      // shrinks instead of over-refracting the thin final rim. NEGATIVE = the
      // MAGNIFY direction (edge content enlarged, wrapping the curve), not the
      // fisheye compression. Grows with the pull as the sphere rounds out, then
      // KILLED as it flies (×(1−…)) — killing the STRING (not just zeroing scale)
      // lets Blink drop the whole filter layer during the commit.
      const glassScale =
        -r * GLASS_BEZEL * GLASS_REFRACT * collapse * (1 - smoothstep(f / 0.5));
      const filterActive = hasDef && Math.abs(glassScale) > 0.3;

      // INNER (contentRef): ONLY the glass lens — no whole-page brightness/blur/
      // opacity. The centre stays perfectly clear; distortion lives at the rim.
      c.style.filter = filterActive ? "url(#scrollchat-fisheye)" : "";
      c.style.willChange = filterActive ? "filter" : "";

      // The map geometry + per-channel scales only matter while the filter is
      // attached — early in the pull and through the fly tail it's detached
      // (filterActive false), so skip these DOM writes entirely then.
      if (filterActive) {
        // LIQUID GLASS — pin the unit glass-map's inscribed disc onto the visible
        // clip circle so its bezel refracts EXACTLY at the sphere's rim. The
        // sphere shrinks as it forms, so the refracting ring must FOLLOW the edge
        // (a static, region-sized map would strand the fringe in space).
        // Both the glass map and the rim blur-mask ride the same disc geometry.
        for (const node of [fi, blurMaskRef.current]) {
          if (!node) continue;
          node.setAttribute("x", String(cx - r));
          node.setAttribute("y", String(cyDoc - r));
          node.setAttribute("width", String(2 * r));
          node.setAttribute("height", String(2 * r));
        }
        // Split the three channels around the base strength — blue bends more,
        // red less. Since the bezel only refracts at the rim, the mismatched
        // displacement fringes the sphere's EDGE with prismatic colour and leaves
        // the centre perfectly clear.
        const spread = glassScale * CHROMATIC_SPREAD;
        const channelScales = [glassScale - spread, glassScale, glassScale + spread];
        dispRefs.current.forEach((node, i) =>
          node?.setAttribute("scale", String(channelScales[i]))
        );
        // Edge-blur radius scales with the sphere so the meld reads the same at
        // every size (a fixed px blur would smear the small final sphere).
        blurRef.current?.setAttribute("stdDeviation", String(r * BLUR_FRACTION));
      }

      // Feather a soft band at the page's bottom edge early in the pull so the
      // chat peeks through softly there; it dissolves as the sphere forms (the
      // shrinking circle then reveals the chat radially instead).
      const feather = (1 - collapse) * Math.max(40, lift * 0.7);
      if (feather > 0.5) {
        const m = `linear-gradient(to bottom, #000 calc(100% - ${feather}px), transparent 100%)`;
        k.style.setProperty("mask-image", m);
        k.style.setProperty("-webkit-mask-image", m);
      } else {
        k.style.removeProperty("mask-image");
        k.style.removeProperty("-webkit-mask-image");
      }

      // Transform: during the pull the sphere only lifts (TY = −lift, centered);
      // during the commit (`fly`) it flies down + shrinks into the measured chip
      // slot. transform-origin is pinned once in engage() so the scale pivots at
      // the sphere centre; sFinal is likewise cached (depends only on chip size).
      const S = 1 + (sFinal - 1) * flyEase;
      const TYPull = -lift;
      const TX = (target.cx - cx) * flyEase;
      const TY = TYPull + (target.cy - vh / 2 - TYPull) * flyEase;

      // LIQUID MORPH — a subtle squash-stretch keyed to how fast the pull is
      // changing, so the sphere wobbles like a water droplet while it moves and
      // relaxes to a perfect circle when it stops. Velocity is <0 while scrolling
      // UP (easing the pull back): negating it makes `wobble` positive there,
      // stretching the droplet VERTICALLY (taller, narrower) as you reverse;
      // pulling down squashes it the other way. Constant-"volume" (Sx and Sy move
      // opposite) so it reads as jelly, not just a scale. Capped at 7%, and only
      // on the formed sphere (×collapse), never during the fly (×(1−flyEase)) so
      // it can't wobble the chip handoff. A small epsilon snaps it clean to 0 once
      // the jiggle is imperceptible, so the settling sphere stops repainting.
      const progressVelocity = progress.getVelocity();
      let wobble =
        Math.max(-0.07, Math.min(0.07, -progressVelocity * 0.02)) *
        collapse *
        (1 - flyEase);
      if (Math.abs(wobble) < 0.002) wobble = 0;
      const Sx = S * (1 - wobble);
      const Sy = S * (1 + wobble);

      // Shared by the clip porthole and the glass-body sheen so they morph in
      // lockstep (a desync would leave the sheen round while the droplet stretches).
      const morphTransform = `translate(${TX}px, ${TY}px) scale(${Sx}, ${Sy})`;
      k.style.transform = morphTransform;

      // HANDOFF — dissolve the page-sphere over the fly's back half so only the
      // designed in-input chip (revealed beneath) remains; without it the raw
      // page-circle shows THROUGH the chip. Reverses symmetrically.
      const sphereAlpha = 1 - smoothstep((f - 0.62) / 0.28);
      k.style.opacity = String(sphereAlpha);

      // GLASS BODY — park the sheen overlay exactly on the sphere and ride the
      // SAME fly transform + handoff dissolve so the lens body tracks the page-
      // circle pixel-for-pixel. The circle centre sits at viewport (cx, vh/2)
      // (the page is scroll-locked, so cyDoc − scrollY == vh/2); origin 50% 50%
      // pivots the scale at that centre, matching the clip layer. The sheen
      // fades in with the pull (×collapse) so a barely-formed circle isn't
      // ringed in gray, and out with the sphere on commit.
      const sheen = sheenRef.current;
      if (sheen) {
        sheen.style.display = "block";
        sheen.style.left = `${cx - r}px`;
        sheen.style.top = `${vh / 2 - r}px`;
        sheen.style.width = `${2 * r}px`;
        sheen.style.height = `${2 * r}px`;
        sheen.style.transform = morphTransform;
        // Ramp the sheen in faster than raw `collapse` (×1.4, clamped) so the
        // glass body reads as clearly gray by mid-pull — but still keyed off
        // `collapse`, so a huge barely-formed circle at the very start isn't
        // ringed in gray across the viewport.
        sheen.style.opacity = String(sphereAlpha * Math.min(1, collapse * 1.4));
      }

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

  // PRE-WARM the glass filter while the gesture is only ARMED.
  //
  // Attaching `filter: url(#scrollchat-fisheye)` for the first time forces Blink
  // to build the filter graph, resolve + upload the two <feImage> maps, and
  // allocate a filter surface the size of the filter region — synchronously, on
  // the main thread. Doing that on the first frame of the pull IS the hitch.
  //
  // The decoy carries the filter instead, ahead of time. `filterUnits` is
  // userSpaceOnUse with an explicit region, so the region — and therefore the
  // surface Blink allocates — is the same whether the filter hangs off the
  // page-sized content layer or off a 1px decoy.
  //
  // It is handed BACK the instant the pull starts: the decoy shares the one
  // <filter> element, whose nodes apply() rewrites every frame, so leaving it
  // attached would re-rasterize a second region-sized surface per frame.
  const filterReady = !!(region && mapUri);
  useEffect(() => {
    if (reducedMotion || !filterReady) return;
    const decoy = prewarmRef.current;
    if (!decoy) return;

    let warmAttached = false;
    const syncPrewarm = () => {
      const shouldWarm =
        armed.get() > 0 && progress.get() <= 0.0008 && fly.get() <= 0.0008;
      if (shouldWarm === warmAttached) return;
      warmAttached = shouldWarm;
      decoy.style.filter = shouldWarm ? "url(#scrollchat-fisheye)" : "";
      // Blink can skip a filter whose source paints nothing, so the decoy needs
      // SOME ink — one pixel at 0.4% alpha, which is below an 8-bit level and
      // rounds away. Removed again when cold, so at rest it paints nothing.
      decoy.style.background = shouldWarm ? "rgba(0,0,0,0.004)" : "";
    };

    syncPrewarm();
    const unsubArmed = armed.on("change", syncPrewarm);
    const unsubProgress = progress.on("change", syncPrewarm);

    return () => {
      unsubArmed();
      unsubProgress();
      decoy.style.filter = "";
      decoy.style.background = "";
    };
  }, [armed, progress, fly, reducedMotion, filterReady]);

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
              {/* Neutral (no-displacement) field over the WHOLE region — R=G=128
                  means "don't move this pixel". Everything outside the tracked
                  glass square falls back to this, so only the sphere refracts. */}
              <feFlood
                floodColor="rgb(128,128,128)"
                floodOpacity="1"
                result="neutral"
              />
              {/* The unit glass-map, positioned + scaled per-frame in apply() to
                  sit exactly on the sphere (x/y/width/height rewritten each
                  frame; starts collapsed so it displaces nothing at rest). Its
                  inscribed disc is clear in the middle and bends only in the
                  bezel — the edge-only refraction. */}
              <feImage
                ref={feImageRef}
                href={mapUri}
                x={region.x}
                y={region.y}
                width={0}
                height={0}
                preserveAspectRatio="none"
                result="ring"
              />
              {/* Composite the glass square OVER the neutral field → a full-region
                  map that refracts only inside the sphere's bezel. */}
              <feComposite
                in="ring"
                in2="neutral"
                operator="over"
                result="map"
              />
              {/* LIQUID GLASS — refract each colour channel through the same bezel
                  at a slightly different strength (blue most, red least, driven
                  per-frame in apply()), isolate it to its channel, then screen
                  the three back together. The mismatched refraction is what
                  fringes the sphere's EDGE with prismatic colour. Rendered from
                  GLASS_CHANNELS so the three passes can't drift out of sync. */}
              {GLASS_CHANNELS.map((channel, index) => (
                <Fragment key={channel.key}>
                  <feDisplacementMap
                    ref={(node) => {
                      dispRefs.current[index] = node;
                    }}
                    in="SourceGraphic"
                    in2="map"
                    scale={0}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result={`d${channel.key}`}
                  />
                  <feColorMatrix
                    in={`d${channel.key}`}
                    type="matrix"
                    values={channel.matrix}
                    result={`c${channel.key}`}
                  />
                </Fragment>
              ))}
              <feBlend in="cr" in2="cg" mode="screen" result="crg" />
              <feBlend in="crg" in2="cb" mode="screen" result="sharp" />
              {/* EDGE BLUR — soften the refracted rim so content MELDS through the
                  glass edge (Apple liquid-glass) instead of a crisp meniscus.
                  Blur the sharp chromatic result, keep it only where the rim mask
                  is opaque (its geometry + the blur radius are driven per-frame in
                  apply()), then lay that back OVER the crisp centre. */}
              <feImage
                ref={blurMaskRef}
                href={blurMaskUri}
                x={region.x}
                y={region.y}
                width={0}
                height={0}
                preserveAspectRatio="none"
                result="blurmask"
              />
              <feGaussianBlur
                ref={blurRef}
                in="sharp"
                stdDeviation={0}
                result="blurred"
              />
              <feComposite
                in="blurred"
                in2="blurmask"
                operator="in"
                result="blurrim"
              />
              <feComposite in="blurrim" in2="sharp" operator="over" />
            </filter>
          )}
        </defs>
      </svg>

      {/* The chat lives BEHIND the page (lower z): a stationary full-screen layer
          revealed as the page-circle shrinks. Page styles are applied
          imperatively in the warp loop above. */}
      <div ref={wrapperRef} data-warp-wrapper>
        <ChatFooter />
        {/* Outer = clip porthole + fly transform; inner = the glass lens filter. */}
        <div ref={clipRef} data-warp-clip>
          <div ref={contentRef} data-warp-content>
            {children}
          </div>
        </div>
        {/* Glass BODY overlay — sits ABOVE the page-sphere (z 9997 > clip 9996).
            Fixed to the viewport (the wrapper has no transformed ancestor, same
            as ChatFooter), geometry + transform + opacity driven per-frame in
            apply(). The two stacked gradients are: (1) a soft top specular
            highlight and (2) the gray sheen that is transparent through the
            centre and strengthens toward the rim; the box-shadow adds the bright
            inner rim, a bottom inner shade, and a soft contact shadow. */}
        <div
          ref={sheenRef}
          data-warp-sheen
          aria-hidden
          style={{
            position: "fixed",
            display: "none",
            borderRadius: "9999px",
            pointerEvents: "none",
            zIndex: 9997,
            willChange: "transform, opacity",
            // Gradient stops are PERCENTAGES → they scale with the element, so
            // the sheen keeps the same proportions whether the sphere is 450px
            // mid-pull or 132px at the end. The ENTIRE gloss now lives in these
            // gradients (not a fixed-px box-shadow inset, which becomes a white
            // blob on the 132px final sphere). Layer 1: a tight, bright glint
            // hugging the top-left curve — a real strip, not a wash. Layer 2: a
            // soft halo behind it so the gloss has falloff, still well short of
            // centre. Layer 3: the gray glass BODY — a clearly-present tint
            // through the whole disc that ramps into a heavy gray rim, with a
            // light final stop so the very edge catches light.
            background:
              "radial-gradient(18% 23% at 29% 20%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.5) 44%, rgba(255,255,255,0) 72%)," +
              "radial-gradient(33% 41% at 33% 25%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 74%)," +
              "radial-gradient(circle at 50% 50%, rgba(148,152,164,0.38) 0%, rgba(142,146,158,0.4) 42%, rgba(122,126,140,0.52) 66%, rgba(98,102,118,0.68) 85%, rgba(72,76,92,0.82) 95%, rgba(208,214,226,0.52) 100%)",
            // Edge-only shadows (thin insets → scale-safe at any sphere size): a
            // hairline bright rim where the glass catches light, then a thin
            // translucent gray BORDER ring just outside it (the crisp glassy edge
            // — a defined rim of tinted glass, not just the gradient falloff), a
            // soft bottom inner shade to ground it, and an outside contact shadow.
            // The top-left gloss is NOT here — it's in the percentage gradients
            // above, so it stays a strip instead of swelling to a blob when small.
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 0 0 3px rgba(148,152,166,0.34), inset 0 -8px 16px -6px rgba(68,72,88,0.5), 0 16px 40px -12px rgba(0,0,0,0.4)",
          }}
        />
      </div>

      {/* PRE-WARM decoy — see the pre-warm effect above. Deliberately NOT the
          page layers: `filter` (and `will-change: filter/transform`) makes an
          element a containing block for `position: fixed` descendants, and the
          page tree has one (`ThemeToggle`), so pre-attaching the filter there
          would re-base it out of the viewport. This element has no descendants
          at all, so it can carry the filter harmlessly.

          While warming it paints a single 0.4%-alpha pixel (see the effect);
          at rest it paints nothing at all. `position: fixed` also keeps the
          filter's ink overflow out of the document's scrollable overflow. */}
      <div
        ref={prewarmRef}
        data-warp-prewarm
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
