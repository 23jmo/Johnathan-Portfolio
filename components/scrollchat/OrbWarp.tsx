"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import ChatFooter from "./ChatFooter";
import { CHIP_DIAMETER, CHIP_CENTER_FROM_BOTTOM } from "@/lib/scrollchat/chip";
import RefractionFilter from "./GlassRefractionFilter";
import { useScrollChat } from "./ScrollChatProvider";
import { useOrbTuning, type OrbTuning } from "@/lib/scrollchat/orbTuning";

/**
 * The scroll-to-chat transition: a giant glass orb rises from below the fold,
 * swaps the page for the chat behind itself while it covers the screen, then
 * shrinks and is thrown into the composer's chip.
 *
 * Replaces `PageWarp`, which warped the page ITSELF into a shrinking circle.
 * The difference is not cosmetic — it decides the whole component's shape:
 *
 *   - PageWarp had to hold the page's geometry (clip circle, counter-scale, fly
 *     transform) at 60fps, so it drove everything through imperative rAF writes
 *     and went to great lengths to keep React out of the frame loop.
 *   - Here the page NEVER MOVES. The only things that change per frame are the
 *     lens geometry, two crossfading opacities, and two overlay circles. That
 *     is small enough to render through React honestly (see the frame loop
 *     below), which is what lets this file be a near-transcription of the tuned
 *     bench at `app/orb-demo/page.tsx` rather than a re-derivation of it.
 *
 * The optics are not implemented here at all: `GlassRefractionFilter` is the
 * same graph, the same baked maps and the same `glassTuning` store the bench
 * uses. This file owns only WHERE the lens is and HOW BIG it is over time.
 */

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Remap `value` from [inMin, inMax] onto 0..1, clamped at both ends. */
function linearStep(value: number, inMin: number, inMax: number) {
  if (inMax === inMin) return value >= inMax ? 1 : 0;
  return Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
}

interface OrbGeometry {
  centerX: number;
  centerY: number;
  radius: number;
}

/** The measured landing slot, in viewport coordinates. */
interface ChipSlot {
  centerX: number;
  centerY: number;
  radius: number;
}

/**
 * Everything measured once when the gesture engages.
 *
 * Measured ONCE rather than per frame because the gesture holds the page still:
 * `OverscrollController` prevents the wheel for the whole pull and the provider
 * adds `body.scrollchat-locked` from the commit onward, so the viewport, the
 * scroll offset and the chip's landing slot cannot move while it runs. A
 * per-frame `getBoundingClientRect` would read the same numbers back and force
 * a layout flush inside the frame loop to do it.
 */
interface OrbStage {
  /** Viewport, excluding the scrollbar — `clientWidth`, not `innerWidth`. */
  width: number;
  height: number;
  /** Document scroll at engage. The page is re-hung at `-scrollY` (see below). */
  scrollY: number;
  /** What the wrapper must be pinned to while the page is out of flow. */
  documentHeight: number;
  chip: ChipSlot;
}

/**
 * Where the orb is at a given progress.
 *
 * The radius is interpolated GEOMETRICALLY (`r0 * (r1/r0)^t`) rather than
 * linearly, because it spans better than a factor of ten. A linear lerp across
 * that range spends most of its duration enormous and then collapses at the very
 * end; a geometric one shrinks at a constant RELATIVE rate, which is what reads
 * as a sphere receding rather than as a circle being deflated.
 */
function orbGeometryAt(
  progress: number,
  viewport: { width: number; height: number },
  tuning: OrbTuning
): OrbGeometry {
  const startRadius = tuning.startRadius * viewport.width;
  const endRadius = tuning.endRadius * viewport.width;

  const shrink = easeInOutCubic(progress);
  const radius = startRadius * Math.pow(endRadius / startRadius, shrink);

  // The rise is deliberately front-loaded relative to the shrink: the orb has to
  // be up over the content BEFORE it is small enough to see past, or the swap
  // happens in plain sight.
  const rise = easeOutCubic(Math.min(1, progress * tuning.riseBias));
  const startCenterY = viewport.height + startRadius * tuning.startBelow;
  const settleCenterY = tuning.settleY * viewport.height;

  return {
    centerX: viewport.width / 2,
    centerY: startCenterY + (settleCenterY - startCenterY) * rise,
    radius,
  };
}

