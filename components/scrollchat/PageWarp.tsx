"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useScrollChat } from "./ScrollChatProvider";
import ChatFooter from "./ChatFooter";
import { CHIP_DIAMETER, CHIP_CENTER_FROM_BOTTOM } from "@/lib/scrollchat/chip";
import glassMapManifest from "@/lib/scrollchat/glassMapManifest.json";

/**
 * Warps the live page into the chat as the visitor pulls past the bottom. The
 * AI chat is a STATIONARY full-screen layer that lives BEHIND the page
 * (`ChatFooter`); the page is the only thing that moves — it dissolves away to
 * reveal the chat already sitting behind it, then becomes the chip:
 *
 *   1. WARP + COLLAPSE — as you pull, an SVG `feDisplacementMap` refracts the
 *      page like LIQUID GLASS while it folds into a shrinking `clip-path:
 *      circle()`. Both are driven by `progress`, so at MAX pull the page is
 *      already a COMPLETE glass sphere floating in the viewport, with the chat
 *      revealed around it. Releasing below the commit line un-forms it back into
 *      the flat page.
 *   2. FLY — driven by the separate `fly` value (animated AFTER `progress`
 *      reaches 1), the finished sphere — the real warped page — springs down
 *      and shrinks into the chip slot above the input. The chip IS the warped
 *      home screen, not a placeholder.
 *
 * Everything is driven IMPERATIVELY off the `progress` + `fly` MotionValues so a
 * single `clearStyles()` guarantees a pristine teardown the instant both return
 * to rest — closing the chat never leaves the page "cooked".
 *
 * The SHRINK ITSELF IS A COMPOSITOR TRANSFORM, not a filter animation. SVG
 * filters render on the PAINT path: touching any attribute re-runs the whole
 * graph over the whole filter region, so re-drawing the lens at the new radius
 * every frame meant re-rasterizing a viewport-sized shader sixty times a second.
 * Every one of those attributes was exactly LINEAR in the sphere's radius, so
 * the filter is now pinned once to a reference radius r0 and the radius
 * animation is `transform: scale(r / r0)` on the clip layer — the transform that
 * layer was already carrying for the fly. See `WarpGeometry` for what that costs.
 *
 * The graph is NOT static and this file does not claim it is. One term — the
 * refraction envelope — is not linear in the radius and is still written every
 * frame; see its doc block for why that write turns out to be the cheap one.
 * What stopped being written is everything that WAS expensive: the page-sized
 * `clip-path`, the two <feImage> geometries, the blur radius, and the sheen's
 * layout box.
 *
 * IMPORTANT: `filter`/`transform`/`clip-path` change stacking + re-base
 * `position:fixed` descendants, so at rest we apply NOTHING (styles fully
 * cleared), and `url(#missing)` is never referenced (it renders invisible). The
 * warp scale deliberately rides the clip layer's EXISTING gesture transform
 * rather than adding one to the filtered content, so it introduces no new
 * containing block for the page's fixed descendants (`ThemeToggle`).
 */

/**
 * Peak rim refraction, expressed as a FRACTION OF THE BEZEL WIDTH (not a fixed
 * px) — this keeps the glass smooth at every size the sphere passes through
 * (the bezel is a fraction of the radius, so a fixed-px bend that looked subtle
 * on the large mid-pull sphere would teleport pixels on the small final one).
 *
 * The displacement gradient AT THE RIM is REFRACT × the map's rim exponent
 * (baked in by scripts/generate-glass-maps.mjs), and the magnification folds
 * into a doubled "echo" once that gradient passes 1. At the current
 * 0.88 × 2.6 ≈ 2.29 the rim is driven FAR past that caustic, so the outermost
 * ring folds MULTIPLE times — content smears into CONCENTRIC bands that wrap the
 * silhouette (right next to the edge), while the interior of the band (lower
 * gradient) still magnifies as a single clean image. REFRACT also sets the
 * absolute pixel displacement (r×BEZEL×REFRACT), so it's kept high to pull
 * content far, not merely stretch it.
 */
const GLASS_REFRACT = 0.88;

/**
 * Chromatic aberration spread: the fractional difference in rim-refraction
 * strength between the red and blue channels (blue bends MORE, like real
 * glass). Because the refraction only lives in the bezel, this splits the
 * channels into prismatic colour ONLY at the sphere's edge — never the centre.
 */
const CHROMATIC_SPREAD = 0.16;

/**
 * The three colour channels of the chromatic-aberration pass. Each refracts the
 * page through the SAME bezel map at a slightly different strength, is isolated
 * to its own channel by the `matrix`, then the three are screen-blended back
 * together — the mismatch is what fringes the sphere's edge with prismatic
 * colour. Driving the filter from this array (instead of three copy-pasted
 * <feDisplacementMap>/<feColorMatrix> blocks) keeps the channels in sync.
 *
 * These three passes are the most expensive thing in the graph, and an earlier
 * revision of this change deleted two of them. That was wrong: it did not
 * "collapse" the fringe, it removed it. They are affordable here because of what
 * moving the radius animation onto the compositor did to the cost of running the
 * graph at all — the filtered layer is now rasterized at the sphere's current,
 * shrinking scale rather than always at 1:1. Restoring all three cost 13ms of
 * GPU time across a 150-frame pull, measured.
 */