/**
 * Fold the commit into the settled geometry.
 *
 * Kept separate from `orbGeometryAt` because the two are driven by DIFFERENT
 * inputs: `progress` is the pull, which the visitor can drag back and forth, and
 * `fly` is the commit, which only ever runs forward once the pull is released
 * past the threshold.
 *
 * The path is a LOB rather than a straight line: the orb has to climb high
 * enough to cover the whole screen while the content swaps, and the chip lives
 * down in the composer, so a direct interpolation would either skip the cover or
 * approach the slot from above at an angle that reads as falling.
 */
function flyToChip(
  settled: OrbGeometry,
  chip: ChipSlot,
  fly: number,
  lob: number
): OrbGeometry {
  const t = easeInOutCubic(Math.max(0, Math.min(1, fly)));
  const arc = Math.sin(Math.PI * t) * lob;
  return {
    centerX: settled.centerX + (chip.centerX - settled.centerX) * t,
    centerY: settled.centerY + (chip.centerY - settled.centerY) * t - arc,
    // Geometric again, for the same reason the shrink is: this leg spans another
    // order of magnitude.
    radius: settled.radius * Math.pow(chip.radius / settled.radius, t),
  };
}

/**
 * The caustic that pools along the lower inside of the rim while the orb is
 * large, and is gone by the time it has shrunk.
 *
 * Not physical, and deliberately so — it is the one part of the reference that a
 * refraction pass cannot produce, because there is no blue anywhere in the scene
 * for the glass to bend. It is light the orb is EMITTING, so it is painted as
 * its own layer rather than chased through the filter graph.
 */
function CausticRing({
  geometry,
  strength,
  tuning,
}: {
  geometry: OrbGeometry;
  strength: number;
  tuning: OrbTuning;
}) {
  if (strength <= 0.001) return null;
  const size = geometry.radius * 2;
  const common: CSSProperties = {
    position: "absolute",
    left: geometry.centerX - geometry.radius,
    top: geometry.centerY - geometry.radius,
    width: size,
    height: size,
    borderRadius: "50%",
    pointerEvents: "none",
    /*
     * NORMAL, not `screen`.
     *
     * `screen` is 1-(1-a)(1-b), so it can only ever lighten. Over a light page
     * a fully saturated blue has almost no headroom to move the pixel into,
     * which is how this layer came to be painted every frame and be invisible in
     * every screenshot.
     *
     * A caustic is not added light anyway: it is light REDISTRIBUTED, focused
     * into an arc by the curve of the glass and therefore missing from somewhere
     * else. In the reference the band is more saturated AND darker in red than
     * the paper around it, which no lightening blend can produce.
     */
    mixBlendMode: "normal",
    // Keeps the glow inside the sphere's silhouette. Without it the blur spills
    // a halo outside the rim and the orb reads as a lamp rather than as glass.
    WebkitMaskImage:
      "radial-gradient(circle at 50% 50%, #000 0 99%, transparent 100%)",
    maskImage:
      "radial-gradient(circle at 50% 50%, #000 0 99%, transparent 100%)",
  };

  /**
   * One lobe of the band, as a ring gradient pushed DOWN inside the sphere.
   *
   * The gradient's centre is offset rather than its stops being made asymmetric,
   * because an offset circle intersecting the silhouette is exactly what makes
   * the band a smile that dies out at the tips — which is the shape in the
   * reference, and is not something a symmetric ring can produce however it is
   * weighted.
   */
  const lobe = (
    lobeHue: number,
    lobeWidth: number,
    lobeOpacity: number,
    blurScale: number
  ): CSSProperties => ({
    ...common,
    opacity: strength * lobeOpacity,
    filter: `blur(${geometry.radius * tuning.causticSoftness * blurScale}px)`,
    /*
     * The fade-out stops carry the lobe's OWN hue at zero alpha rather than the
     * `transparent` keyword. `transparent` is rgba(0,0,0,0), so a gradient
     * running to it interpolates through black — invisible under `screen`, which
     * is how this survived, but a grey bruise on either side of the band now
     * that the layer composites normally.
     */
    background: `radial-gradient(circle at 50% ${
      50 - tuning.causticDrop * 100
    }%, hsl(${lobeHue} 100% 58% / 0) 0 ${
      (tuning.causticBand - lobeWidth) * 100
    }%, hsl(${lobeHue} 100% 58%) ${
      tuning.causticBand * 100
    }%, hsl(${lobeHue} 100% 58% / 0) ${
      (tuning.causticBand + lobeWidth) * 100
    }%)`,
  });

  return (
    <>
      {/* The wider, dimmer lobe, offset 65 degrees around the wheel from the main
          one — it survives at the tips where the main lobe has already fallen
          off, which is what fringes the band's ends. */}
      <div
        aria-hidden
        style={lobe(tuning.causticHue + 65, tuning.causticWidth * 1.9, 0.5, 1.9)}
      />
      <div aria-hidden style={lobe(tuning.causticHue, tuning.causticWidth, 1, 1)} />
    </>
  );
}