const GLASS_CHANNELS = [
  { key: "r", matrix: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { key: "g", matrix: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { key: "b", matrix: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" },
] as const;

/** How far the page rubber-band-lifts at full pull, as a fraction of viewport.
 *  Modest now — the dominant motion is the ball-up, not the lift — and it eases
 *  out entirely as the sphere forms so the finished circle sits centered. */
const LIFT_FRACTION = 0.18;
/** The completed circle's radius (px) right before it flies off as the chip. */
const CIRCLE_MIN_RADIUS = 66;

/**
 * How much bigger the porthole starts out than the viewport's own half-diagonal.
 * >1 keeps the clip circle entirely off-screen at the start of the pull, so the
 * ball-up only becomes visible once the collapse has progressed.
 *
 * It also fixes r0 (see `WarpGeometry.referenceRadius`), which makes it the one
 * number deciding how large the static filter region has to be.
 */
const PORTHOLE_MAX_RADIUS_FACTOR = 1.25;

/**
 * The two lens images, baked at build time by scripts/generate-glass-maps.mjs.
 * Their pixels depend only on that script's constants — not on the viewport, the
 * page, or how far the pull has progressed — so there is exactly ONE correct
 * pair of images. Building them per visit (a 256×256 per-pixel loop plus
 * `canvas.toDataURL()`, on the main thread, at mount) was paying a runtime cost
 * for a build-time constant.
 */
const GLASS_MAP_URL = "/scrollchat/glass-map.png";
const GLASS_RIM_MASK_URL = "/scrollchat/glass-rim-mask.png";

/**
 * Fraction of the radius occupied by the refracting bezel: the inner (1 − BEZEL)
 * of the disc is perfectly clear and only this outer band bends.
 *
 * Read from the manifest the generator emits rather than repeated here, because
 * this one number does DOUBLE duty — it shapes the baked map AND scales the
 * per-frame displacement below. Duplicating it would mean a silent, hard-to-spot
 * failure the day someone re-tunes the lens: the refraction would simply stop
 * lining up with the sphere's rim.
 */
const GLASS_BEZEL = glassMapManifest.bezel;

/**
 * Edge blur — the rim softly blurs the refracted content so it "melds" through
 * the edge (Apple liquid-glass) instead of ending in a hard meniscus. The radius
 * is a fraction of the sphere's radius so the meld reads the same at every size.
 *
 * Because the whole graph now runs at r0 and the compositor scales the result,
 * the actual `stdDeviation` is r0 × this, written ONCE in the JSX: at scale
 * r/r0 it lands back on r × BLUR_FRACTION, exactly what the per-frame write used
 * to produce.
 */
const BLUR_FRACTION = 0.06;

/**
 * The glass-body sheen is a FIXED-SIZE box that the gesture transform scales, so
 * its geometry never touches layout mid-gesture. This is the radius that box is
 * authored at, which makes every px inside it (box-shadow offsets, blurs) "px on
 * a 320px-radius sphere" and therefore proportional at every other size.
 *
 * Chosen near the middle of the range where the sheen is actually legible — its
 * opacity ramps with `collapse`, so it is invisible until r ≲ 350 and the
 * finished sphere is r = 66. That keeps the visible range a mild DOWNscale of a
 * crisp raster and confines upscaling to the early pull, where the sheen is
 * transparent anyway (and where it is nothing but smooth gradients, which
 * upscale without visible softening).
 */
const SHEEN_BASE_RADIUS = 320;

/**
 * The sheen's four box-shadows, authored in ON-SCREEN px and divided back out by
 * the scale the element is currently under.
 *
 * The sheen's geometry is a fixed box that the gesture transform scales, which
 * is what keeps it off the layout path — but a uniform scale is exactly the
 * wrong transform for a rim: it shrinks the 1px hairline and the 3px tint ring
 * along with the sphere, so the finished 66px ball would wear a 0.21px rim
 * instead of the 1px one it wears at full size. A ring of CONSTANT screen
 * thickness on a circle of VARYING screen radius is not a uniform scale of
 * anything, so no static declaration can express it — the two dimensions move
 * independently, and CSS has no primitive that decouples them. (SVG's
 * `vector-effect: non-scaling-stroke` looks like the exception and is not: it is
 * defined against the SVG viewport, so a CSS transform on an HTML ancestor
 * scales it like any other raster. Measured, not assumed — a 3px ring rendered
 * 4 device px at scale 1 and 2 device px at scale 0.5.)
 *
 * So these are written back during the gesture, on the RIM element rather than
 * the sheen body. That split is not cosmetic: writing them onto the sheen itself
 * invalidates its three radial gradients and its 40px-blur contact shadow too,
 * and re-rastering all of that at DPR 2 costs MORE than the page-sized filter
 * graph this whole change exists to stop touching (measured: 265ms of GPU time
 * over a 150-frame pull, against 20ms for the filter). On its own element the
 * shadows repaint alone.
 *
 * They are also QUANTIZED — see SHEEN_RIM_STEP. This is the ONLY quantized
 * write left in the file; the refraction envelope used to be quantized too and
 * deliberately is not any more, for reasons that are the mirror image of the
 * ones that justify it here.
 */
const rimShadow = (scale: number) => {
  const px = (onScreen: number) => onScreen / scale;
  return (
    `inset 0 0 0 ${px(1)}px rgba(255,255,255,0.55),` +
    `inset 0 0 0 ${px(3)}px rgba(148,152,166,0.34),` +
    `inset 0 ${px(-8)}px ${px(16)}px ${px(-6)}px rgba(68,72,88,0.5),` +
    `0 ${px(16)}px ${px(40)}px ${px(-12)}px rgba(0,0,0,0.4)`
  );
};

/**
 * The rim's counter-scale ladder — a GEOMETRIC one, because what has to stay
 * imperceptible here is the RELATIVE error in a thickness, not an absolute
 * displacement.
 *
 * A step of 1.12 means the thickness written is never more than ~6% off the
 * thickness wanted: the 1px hairline renders between 0.94px and 1.06px, i.e.
 * within an eighth of a device pixel at DPR 2, and the 3px ring proportionally.
 * That is constant to below the resolution it is drawn at, for ~26 repaints of
 * a bare ring element across a full pull instead of 150 repaints of the whole
 * glass body.
 *
 * Quantizing THIS is worth it in a way that quantizing the filter attribute was
 * not, and the measurement is lopsided enough to be worth recording: writing the
 * rim every frame costs 298ms of GPU and 1341 raster tasks over a 150-frame
 * pull, against 59ms and 339 for the ladder. A box-shadow write dirties a
 * full-DPR blurred paint no matter how small the sphere has become, so it gets
 * none of the shrinking-raster discount the filter gets.
 *
 * FREE_WRITES / HYSTERESIS_GROWTH / MAX exist because the visitor drives
 * `progress` directly and can walk a ladder up and down as often as they like:
 * past the free writes the deadband widens, so a visitor sawing the scroll back
 * and forth gets a coarser rim rather than an unbounded number of repaints, and
 * MAX is a hard stop that holds by inspection.
 */
const SHEEN_RIM_STEP = 1.12;
const SHEEN_RIM_HYSTERESIS = 0.6;
const SHEEN_RIM_FREE_WRITES = 48;
const SHEEN_RIM_HYSTERESIS_GROWTH = 0.5;
const MAX_SHEEN_RIM_WRITES = 96;

/** The counter-scale that rim ladder rung `rung` stands for. */
const rimScaleForRung = (rung: number) => Math.pow(SHEEN_RIM_STEP, rung);

/**
 * Below this the sheen is transparent enough that nothing it paints can be seen,
 * so the rim ladder stops writing — the same "don't invalidate what isn't
 * visible" gate the refraction gets from `filterActive`.
 */
const SHEEN_VISIBLE_ALPHA = 0.02;

/**
 * The refraction ENVELOPE — `collapse × kill` — is the one term in the lens that
 * is NOT linear in the sphere's radius, so the compositor's `scale(r / r0)`
 * cannot reproduce it and it still has to be written into the graph, once per
 * frame, exactly as before.
 *
 * An earlier revision quantized it to a ladder to avoid those writes. Measured,
 * that was the wrong trade twice over: it bought ~13ms of GPU time across a
 * 150-frame pull (against a ~352ms baseline — under 4%), and it cost a 14px jump
 * in on-screen rim displacement at every rung change, a 25-37% discontinuity in
 * an effect whose whole job is to look like smoothly bending glass.
 *
 * It is cheap because of what the rest of this change did, not in spite of it.
 * The radius animation now lives on the transform, so Blink rasters the filtered
 * layer at the sphere's CURRENT composited scale — a surface that shrinks with
 * the sphere — and is re-rastering it every frame regardless. Re-running the
 * graph on top of that is incremental. What was expensive in the old code was
 * never this attribute: it was the per-frame `clip-path` on a page-sized layer,
 * the <feImage> geometry rewrites, and the blur radius, all of which are now
 * static (1714 raster tasks over a pull, down to 339).
 *
 * Contrast SHEEN_RIM_STEP, where quantization IS worth it — a box-shadow write
 * gets none of this discount.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};


/**
 * Everything about the warp that is fixed for a given page + viewport, measured
 * once on mount (and again on resize) instead of per frame.
 *
 * The filter is pinned to `referenceRadius` — r0, the LARGEST radius the
 * porthole ever takes — and the shrink is done by the compositor with
 * `transform: scale(r / r0)`. Two consequences worth spelling out:
 *
 *   - r0 is the MAXIMUM, so the gesture only ever scales DOWN. Downscaling is
 *     the case least likely to make Blink re-rasterize the layer, which is the
 *     premise the whole approach rests on.
 *   - CSS `filter` runs BEFORE `transform`: the filter is evaluated in the
 *     content's own coordinate space and only then scaled. The area of that
 *     space which ends up visible GROWS as the scale shrinks — out to the full
 *     r0 disc — so the filter REGION has to be that disc, not the viewport.
 *     Anything smaller and the sphere's top and bottom get sliced off as it
 *     shrinks.
 *
 *     That is a real and PERMANENT cost, not one the pre-warm decoy absorbs:
 *     every evaluation now covers more pixels than the old viewport-sized region
 *     did (see `filterX` for how much of the excess is clipped back off). The
 *     decoy only pays for building the graph, decoding the maps and allocating
 *     the surface — it cannot pre-render the real page's filtered output, which
 *     is still produced at least once per gesture and again on every rung. The
 *     trade is a bigger region evaluated a couple of dozen times against a
 *     smaller one evaluated on every frame of the pull.
 */
interface WarpGeometry {
  /** Porthole centre, in the warped content's own (document) coordinate space. */
  centerX: number;
  centerY: number;
  /** r0 — the reference radius every filter attribute is pinned to. */
  referenceRadius: number;
  /**
   * <filter> region: the r0 disc's bounding box, CLIPPED to where the filtered
   * element can actually put ink.
   *
   * The region has to be the r0 disc rather than the viewport, because a CSS
   * `filter` is evaluated BEFORE the `transform` that scales it: at scale s the
   * area that ends up on screen is, in the filtered element's own space, the
   * viewport divided by s — which grows without bound as the sphere collapses
   * and is soon the whole disc.
   *
   * But it does NOT have to be the whole 2r0 square. SourceGraphic is the page
   * content only; the opaque disc filling out the corners of the porthole is a
   * box-shadow on the CLIP layer, which the filter never sees. Everything
   * outside the page box is therefore transparent no matter how large the region
   * is, so intersecting the square with the page (plus a blur margin) buys the
   * same output for materially fewer pixels on every evaluation.
   */
  filterX: number;
  filterY: number;
  filterWidth: number;
  filterHeight: number;
}

export default function PageWarp({ children }: { children: ReactNode }) {
  const { progress, fly, phase, reducedMotion, armed } = useScrollChat();
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // One displacement node per colour channel (see GLASS_CHANNELS). Their three
  // `scale` values are the ONLY filter attributes still written during the
  // gesture, and they are always written together in one frame, so the fringe
  // costs a single graph invalidation rather than three.
  const dispRefs = useRef<(SVGFEDisplacementMapElement | null)[]>([]);
  // The glass BODY overlay — a translucent gray sheen (stronger at the rim), a
  // top specular highlight, and a rim/contact shadow, seated over the sphere so
  // it reads as a physical lens, not just a distortion. Refraction bends pixels;
  // this adds the material. Parked on the sphere once, then only transformed.
  const sheenRef = useRef<HTMLDivElement>(null);
  // The sheen's RIM — the two hairline rings and the two soft shadows, on their
  // own element so counter-scaling them (see rimShadow) repaints a bare ring
  // instead of the whole gradient-and-blur glass body.
  const rimRef = useRef<HTMLDivElement>(null);
  // The pre-warm decoy that carries the glass filter while the gesture is only
  // ARMED, so Blink allocates the filtered surface before the pull (see the
  // pre-warm effect below).
  const prewarmRef = useRef<HTMLDivElement>(null);
  // Latest clearStyles from the warp effect, callable by the phase failsafe.
  const clearStylesRef = useRef<(() => void) | null>(null);
  // Mirror of `geometry` readable inside the imperative warp loop without it
  // becoming a hook dependency (the loop runs on every progress frame).
  const geometryRef = useRef<WarpGeometry | null>(null);
  // Bumped by every recompute(). engage() stamps the version it measured, and
  // apply() re-engages when they disagree — otherwise a resize MID-GESTURE would
  // move the SVG region (React re-renders <filter> from the new geometry) while
  // the imperative loop kept driving the old centre, radius and clip circle
  // until the next gesture.
  const geometryVersionRef = useRef(0);
  const [geometry, setGeometry] = useState<WarpGeometry | null>(null);

  // Measure the page and derive the warp geometry: the porthole's centre, the
  // reference radius the filter is pinned to, and the filter region that radius
  // implies. None of it depends on the pull, so it only re-runs on resize.
  const recompute = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const pageWidth = el.clientWidth;
    const pageHeight = el.scrollHeight;
    const viewportHeight = window.innerHeight;
    // The gesture only happens at the very bottom of the page, so the porthole
    // is centred on the last viewport-worth of it.
    const portholeHeight = Math.min(viewportHeight, pageHeight);
    const centerX = pageWidth / 2;
    const centerY = Math.max(0, pageHeight - portholeHeight) + portholeHeight / 2;
    const referenceRadius =
      (Math.hypot(pageWidth, viewportHeight) / 2) * PORTHOLE_MAX_RADIUS_FACTOR;
    // The r0 disc's bounding box, clipped to the page — see the WarpGeometry doc
    // for why the region is the disc and not the viewport, and why clipping it
    // to the page costs nothing. The margin is the edge blur's 3σ, so the rim
    // blur still has every source pixel it can reach.
    const blurMargin = referenceRadius * BLUR_FRACTION * 3;
    const filterX = Math.max(centerX - referenceRadius, -blurMargin);
    const filterY = Math.max(centerY - referenceRadius, -blurMargin);
    const filterRight = Math.min(centerX + referenceRadius, pageWidth + blurMargin);
    const filterBottom = Math.min(centerY + referenceRadius, pageHeight + blurMargin);
    const next: WarpGeometry = {
      centerX,
      centerY,
      referenceRadius,
      filterX,
      filterY,
      filterWidth: filterRight - filterX,
      filterHeight: filterBottom - filterY,
    };
    geometryRef.current = next;
    geometryVersionRef.current += 1;
    setGeometry(next);
  };

  // Keep the warp geometry sized to the current page.
  useEffect(() => {
    if (reducedMotion) return;
    recompute();
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reducedMotion, pathname]);

  // Decode the two lens PNGs NOW. `<feImage href>` would otherwise fetch and
  // decode them the first time the filter actually runs — i.e. inside the
  // gesture's first frame. This warms the same cache entry the filter will
  // resolve, at a moment where the work costs nothing.
  useEffect(() => {
    if (reducedMotion) return;
    for (const url of [GLASS_MAP_URL, GLASS_RIM_MASK_URL]) {
      const warmImage = new Image();
      warmImage.src = url;
      void warmImage.decode().catch(() => {});
    }
  }, [reducedMotion]);

  // Drive the warp straight from progress + fly; clear ALL inline styles at rest
  // so exiting the chat restores a pristine page.
  //
  // Perf: the page is scroll-locked / wheel-prevented for the whole gesture, so
  // the viewport, scroll position, and the chip landing slot can't move — we
  // cache them ONCE on "engage" (the first applied frame) and keep the per-frame
  // apply() free of forced layout reads. A single rAF coalesces the two
  // MotionValue subscriptions so apply() runs at most once per browser frame
  // (progress + fly otherwise both fire → apply twice). The full-page fisheye
  // filter — the dominant cost — is REMOVED (string cleared, not just zeroed)
  // the instant its bulge is imperceptible, so Blink drops the filter layer
  // instead of rasterizing every page pixel through the shader each frame. And
  // while it IS attached its attributes are held still: the radius animation
  // lives entirely in the clip layer's transform, and only the quantized
  // refraction envelope is ever written back into the graph.
  useEffect(() => {
    if (reducedMotion) return;
    let applied = false;

    // Per-gesture cache, (re)populated by engage() on the first applied frame.
    let vh = 0;
    let vw = 0;
    let cx = 0;
    let cyDoc = 0;
    let centerViewportY = 0;
    let referenceRadius = 0;
    let hasDef = false;
    let target = { cx: 0, cy: 0, d: CHIP_DIAMETER };
    // Final fly scale — depends only on the (cached) chip slot size, so it's
    // computed once in engage() rather than every frame.
    let sFinal = 1;
    // Which rung of the rim's counter-scale ladder is currently painted, and how
    // many times this gesture has repainted it (bounded by MAX_SHEEN_RIM_WRITES).
    let appliedRimRung: number | null = null;
    let rimWrites = 0;
    // The geometry version engage() measured, so a mid-gesture resize can be
    // detected and re-engaged rather than silently desynchronising.
    let engagedGeometryVersion = -1;

    const engage = () => {
      vh = window.innerHeight;
      vw = window.innerWidth;
      const geo = geometryRef.current;
      cx = geo ? geo.centerX : vw / 2;
      cyDoc = geo ? geo.centerY : window.scrollY + vh / 2;
      referenceRadius = geo
        ? geo.referenceRadius
        : (Math.hypot(vw, vh) / 2) * PORTHOLE_MAX_RADIUS_FACTOR;
      // The porthole centre in VIEWPORT coordinates, for the fixed-position
      // sheen. It is vh/2 in practice — the pull only happens at the bottom of a
      // page that is then scroll-locked — but deriving it rather than assuming
      // it keeps the sheen glued to the sphere if the two ever disagree.
      centerViewportY = cyDoc - window.scrollY;
      hasDef = !!document.getElementById("scrollchat-fisheye");
      appliedRimRung = null;
      rimWrites = 0;
      engagedGeometryVersion = geometryVersionRef.current;

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
      // transform-origin also pins here: the clip pivots BOTH the warp shrink
      // and the fly scale at the sphere centre (cx, cyDoc).
      const k = clipRef.current;
      if (k) {
        k.style.background = "var(--background)";
        k.style.position = "relative";
        k.style.zIndex = "9996";
        k.style.pointerEvents = "none";
        k.style.willChange = "transform";
        k.style.transformOrigin = `${cx}px ${cyDoc}px`;
        // The clip circle is STATIC now. It is drawn once at r0 and the same
        // transform that shrinks the page shrinks it, so the porthole still
        // reaches radius r on screen without a per-frame clip-path rewrite —
        // which, like a filter attribute, is a paint-path write.
        k.style.clipPath = `circle(${referenceRadius}px at ${cx}px ${cyDoc}px)`;

        // THE PORTHOLE IS A DISC OF RADIUS r0 IN THIS LAYER'S OWN SPACE, and r0
        // is deliberately larger than the page's half-width AND half-height — so
        // the clip circle reaches well outside the layer's box on every side.
        //
        // That never mattered while the circle shrank for real: by the time it
        // was small enough to see, it was comfortably inside the page. Now the
        // circle is frozen at r0 and the compositor scales it, so whatever the
        // silhouette looks like at r0 is what it looks like at EVERY size — and
        // at r0 the parts of the circle beyond the page box have nothing painted
        // in them. Left unfixed, the "sphere" is permanently flat-sided and cut
        // off above its own bottom, at fixed proportions, forever.
        //
        // A box-shadow with a large spread paints the page's background out to
        // r0 in every direction, and clip-path then cuts it back to the circle.
        // Deliberately a shadow and not a child element: shadows are INK
        // overflow, so this adds nothing to the document's scrollable overflow —
        // a real element at inset:-r0 would widen the page and, worse, feed its
        // own height back into the next recompute()'s scrollHeight.
        k.style.boxShadow = `0 0 0 ${referenceRadius}px var(--background)`;

        // ...but any mask clips the element to `mask-clip`, which defaults to
        // border-box and would amputate exactly the ink we just added, bringing
        // the flat sides straight back the moment the feather engages. Opt out,
        // and stretch the mask's painting area over the disc so the gradient has
        // somewhere to land out there. Static; only the image itself is written
        // per frame (see the feather in apply()).
        k.style.maskClip = "no-clip";
        k.style.maskRepeat = "no-repeat";
        const maskSpan = `calc(100% + ${2 * referenceRadius}px)`;
        k.style.maskSize = `${maskSpan} ${maskSpan}`;
        k.style.maskPosition = `${-referenceRadius}px ${-referenceRadius}px`;
      }

      // The sheen's BOX is fixed (SHEEN_BASE_RADIUS) and parked on the porthole
      // once; its size on screen comes from the transform. Writing left/top/
      // width/height every frame, as this used to, is layout-inducing work for a
      // purely decorative overlay.
      const sheen = sheenRef.current;
      if (sheen) {
        sheen.style.width = `${2 * SHEEN_BASE_RADIUS}px`;
        sheen.style.height = `${2 * SHEEN_BASE_RADIUS}px`;
        sheen.style.left = `${cx - SHEEN_BASE_RADIUS}px`;
        sheen.style.top = `${centerViewportY - SHEEN_BASE_RADIUS}px`;
      }
    };

    const clearStyles = () => {
      const c = contentRef.current;
      const k = clipRef.current;
      const rim = rimRef.current;
      if (rim) rim.style.boxShadow = "";
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
        k.style.boxShadow = "";
        k.style.removeProperty("mask-clip");
        k.style.removeProperty("mask-repeat");
        k.style.removeProperty("mask-size");
        k.style.removeProperty("mask-position");
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
      appliedRimRung = null;
      rimWrites = 0;
      engagedGeometryVersion = -1;
      applied = false;
    };

    const apply = (p: number, f: number) => {
      const c = contentRef.current;
      const k = clipRef.current;
      if (!c || !k) return;
      if (!applied || engagedGeometryVersion !== geometryVersionRef.current) {
        engage();
      }

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

      // The forming circle's radius. r0 > the viewport diagonal, so the porthole
      // is invisible until the collapse has progressed; the sqrt pulls the
      // visible ball-up into the back HALF of the pull (not just its final
      // tenth), so you watch the page round into a sphere as you drag.
      const circleForm = Math.sqrt(collapse);
      const portholeRadius =
        referenceRadius + (CIRCLE_MIN_RADIUS - referenceRadius) * circleForm;
      // The compositor's entire share of the radius animation. r0 is the largest
      // radius the porthole takes, so this is ≤ 1 for the whole gesture: the
      // filtered layer is only ever scaled DOWN.
      const warpScale = portholeRadius / referenceRadius;

      // The refraction ENVELOPE — the only part of the lens that isn't linear in
      // the radius. It grows with the pull as the sphere rounds out, then is
      // KILLED as it flies, so the filter string can be dropped entirely and
      // Blink can release the filter layer during the commit.
      const refractionEnvelope = collapse * (1 - smoothstep(f / 0.5));
      // Peak edge displacement ON SCREEN, in px: a fraction of the CURRENT bezel
      // width (r × BEZEL), so the bend stays smooth as the sphere shrinks
      // instead of over-refracting the thin final rim. This is what the
      // compositor ends up producing — the attribute written below is the same
      // quantity at r0, which scale(r/r0) brings back to exactly this.
      const screenRefraction =
        portholeRadius * GLASS_BEZEL * GLASS_REFRACT * refractionEnvelope;
      const filterActive = hasDef && screenRefraction > 0.3;

      // INNER (contentRef): ONLY the glass lens — no whole-page brightness/blur/
      // opacity. The centre stays perfectly clear; distortion lives at the rim.
      // NOTE the filter goes here while the scale goes on the PARENT clip layer:
      // CSS filters run before transforms, so the graph is evaluated once at r0
      // in this element's own space and the parent's transform scales the result.
      c.style.filter = filterActive ? "url(#scrollchat-fisheye)" : "";
      c.style.willChange = filterActive ? "filter" : "";

      // The envelope, written straight through — see its doc block for why this
      // is the one graph write worth keeping per-frame. Everything else the
      // filter needs (the map square, the blur radius, the region) is static and
      // lives in the JSX; r0 rather than r, because the compositor's scale
      // brings it back to r.
      //
      // Gated on `filterActive`: while the filter string is detached there is no
      // graph to invalidate, so the write buys nothing and is skipped.
      if (filterActive) {
        // NEGATIVE = the MAGNIFY direction (edge content enlarged, wrapping the
        // curve), not the fisheye compression. Split the three channels around
        // it — blue bends more, red less — so the mismatch fringes the rim, and
        // only the rim, with prismatic colour.
        const glassScale =
          -referenceRadius * GLASS_BEZEL * GLASS_REFRACT * refractionEnvelope;
        const spread = glassScale * CHROMATIC_SPREAD;
        const channelScales = [
          glassScale - spread,
          glassScale,
          glassScale + spread,
        ];
        dispRefs.current.forEach((node, i) =>
          node?.setAttribute("scale", String(channelScales[i]))
        );
      }

      // Feather a soft band at the page's bottom edge early in the pull so the
      // chat peeks through softly there; it dissolves as the sphere forms (the
      // shrinking circle then reveals the chat radially instead).
      const feather = (1 - collapse) * Math.max(40, lift * 0.7);
      if (feather > 0.5) {
        // The mask lives on the clip layer, which the warp now scales — so
        // divide that scale back out to keep the feather the same thickness ON
        // SCREEN as it was when the clip layer sat at 1:1.
        //
        // engage() also stretched the mask's painting area r0 beyond the box on
        // every side (so it can cover the backdrop shadow rather than clipping
        // it off), which puts the mask's own bottom edge r0 BELOW the page's.
        // Add that back so the feather still lands on the page's bottom edge.
        const featherLocal = feather / warpScale;
        const m = `linear-gradient(to bottom, #000 calc(100% - ${
          referenceRadius + featherLocal
        }px), transparent 100%)`;
        k.style.setProperty("mask-image", m);
        k.style.setProperty("-webkit-mask-image", m);
      } else {
        k.style.removeProperty("mask-image");
        k.style.removeProperty("-webkit-mask-image");
      }

      // Transform: during the pull the sphere only lifts (TY = −lift, centered);
      // during the commit (`fly`) it flies down + shrinks into the measured chip
      // slot. transform-origin is pinned once in engage() so every scale pivots
      // at the sphere centre; sFinal is likewise cached (depends only on chip
      // size).
      const S = 1 + (sFinal - 1) * flyEase;
      const TYPull = -lift;
      const TX = (target.cx - cx) * flyEase;
      const TY = TYPull + (target.cy - centerViewportY - TYPull) * flyEase;

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

      // The clip layer carries BOTH halves of the motion: the fly/wobble morph
      // AND the porthole shrink, which used to be re-drawn into the filter and
      // the clip-path every frame. Its clip circle is r0, so the porthole lands
      // on screen at r0 × warpScale × Sx = r × Sx — the same radius as before.
      k.style.transform = `translate(${TX}px, ${TY}px) scale(${Sx * warpScale}, ${
        Sy * warpScale
      })`;

      // HANDOFF — dissolve the page-sphere over the fly's back half so only the
      // designed in-input chip (revealed beneath) remains; without it the raw
      // page-circle shows THROUGH the chip. Reverses symmetrically.
      const sphereAlpha = 1 - smoothstep((f - 0.62) / 0.28);
      k.style.opacity = String(sphereAlpha);

      // GLASS BODY — ride the SAME morph so the lens body tracks the page-circle
      // pixel-for-pixel. Its box is a constant SHEEN_BASE_RADIUS and was already
      // parked on the sphere centre by engage(), so the only per-frame writes are
      // the composited transform and opacity — never geometry. The sheen fades in
      // with the pull (×collapse) so a barely-formed circle isn't ringed in gray,
      // and out with the sphere on commit.
      const sheen = sheenRef.current;
      if (sheen) {
        sheen.style.display = "block";
        const sheenScale = portholeRadius / SHEEN_BASE_RADIUS;
        sheen.style.transform = `translate(${TX}px, ${TY}px) scale(${
          Sx * sheenScale
        }, ${Sy * sheenScale})`;
        // Ramp the sheen in faster than raw `collapse` (×1.4, clamped) so the
        // glass body reads as clearly gray by mid-pull — but still keyed off
        // `collapse`, so a huge barely-formed circle at the very start isn't
        // ringed in gray across the viewport.
        const sheenAlpha = sphereAlpha * Math.min(1, collapse * 1.4);
        sheen.style.opacity = String(sheenAlpha);

        // Counter-scale the rim rings and the two soft shadows so they keep the
        // thickness they were designed at at every sphere size — snapped to the
        // geometric ladder, and skipped entirely while the sheen is too faint to
        // show what it would paint. `S * sheenScale`, because the fly scale is
        // part of what the element is under; `S` and not `Sx`/`Sy` because
        // box-shadow has no anisotropic form and the liquid wobble is a ±7%
        // squash, far under a pixel of rim.
        const rim = rimRef.current;
        if (rim && sheenAlpha > SHEEN_VISIBLE_ALPHA) {
          const exactRung =
            Math.log(S * sheenScale) / Math.log(SHEEN_RIM_STEP);
          const rimDeadband =
            SHEEN_RIM_HYSTERESIS +
            Math.max(0, rimWrites - SHEEN_RIM_FREE_WRITES) *
              SHEEN_RIM_HYSTERESIS_GROWTH;
          if (
            rimWrites < MAX_SHEEN_RIM_WRITES &&
            (appliedRimRung === null ||
              Math.abs(exactRung - appliedRimRung) > rimDeadband)
          ) {
            appliedRimRung = Math.round(exactRung);
            rimWrites += 1;
            rim.style.boxShadow = rimShadow(rimScaleForRung(appliedRimRung));
          }
        }
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
  // the main thread. Doing that on the first frame of the pull IS the hitch, and
  // it matters MORE now that the region is the r0 disc rather than the viewport.
  //
  // The decoy carries the filter instead, ahead of time. `filterUnits` is
  // userSpaceOnUse with an explicit region, so the region — and therefore the
  // surface Blink allocates — is the same whether the filter hangs off the
  // page-sized content layer or off a 1px decoy.
  //
  // What this does NOT do is pre-compute the page's filtered pixels. The decoy's
  // SourceGraphic is one near-transparent pixel, not the page, so nothing about
  // its output transfers; the real content is still pushed through the graph on
  // the first frame that attaches the filter and again on every rung change.
  // The win is confined to the one-time setup — graph construction, <feImage>
  // fetch + decode, surface allocation — which is the part that would otherwise
  // land synchronously on the pull's very first frame.
  //
  // It is handed BACK the instant the pull starts: the decoy shares the one
  // <filter> element, so leaving it attached would keep a second region-sized
  // surface alive alongside the page's for the whole gesture.
  const filterReady = !!geometry;
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
      {/* Off-screen filter def. Every attribute here is static EXCEPT the three
          <feDisplacementMap scale>s: the region, the map square and the blur
          radius are all pinned to r0, and the gesture scales the result on the
          compositor instead of redrawing them. The three scales carry the one
          term that isn't linear in the radius — the refraction envelope — which
          apply() writes per frame, together. */}
      <svg
        aria-hidden
        width="0"
        height="0"
        className="pointer-events-none absolute"
        style={{ position: "absolute" }}
      >
        <defs>
          {geometry && (
            <filter
              id="scrollchat-fisheye"
              filterUnits="userSpaceOnUse"
              x={geometry.filterX}
              y={geometry.filterY}
              width={geometry.filterWidth}
              height={geometry.filterHeight}
              colorInterpolationFilters="sRGB"
            >
              {/* Neutral (no-displacement) field over the WHOLE region — R=G=128
                  means "don't move this pixel". Everything outside the glass
                  square falls back to this, so only the sphere refracts. */}
              <feFlood
                floodColor="rgb(128,128,128)"
                floodOpacity="1"
                result="neutral"
              />
              {/* The unit glass-map, pinned to the r0 disc. Its inscribed disc is
                  clear in the middle and bends only in the bezel — the edge-only
                  refraction. This used to be repositioned every frame to chase
                  the shrinking sphere; now the sphere is scaled onto IT. */}
              <feImage
                href={GLASS_MAP_URL}
                x={geometry.centerX - geometry.referenceRadius}
                y={geometry.centerY - geometry.referenceRadius}
                width={geometry.referenceRadius * 2}
                height={geometry.referenceRadius * 2}
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
              {/* LIQUID GLASS — refract each colour channel through the same
                  bezel at a slightly different strength (blue most, red least),
                  isolate it to its channel, then screen the three back together.
                  The mismatched refraction is what fringes the sphere's EDGE with
                  prismatic colour. Rendered from GLASS_CHANNELS so the three
                  passes can't drift out of sync.

                  These three `scale` values are the only attributes in this
                  whole graph that apply() ever writes, and they go out together
                  — so the fringe costs three PASSES per evaluation, but not one
                  extra evaluation. */}
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
                  Blur the sharp chromatic result, keep it only where the rim mask is
                  opaque, then lay that back OVER the crisp centre. The mask
                  geometry and the blur radius are pinned to r0 like the glass
                  map, so the compositor scales both back onto the sphere. */}
              <feImage
                href={GLASS_RIM_MASK_URL}
                x={geometry.centerX - geometry.referenceRadius}
                y={geometry.centerY - geometry.referenceRadius}
                width={geometry.referenceRadius * 2}
                height={geometry.referenceRadius * 2}
                preserveAspectRatio="none"
                result="blurmask"
              />
              <feGaussianBlur
                in="sharp"
                stdDeviation={geometry.referenceRadius * BLUR_FRACTION}
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
        {/* Outer = clip porthole + fly transform + warp scale; inner = the glass
            lens filter, evaluated once at r0 and scaled by the outer transform. */}
        <div ref={clipRef} data-warp-clip>
          <div ref={contentRef} data-warp-content>
            {children}
          </div>
        </div>
        {/* Glass BODY overlay — sits ABOVE the page-sphere (z 9997 > clip 9996).
            Fixed to the viewport (the wrapper has no transformed ancestor, same
            as ChatFooter). Its BOX is a constant 2×SHEEN_BASE_RADIUS parked on
            the sphere centre by engage(); only transform + opacity move per
            frame plus the counter-scaled shadows. The three stacked gradients
            are: (1) a soft top specular highlight, (2) a halo behind it, and
            (3) the gray sheen that is transparent through the centre and
            strengthens toward the rim. */}
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
            // mid-pull or 132px at the end. Layer 1: a tight, bright glint
            // hugging the top-left curve — a real strip, not a wash. Layer 2: a
            // soft halo behind it so the gloss has falloff, still well short of
            // centre. Layer 3: the gray glass BODY — a clearly-present tint
            // through the whole disc that ramps into a heavy gray rim.
            //
            //
            // The rim rings are NOT here: an earlier revision moved them into
            // percentage stops so they would need no per-frame write, but a
            // percentage stop scales with the element, which is exactly what a
            // 1px hairline must not do — it rendered 0.21px on the finished
            // sphere. They live on the rim child below, counter-scaled, which is
            // the only construction that holds their designed thickness at every
            // size. This element therefore carries NO box-shadow at all, so its
            // gradients are painted once and only ever re-composited.
            background:
              "radial-gradient(18% 23% at 29% 20%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.5) 44%, rgba(255,255,255,0) 72%)," +
              "radial-gradient(33% 41% at 33% 25%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 74%)," +
              "radial-gradient(circle at 50% 50%, rgba(148,152,164,0.38) 0%, rgba(142,146,158,0.4) 42%, rgba(122,126,140,0.52) 66%, rgba(98,102,118,0.68) 85%, rgba(72,76,92,0.82) 95%, rgba(208,214,226,0.52) 100%)",
          }}
        >
          {/* RIM — every box-shadow the glass has, on an element of its own.
              apply() rewrites this one string as the sphere shrinks so all four
              render at the px they were designed at (rimShadow), which no static
              declaration can do. Separated from the body above because that body
              is three radial gradients and would otherwise be re-rastered along
              with them; here the repaint is a bare ring. */}
          <div
            ref={rimRef}
            data-warp-sheen-rim
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "9999px",
              pointerEvents: "none",
            }}
          />
        </div>
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