/**
 * The orb's own surface: the meniscus line on the silhouette, the soft dark rim
 * just outside it, the (currently muted) body wash, and the shadow it casts.
 *
 * All of this sits ON TOP of the refracted content rather than inside the
 * filter, because none of it is a function of what is behind the glass — it is a
 * function of the glass itself, and computing it per-pixel through an SVG
 * primitive would cost far more than painting a few gradients.
 */
function OrbSurface({
  geometry,
  milk,
  shadow,
}: {
  geometry: OrbGeometry;
  milk: number;
  shadow: number;
}) {
  const size = geometry.radius * 2;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: geometry.centerX - geometry.radius,
        top: geometry.centerY - geometry.radius,
        width: size,
        height: size,
        borderRadius: "50%",
        pointerEvents: "none",
        background: `radial-gradient(circle at 50% 45%, rgba(255,255,255,${
          milk * 0.5
        }) 0%, rgba(255,255,255,${milk * 0.16}) 62%, rgba(255,255,255,${
          milk * 0.55
        }) 92%, rgba(255,255,255,0) 100%)`,
        boxShadow: [
          /*
           * The meniscus line, riding just inside the silhouette.
           *
           * Neutral grey at half alpha rather than near-opaque white. White read
           * as a drawn outline around the disc — the one bright thing in frame.
           * A translucent grey still separates the orb from the page, but lets
           * the refracted content show through the line instead of capping it.
           */
          `inset 0 0 0 ${Math.max(
            0.6,
            geometry.radius * 0.004
          )}px rgba(128,128,128,0.5)`,
          // The soft dark rim just OUTSIDE it — the thing that separates the
          // sphere from the page more convincingly than any highlight does.
          `0 0 ${geometry.radius * 0.03}px rgba(90,60,50,0.28)`,
          // Contact shadow.
          `0 ${geometry.radius * 0.1}px ${
            geometry.radius * 0.22
          }px rgba(120,80,70,${shadow})`,
        ].join(", "),
      }}
    />
  );
}

/** Both MotionValues are at rest below this. */
const LIVE_EPSILON = 0.0005;

export default function OrbWarp({ children }: { children: ReactNode }) {
  const { progress, fly, reducedMotion } = useScrollChat();
  // Constant in production; re-published on every dial drag while `OrbDials` is
  // mounted in dev. Read through a snapshot rather than the store object so a
  // drag repaints even when `progress` is standing still — which is exactly the
  // case while tuning, since the pull holds at whatever it was left at.
  const tuning = useOrbTuning();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<OrbStage | null>(null);
  const [frame, setFrame] = useState({ progress: 0, fly: 0 });

  /**
   * `<ChatFooter />` as a stable element.
   *
   * This file re-renders on every frame of the gesture, and `children` survives
   * that for free — React bails out of a subtree whose element object is
   * identical between renders, and `children` arrives as the same object every
   * time. A `<ChatFooter />` written inline would NOT: JSX builds a fresh
   * element on each render, so the whole chat panel (message list included)
   * would reconcile sixty times a second for the length of the pull. Hoisting it
   * into a memo buys it the same bail-out the page gets.
   */
  const chatPanel = useMemo(() => <ChatFooter />, []);

  /**
   * Read the page's geometry. Called on engage and on resize-while-engaged.
   *
   * Must run BEFORE the collapsing styles are applied: once the page is
   * `position: absolute` the wrapper contributes no height, so its own height is
   * only measurable while it is still in flow.
   */
  const measure = useCallback((): OrbStage => {
    const wrapper = wrapperRef.current;
    const chipElement =
      document.querySelector<HTMLElement>("[data-chat-chip]");
    const chipRect = chipElement?.getBoundingClientRect();
    return {
      // `clientWidth`, not `innerWidth`: the classic scrollbar stays on screen
      // through the gesture, and an orb centred on `innerWidth / 2` would sit
      // half a scrollbar to the right of the content it is refracting.
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
      scrollY: window.scrollY,
      /*
       * NEVER SHRINK. The wrapper's own `offsetHeight` is what it contributes
       * to the document, so pinning to it looks exact — but it excludes
       * margins, and a margin on the page's outermost element collapses
       * straight through this wrapper and the scene without being counted.
       * Undershoot by even that much and the document gets shorter the instant
       * the page leaves flow, the browser clamps `scrollY` into the new range,
       * and the visitor is silently moved. Taking the larger of the two can
       * only ever leave a few unreachable pixels below the fold, for the length
       * of a gesture during which scrolling is blocked anyway.
       */
      documentHeight: Math.max(
        wrapper?.offsetHeight ?? 0,
        document.documentElement.scrollHeight
      ),
      // Land on the composer's real chip when it exists, and on the slot it
      // would occupy when it doesn't — the name gate replaces the whole input on
      // a first visit, so the element is genuinely absent for exactly the
      // visitors most likely to run the gesture. Same fallback constants
      // `PageWarp` used, so the two transitions land in the same place.
      chip:
        chipRect && chipRect.width > 0
          ? {
              centerX: chipRect.left + chipRect.width / 2,
              centerY: chipRect.top + chipRect.height / 2,
              radius: chipRect.width / 2,
            }
          : {
              centerX: document.documentElement.clientWidth / 2,
              centerY: window.innerHeight - CHIP_CENTER_FROM_BOTTOM,
              radius: CHIP_DIAMETER / 2,
            },
    };
  }, []);

  /**
   * Put the visitor back exactly where they were.
   *
   * Taking the page out of flow makes the document's height this component's
   * problem, and any moment where it comes up short is a moment the browser
   * clamps `scrollY` to fit — a clamp that is invisible while the page is
   * pinned at `-stage.scrollY`, and then dumps the visitor somewhere else the
   * instant it is handed back to normal flow. The height pin above is the
   * primary defence; this is the one that does not depend on getting the
   * arithmetic right.
   *
   * A layout effect rather than a plain one: React has already committed the
   * removal of the styles by the time this runs, so the document is back to its
   * full height and the scroll target is reachable again — and it runs BEFORE
   * paint, so the corrected position is the first one drawn.
   */
  const restoreScrollRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (stage) {
      restoreScrollRef.current = stage.scrollY;
      return;
    }
    const target = restoreScrollRef.current;
    restoreScrollRef.current = null;
    if (target === null) return;

    const restore = () => {
      if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target);
    };
    restore();
    // Re-asserted once on the next frame because the provider clears
    // `body.scrollchat-locked` (`overflow: hidden`) from its own effect, and
    // nothing orders that against this one — a scrollTo issued while the body
    // is still locked can be dropped.
    const raf = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  /**
   * The frame loop.
   *
   * `progress` and `fly` are MotionValues, so they change outside React
   * entirely. Both subscriptions funnel into ONE `requestAnimationFrame`, which
   * is what keeps this to a single re-render per frame rather than one per
   * value per event — a wheel burst can fire several changes inside a frame, and
   * a naive `setFrame` per change would render each of them.
   *
   * Engaging and releasing are decided here rather than off `phase`, because
   * `phase` stays "idle" for the whole PULL and only flips on commit — by which
   * time the orb has already crossed the screen.
   */
  useEffect(() => {
    if (reducedMotion) return;

    let scheduled = 0;
    let engaged = false;

    const flush = () => {
      scheduled = 0;
      setFrame({ progress: progress.get(), fly: fly.get() });
    };

    const sync = () => {
      const live =
        progress.get() > LIVE_EPSILON || fly.get() > LIVE_EPSILON;
      if (live && !engaged) {
        engaged = true;
        setStage(measure());
      } else if (!live && engaged) {
        engaged = false;
        setStage(null);
      }
      if (!scheduled) scheduled = requestAnimationFrame(flush);
    };

    // A resize mid-gesture would leave the lens, the crossfade and the landing
    // slot all working from a viewport that no longer exists. Re-measuring is
    // cheap and only ever happens while something is already on screen.
    const onResize = () => {
      if (engaged) setStage(measure());
    };

    const unsubProgress = progress.on("change", sync);
    const unsubFly = fly.on("change", sync);
    window.addEventListener("resize", onResize);
    sync();

    return () => {
      unsubProgress();
      unsubFly();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(scheduled);
    };
  }, [progress, fly, reducedMotion, measure]);

  if (reducedMotion) {
    return (
      <>
        {children}
        <ChatFooter />
      </>
    );
  }

  const settled = stage
    ? orbGeometryAt(frame.progress, stage, tuning)
    : { centerX: 0, centerY: 0, radius: 0 };
  const geometry = stage
    ? flyToChip(settled, stage.chip, frame.fly, tuning.lob * stage.height)
    : settled;

  const afterOpacity = linearStep(frame.progress, tuning.swapFrom, tuning.swapTo);
  const causticStrength =
    tuning.causticStrength *
    (1 - linearStep(frame.progress, 0, tuning.causticFadeBy));

  // The orb dissolves onto the chip tile rather than shrinking into it: the last
  // few pixels of travel are far too small for any refraction to read, and
  // holding the filter alive through the commit is exactly the frame budget
  // worth giving back.
  const handoff = linearStep(frame.fly, tuning.dissolveFrom, tuning.dissolveTo);
  const orbPresence = 1 - handoff;

  // 0 at full size, 1 at the small end.
  const smallness = stage
    ? 1 - Math.min(1, geometry.radius / Math.max(1, stage.width * 0.35))
    : 0;
  const bodyMilk = tuning.milk + (tuning.milkSmall - tuning.milk) * smallness;

  // Refraction is allowed to fade with the flight, because by then there is not
  // enough radius left for it to read anyway and the filter is the expensive
  // part. `smallness` is 0 at full size, so `smallBoost` leaves the big orb at
  // exactly the tuned strength and only lifts the shrinking one.
  const refractionEnvelope =
    orbPresence * tuning.refraction * (1 + tuning.smallBoost * smallness);

  /*
   * The lens costs a full-viewport raster through a nine-pass graph, so it is
   * only mounted while the orb is actually on screen. The orb spends the first
   * slice of the pull climbing up from below the fold, where the filter would be
   * a pure no-op — the displacement map is neutral everywhere outside the disc.
   *
   * Toggling `filter` on a `position: fixed; inset: 0` element is safe to do
   * mid-gesture: a filter makes its element the containing block for `fixed`
   * descendants, but this element's box IS the viewport, so the descendants
   * (`ChatFooter`, and the page's own `ThemeToggle` and now-playing widget)
   * resolve to the same rectangle either way and nothing shifts.
   */
  const lensActive =
    stage !== null &&
    orbPresence > 0.001 &&
    geometry.radius > 0.5 &&
    geometry.centerY - geometry.radius < stage.height;

  return (
    <>
      <div
        ref={wrapperRef}
        data-orb-wrapper
        /*
         * While the page is out of flow this wrapper is the only thing left
         * holding the document open. Without the pin, `position: absolute` on
         * the page would collapse the scroll height to zero, the browser would
         * clamp `scrollY` to 0, and the visitor would be returned to the top of
         * the page on exit — from a gesture that never scrolled.
         */
        style={stage ? { height: stage.documentHeight } : undefined}
      >
        <div
          data-orb-scene
          /*
           * The scene is pinned to the VIEWPORT, not to the document, and that
           * is the load-bearing decision in this file.
           *
           * The filter has to sit on an ancestor of the page for the orb to
           * refract it, and a filtered ancestor becomes the containing block for
           * every `position: fixed` descendant beneath it. Left on a
           * document-tall wrapper, that re-bases the page's fixed chrome onto a
           * box thousands of pixels long — the theme toggle jumps to the top of
           * the document and the full-bleed background layer stretches to the
           * document's height — at the exact moment the orb appears.
           *
           * Pinned to `inset: 0` the re-basing is a no-op, because the new
           * containing block and the viewport are the same rectangle. It also
           * makes the filter region the smallest it can be: one screen, rather
           * than the whole page.
           */
          style={
            stage
              ? {
                  position: "fixed",
                  inset: 0,
                  /*
                   * Zero, not a high number. A filter makes this a stacking
                   * context regardless, so the only thing the value decides is
                   * whether the scene out-ranks its own SIBLINGS — the "Ask my
                   * AI" button (9990) and the screen glow, both of which stay
                   * on screen through the pull and must not be painted over by
                   * a layer that is, for the first stretch of it, nothing but an
                   * opaque copy of the page.
                   */
                  zIndex: 0,
                  // The paper has to be INSIDE the filter, not behind it. A
                  // filter only ever sees its own subtree, and dispersing ink on
                  // TRANSPARENCY can only resolve to black: taps that land on a
                  // glyph contribute dark colour but a full unit of alpha, taps
                  // that miss contribute neither, so the alphas clamp to opaque
                  // while the colours sum to nothing. A rainbow IS the
                  // wavelengths that missed the ink still showing the page.
                  background: "var(--background)",
                  filter: lensActive ? "url(#scrollchat-orb)" : undefined,
                  willChange: lensActive ? "filter" : undefined,
                }
              : undefined
          }
        >
          {/* The chat lives BEHIND the page and is revealed by the crossfade, not
              by the page moving off it. Its own z-index is scoped by this
              holder's stacking context, so it cannot climb over the page. */}
          <div
            data-orb-chat
            style={
              stage
                ? { position: "absolute", inset: 0, zIndex: 0, opacity: afterOpacity }
                : undefined
            }
          >
            {chatPanel}
          </div>

          {/* THE PAGE. Re-hung at `-scrollY` so the same slice of it stays under
              the same pixels: the scene's box starts at the top of the viewport,
              while the page's own coordinates start at the top of the document.
              Both the wheel guard and `body.scrollchat-locked` hold that offset
              still for the length of the gesture. */}
          <div
            data-orb-page
            style={
              stage
                ? {
                    position: "absolute",
                    top: -stage.scrollY,
                    left: 0,
                    width: "100%",
                    zIndex: 1,
                    /*
                     * The page paints its own paper. At rest the body's
                     * background does that job, but the page is now a
                     * translucent layer sitting directly on top of an opaque
                     * near-black chat panel — without a background of its own
                     * the chat reads straight through the page from the first
                     * frame of the pull, long before the swap is meant to start.
                     */
                    background: "var(--background)",
                    opacity: 1 - afterOpacity,
                    pointerEvents: "none",
                  }
                : undefined
            }
          >
            {children}
          </div>
        </div>

        {/* The orb's material, OUTSIDE the filter: none of it is a function of
            what is behind the glass, so putting it in the graph would only make
            it something else to refract. */}
        {stage && orbPresence > 0.001 && (
          <div
            aria-hidden
            data-orb-overlay
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9997,
              pointerEvents: "none",
            }}
          >
            <CausticRing
              geometry={geometry}
              strength={causticStrength * orbPresence}
              tuning={tuning}
            />
            <OrbSurface
              geometry={geometry}
              milk={bodyMilk * orbPresence}
              shadow={tuning.shadow * orbPresence}
            />
          </div>
        )}
      </div>

      {lensActive && stage && (
        <RefractionFilter
          id="scrollchat-orb"
          center={{ x: geometry.centerX, y: geometry.centerY }}
          radius={geometry.radius}
          box={{ width: stage.width, height: stage.height }}
          envelope={refractionEnvelope}
          chromaticMaxPx={tuning.chromaticMaxPx}
          frost={tuning.frost}
          chromaticRimOnly={tuning.chromaticRimOnly}
        />
      )}
    </>
  );
}
