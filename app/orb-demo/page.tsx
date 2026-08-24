"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useDialKit } from "dialkit";

import RefractionFilter from "@/components/scrollchat/GlassRefractionFilter";
import { glassTuning } from "@/lib/scrollchat/glassTuning";
import {
  flyToChip,
  linearStep,
  orbGeometryAt,
  orbSizeUnit,
  type ChipSlot,
  type OrbGeometry,
} from "@/lib/scrollchat/orbGeometry";

/**
 * Scratch bench for the ORB REVEAL — a giant glass sphere that rises from below
 * the fold, swaps the content behind itself while it covers the screen, then
 * shrinks into a small settled bubble.
 *
 * Not linked from anywhere. It exists so the MOTION can be judged before any of
 * it touches the shipping scroll-to-chat transition, which is a different
 * animation entirely (the page warps into a circle that flies to a chip).
 *
 * The optics are NOT re-implemented here. `GlassRefractionFilter` is the same
 * graph, the same baked maps and the same `glassTuning` store PageWarp uses, so
 * every knob in the "Glass · *" dial groups moves this too. The only thing this
 * file owns is WHERE the lens is and HOW BIG it is over time — which is exactly
 * the difference between the two transitions.
 */

type Dial = [value: number, min: number, max: number, step: number];

/**
 * The blue caustic that pools along the lower inside of the rim while the orb is
 * large, and is gone by the time it has shrunk.
 *
 * Not physical, and deliberately so — it is the one part of the reference that a
 * refraction pass cannot produce, because there is no blue anywhere in the
 * scene for the glass to bend. It is light the orb is EMITTING. So it is painted
 * as its own layer rather than chased through the filter graph: a ring gradient
 * masked to the bottom of the sphere, heavily blurred, screen-blended, with a
 * wider magenta lobe underneath that survives at the tips where the blue has
 * already fallen off.
 */
function CausticRing({
  geometry,
  strength,
  band,
  width,
  drop,
  softness,
  hue,
}: {
  geometry: OrbGeometry;
  strength: number;
  band: number;
  width: number;
  drop: number;
  softness: number;
  hue: number;
}) {
  if (strength <= 0.001) return null;
  const size = geometry.radius * 2;
  const common: React.CSSProperties = {
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
     * `screen` is 1-(1-a)(1-b), so it can only ever lighten. Over this page's
     * cream backdrop — luminance around 0.95 — a fully saturated blue has about
     * 5% of headroom to move the pixel into, which is why the band was being
     * painted every frame and was invisible in every screenshot.
     *
     * A caustic is not added light anyway: it is light REDISTRIBUTED, focused
     * into an arc by the curve of the glass and therefore missing from
     * somewhere else. In the reference the band is more saturated AND darker in
     * red than the paper around it, which no lightening blend can produce.
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
    lobeBand: number,
    lobeWidth: number,
    lobeOpacity: number,
    blurScale: number
  ): React.CSSProperties => ({
    ...common,
    opacity: strength * lobeOpacity,
    filter: `blur(${geometry.radius * softness * blurScale}px)`,
    /*
     * The fade-out stops carry the lobe's OWN hue at zero alpha rather than the
     * `transparent` keyword. `transparent` is rgba(0,0,0,0), so a gradient
     * running to it interpolates through black — invisible under `screen`,
     * which is how this survived, but a grey bruise on either side of the band
     * now that the layer composites normally.
     */
    background: `radial-gradient(circle at 50% ${50 - drop * 100}%, hsl(${lobeHue} 100% 58% / 0) 0 ${
      (lobeBand - lobeWidth) * 100
    }%, hsl(${lobeHue} 100% 58%) ${lobeBand * 100}%, hsl(${lobeHue} 100% 58% / 0) ${
      (lobeBand + lobeWidth) * 100
    }%)`,
  });

  return (
    <>
      {/* The wider, dimmer lobe, offset 65 degrees around the wheel from the
          main one — it survives at the tips where the main lobe has already
          fallen off, which is what fringes the band's ends. The offset wraps
          past 360 (hsl handles that), so at the current magenta base this lobe
          lands in the reds. */}
      <div aria-hidden style={lobe(hue + 65, band, width * 1.9, 0.5, 1.9)} />
      <div aria-hidden style={lobe(hue, band, width, 1, 1)} />
    </>
  );
}

/**
 * The orb's own surface: the crisp specular line on the leading arc, the soft
 * dark rim just outside it, the frosted body, and the shadow it casts.
 *
 * All of this sits ON TOP of the refracted content rather than inside the
 * filter, because none of it is a function of what is behind the glass — it is a
 * function of the glass itself, and computing it per-pixel through an SVG
 * primitive would cost far more than painting four gradients.
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
        // A hair of body so the sphere has presence over a flat background, and
        // the grazing-angle brightening that makes the silhouette read.
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
           * as a drawn outline around the disc — the one bright thing in frame,
           * on a page that has no white in it anywhere else. A translucent grey
           * still separates the orb from the page, but lets the refracted
           * content show through the line instead of capping it.
           */
          `inset 0 0 0 ${Math.max(0.6, geometry.radius * 0.004)}px rgba(128,128,128,0.5)`,
          // The soft dark rim just OUTSIDE it — the thing that separates the
          // sphere from the page more convincingly than any highlight does.
          `0 0 ${geometry.radius * 0.03}px rgba(90,60,50,0.28)`,
          // Contact shadow.
          `0 ${geometry.radius * 0.10}px ${geometry.radius * 0.22}px rgba(120,80,70,${shadow})`,
        ].join(", "),
      }}
    />
  );
}

/** Halftone dot field. High-frequency content is what makes a lens legible — over
 *  a flat colour the most violent refraction in the world shows nothing. */
const HALFTONE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(rgba(120,70,55,0.30) 1.3px, transparent 1.6px)",
  backgroundSize: "11px 11px",
};

export default function OrbDemoPage() {
  const rawFilterId = useId();
  // useId returns colon-wrapped ids, which are illegal inside url(#...).
  const filterId = rawFilterId.replace(/[^a-zA-Z0-9_-]/g, "");

  const stageRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // Progress is addressable as `?p=0.35`, so a frame can be linked, reloaded and
  // screenshotted without driving the slider. Read once from the URL rather than
  // kept in sync with it — this is a scrub control, and pushing history on every
  // drag would bury the back button.
  const [progress, setProgress] = useState(() => {
    if (typeof window === "undefined") return 0;
    const requested = Number(
      new URLSearchParams(window.location.search).get("p")
    );
    return Number.isFinite(requested) ? Math.max(0, Math.min(1, requested)) : 0;
  });
  const [fly, setFly] = useState(() => {
    if (typeof window === "undefined") return 0;
    const requested = Number(
      new URLSearchParams(window.location.search).get("f")
    );
    return Number.isFinite(requested) ? Math.max(0, Math.min(1, requested)) : 0;
  });
  const chipRef = useRef<HTMLDivElement>(null);
  const [chipSlot, setChipSlot] = useState<ChipSlot | null>(null);
  const playRef = useRef(0);
  // A mirror of the values derived during render, so the bench handle can report
  // what the component ACTUALLY computed rather than what the dials claim. Every
  // wrong turn in this investigation came from reading one and assuming the
  // other.
  const readRef = useRef<Record<string, number>>({});

  const motion = useDialKit("Orb · motion", {
    // Radii as fractions of the stage's aspect-normalised size unit (see
    // `orbSizeUnit`), so the orb keeps its proportions on any screen — on a
    // landscape stage that unit IS the width. Start is deliberately > 1: the
    // reference orb is wider than the phone, which is why only an arc of it is
    // ever in frame at the beginning.
    startRadius: [1.35, 0.6, 3, 0.05] as Dial,
    endRadius: [0.1, 0.03, 0.5, 0.005] as Dial,
    // How far below the bottom edge the centre starts, in start-radii.
    startBelow: [0.95, 0, 2, 0.05] as Dial,
    // Where the settled bubble ends up, as a fraction of stage height. The
    // portrait value is what a tall stage interpolates toward — see
    // `orbSettleY`, which is why a phone-shaped frame settles lower.
    settleY: [0.3, 0, 1, 0.01] as Dial,
    settleYPortrait: [0.4, 0, 1, 0.01] as Dial,
    // > 1 finishes the rise before the shrink finishes. Under 1 the orb is still
    // climbing when it is already small enough to see past, and the swap shows.
    riseBias: [1.7, 1, 4, 0.05] as Dial,
    durationMs: [2200, 600, 6000, 50] as Dial,
  });

  const reveal = useDialKit("Orb · reveal", {
    // The window over which the content behind the orb crossfades. Wants to sit
    // entirely inside the span where the orb still covers the middle of the
    // stage, or the swap is visible around its edge.
    swapFrom: [0.39, 0, 1, 0.01] as Dial,
    swapTo: [0.51, 0, 1, 0.01] as Dial,
  });

  const caustic = useDialKit("Orb · caustic", {
    // Fades out as the orb shrinks — in the reference it is gone well before the
    // orb settles.
    fadeBy: [0.37, 0.05, 1, 0.01] as Dial,
    strength: [0.43, 0, 1, 0.01] as Dial,
    // Where the band sits, as a fraction of the radius. Near 1 = hugging the rim.
    band: [0.84, 0.4, 1.1, 0.01] as Dial,
    // Half-thickness of the band, same units.
    width: [0.23, 0.02, 0.4, 0.01] as Dial,
    // How far the band's centre is pushed below the sphere's, which is what
    // turns a full ring into a smile that dies at the tips.
    drop: [0.28, 0, 0.6, 0.01] as Dial,
    softness: [0.075, 0.01, 0.3, 0.005] as Dial,
    hue: [303, 0, 360, 1] as Dial,
  });

  const land = useDialKit("Orb · land", {
    // How high the throw arcs above a straight line to the slot, as a fraction
    // of stage height.
    lob: [0.08, 0, 0.4, 0.01] as Dial,
    // Where the orb hands off to the chip tile. Mirrors ChatChip's own arrival
    // window so the two crossfade instead of one popping over the other.
    dissolveFrom: [0.62, 0, 1, 0.01] as Dial,
    dissolveTo: [0.9, 0, 1, 0.01] as Dial,
  });

  /**
   * A big lens and a small one read by completely different means.
   *
   * Refraction scales with radius — a 500px sphere bends content across a
   * 250px band and needs almost no body of its own to be obvious, while a 30px
   * one has nothing left to bend and would simply vanish. So the body has to
   * come UP as the orb shrinks, or the flight to the chip happens invisibly and
   * the chip appears to arrive from nowhere.
   *
   * Two milk values interpolated by how small the orb has got, rather than one
   * value fought over: the big end wants to be nearly clear glass and the small
   * end wants to be a visible bubble, and no single number is both.
   */
  const surface = useDialKit("Orb · surface", {
    /*
     * Both at 0: the white body wash is OFF.
     *
     * It was here to give the sphere presence over a flat background, and it did
     * — by laying a translucent white sheet over the very content the lens
     * exists to show. Muting the halftone and the type it refracts is too high a
     * price for a silhouette, and the meniscus line plus the dark outer rim in
     * `OrbSurface` already draw that silhouette without touching the interior.
     *
     * Kept as dials rather than deleted because the argument for them is real at
     * the small end: a 30px bubble has almost no refraction left to read by. If
     * the orb vanishes at the end of the flight, `milkSmall` is the one to lift
     * — it only applies once the orb is genuinely tiny.
     */
    milk: [0, 0, 1, 0.01] as Dial,
    milkSmall: [0, 0, 1, 0.01] as Dial,
    shadow: [0.23, 0, 0.6, 0.01] as Dial,
    /**
     * Ceiling on the red-to-blue channel separation, in screen pixels.
     *
     * The shared `chromatic` knob is a FRACTION of the displacement scale, and
     * that scale is linear in the radius — so the tuning that puts a ~3.6px
     * fringe on the 120px bench lens puts ~16px on this orb, which stops
     * reading as glass.
     *
     * This is ALSO the clarity control, which is not obvious. Summing the
     * wavelength taps averages the page over the width of the spread, so the
     * spread is a directional blur as much as it is a colour split: at 16px the
     * halftone dots inside the orb smear into pastel dashes and the glass reads
     * as frosted, and at 6px they stay crisp and round and it reads as clear.
     * Raise it for more prism, lower it for more clarity — there is no setting
     * that gives both, because they are the same number.
     */
    chromaticMaxPx: [24, 0, 60, 0.5] as Dial,
    /*
     * The frosted rim band, off by default here.
     *
     * PageWarp wants it: the porthole is a hole IN the page, and the band is
     * what melds its edge into the surrounding pixels instead of ending in a
     * hard line. The orb is a free-standing object sitting ON the page, with
     * nothing to meld into — so the same band is just a ring of haze eating the
     * content behind the edge.
     */
    frost: [0, 0, 1, 0.05] as Dial,
    /*
     * Confine the dispersion to the rim.
     *
     * This is what lets the middle stay optically perfect while the edge goes
     * violent — the two used to be the same number, because a uniform spread
     * blurs the interior by its own width. At 1 the spectrum is kept only where
     * the rim mask ramps in and a single undispersed pass fills the rest.
     *
     * It is also why `chromaticMaxPx` is large again below: with the interior
     * protected, the cap now only governs how hard the EDGE disperses.
     */
    chromaticRimOnly: [1, 0, 1, 0.05] as Dial,
  });

  /**
   * The edge distortion, as knobs the ORB owns.
   *
   * The bend has two halves and only one of them can be live. How HARD it bends
   * is a per-frame multiplier on the displacement scale, so it can move every
   * frame for free — that is what these are. What SHAPE it bends with (how wide
   * the folded band is, how sharply it ramps into the rim) is baked into the
   * PNG pixels, so changing it means re-encoding the map. Those knobs already
   * exist under `Glass · rim fold` and `Glass · lens drive` in the same panel,
   * and they are deliberately GLOBAL: the same three images feed the shipping
   * PageWarp porthole, so a drag there changes the homepage too.
   *
   * These do not. They scale what the orb asks of the shared profile, which is
   * the knob you actually want while tuning this transition.
   */
  const lens = useDialKit("Orb · lens", {
    /*
     * Overall bend strength. The baked profile concentrates almost all of its
     * magnitude in the outer fifth of the radius, so raising this reads mostly
     * as "the edge distorts harder" even though it scales the whole field —
     * which is why it is the right single knob for the look being tuned.
     *
     * Sitting well above 1 is deliberate, and it is not just "more bend": a fold
     * appears wherever mag'(u) exceeds R/K, so driving K up LOWERS that
     * threshold and widens the band where the mapping stops being one-to-one.
     * That is what makes content at the rim get drawn several times over
     * instead of merely stretched, which is the effect being chased. The
     * interior survives it because `chromaticRimOnly` keeps the dispersion off
     * the middle — without that, a value this high would frost the whole disc.
     */
    refraction: [2.15, 0, 2.5, 0.05] as Dial,
    /*
     * How much of that bend survives as the orb shrinks.
     *
     * Refraction scales with radius, so a small orb bends almost nothing on its
     * own. At 0 the bend simply follows the radius down and the bubble goes
     * optically flat before it lands; above 0 the lens is driven harder as it
     * gets smaller, so the tiny end still reads as glass. This is the honest
     * version of what the white body wash was faking.
     */
    smallBoost: [0, 0, 3, 0.05] as Dial,
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width, height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Measure the landing slot in STAGE coordinates, the same way PageWarp
  // measures [data-chat-chip] in viewport coordinates: once, from the real
  // element, so the orb lands on whatever the composer actually renders rather
  // than on a hardcoded guess that drifts the moment the input changes.
  useEffect(() => {
    const stage = stageRef.current;
    const chip = chipRef.current;
    if (!stage || !chip || !viewport.width) return;
    const stageRect = stage.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    setChipSlot({
      centerX: chipRect.left - stageRect.left + chipRect.width / 2,
      centerY: chipRect.top - stageRect.top + chipRect.height / 2,
      radius: chipRect.width / 2,
    });
  }, [viewport.width, viewport.height]);

  /**
   * Imperative handle for screenshot sweeps.
   *
   * Both obvious ways to set a frame from outside fail here. Writing to the
   * range input does not work because React's value tracker swallows a
   * programmatic write, so `onChange` never fires and the DOM and the state
   * silently disagree. Navigating to `?p=…` does not work either, because Next
   * SOFT-navigates on a query-only change: the component never remounts, so the
   * `useState` initialiser that reads the URL never runs again and the page
   * renders a stale frame while the address bar says otherwise — which is
   * exactly the kind of thing that gets screenshotted and believed.
   *
   * One handle sidesteps both. The URL param still works for the first load.
   */
  useEffect(() => {
    const holder = window as unknown as { __orb?: unknown };
    // `glass` is the live optics store, exposed so a single knob can be A/B'd
    // from outside without rebuilding: set it, then nudge progress to force a
    // re-render. Isolating one term is the only reliable way to tell which part
    // of a stacked filter graph is producing an artefact.
    holder.__orb = { setProgress, setFly, glass: glassTuning, read: () => readRef.current };
    return () => {
      delete holder.__orb;
    };
  }, []);

  useEffect(() => () => cancelAnimationFrame(playRef.current), []);

  /**
   * Run the pull and then the commit, back to back.
   *
   * They are one timeline here only so the whole thing can be watched in one
   * go. In the real gesture the visitor drives `progress` by scrolling and
   * `fly` is what happens when they let go past the threshold, which is why the
   * two are separate values rather than one long curve.
   */
  const play = () => {
    cancelAnimationFrame(playRef.current);
    const pullMs = motion.durationMs;
    const flyMs = motion.durationMs * 0.5;
    let startedAt = 0;
    const step = (now: number) => {
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt;
      setProgress(Math.min(1, elapsed / pullMs));
      setFly(Math.max(0, Math.min(1, (elapsed - pullMs) / flyMs)));
      if (elapsed < pullMs + flyMs) {
        playRef.current = requestAnimationFrame(step);
      }
    };
    setProgress(0);
    setFly(0);
    playRef.current = requestAnimationFrame(step);
  };

  const settled = orbGeometryAt(progress, viewport, motion);
  const geometry = chipSlot
    ? flyToChip(settled, chipSlot, fly, land.lob * viewport.height)
    : settled;
  const afterOpacity = linearStep(progress, reveal.swapFrom, reveal.swapTo);
  const causticStrength =
    caustic.strength * (1 - linearStep(progress, 0, caustic.fadeBy));

  // The orb dissolves onto the chip tile rather than shrinking into it: the last
  // 30px of travel are far too small for any refraction to read, and holding the
  // filter alive through the commit is exactly the frame budget PageWarp goes
  // out of its way to give back.
  const handoff = linearStep(fly, land.dissolveFrom, land.dissolveTo);
  const orbPresence = 1 - handoff;

  // 0 at full size, 1 at the small end.
  const smallness =
    1 -
    Math.min(1, geometry.radius / Math.max(1, orbSizeUnit(viewport) * 0.35));
  const bodyMilk =
    surface.milk + (surface.milkSmall - surface.milk) * smallness;

  // Refraction is allowed to fade with the flight, because by then there is not
  // enough radius left for it to read anyway and the filter is the expensive
  // part. `smallness` is 0 at full size, so `smallBoost` leaves the big orb at
  // exactly the dialled strength and only lifts the shrinking one.
  const refractionEnvelope =
    orbPresence * lens.refraction * (1 + lens.smallBoost * smallness);

  // Written in an effect, not during render: a ref assignment in the render body
  // is exactly the impurity the React Compiler lint rejects, and this mirror is
  // pure diagnostics — it must not be the reason the bench stops compiling.
  useEffect(() => {
    readRef.current = {
      progress,
      fly,
      causticStrength,
      causticDialStrength: caustic.strength,
      causticFadeBy: caustic.fadeBy,
      orbPresence,
      chromaticMaxPx: surface.chromaticMaxPx,
    };
  });

  return (
    <main className="min-h-screen bg-[#efe2d8] p-6 text-[#3a2a24]">
      <div className="mx-auto max-w-[420px]">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={play}
            className="rounded-full bg-[#3a2a24] px-4 py-1.5 text-sm text-[#efe2d8]"
          >
            Play
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={progress}
            onChange={(event) => {
              cancelAnimationFrame(playRef.current);
              setProgress(Number(event.target.value));
            }}
            className="flex-1"
            aria-label="Transition progress"
          />
          <span className="w-10 text-right font-mono text-xs tabular-nums">
            {progress.toFixed(2)}
          </span>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <span className="w-10 text-xs opacity-60">fly</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={fly}
            onChange={(event) => {
              cancelAnimationFrame(playRef.current);
              setFly(Number(event.target.value));
            }}
            className="flex-1"
            aria-label="Commit progress"
          />
          <span className="w-10 text-right font-mono text-xs tabular-nums">
            {fly.toFixed(2)}
          </span>
        </div>

        <div
          ref={stageRef}
          className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[2.5rem] bg-[#f6e7dd]"
        >
          {/*
            The filter goes on the CONTENT, not on the orb. The displacement map
            is a unit disc composited over a neutral flood, so everywhere outside
            the orb the map says "don't move" — one filter over the whole stage
            therefore produces a lens that is local to wherever the disc happens
            to be. Putting it on an orb-sized element instead would clip the
            refraction to that element's own box and lose the content it needs to
            pull from.
          */}
          <div
            className="absolute inset-0"
            style={{
              filter: viewport.width ? `url(#${filterId})` : undefined,
              willChange: "filter",
              /*
               * The paper has to be INSIDE the filter, not behind it.
               *
               * The stage already paints this colour, so this looks redundant —
               * it is not. A filter only ever sees its own subtree, and with the
               * background left on the stage the source graphic was ink and dots
               * on TRANSPARENCY. Dispersion then has nothing to disperse: each
               * wavelength tap that lands on a glyph contributes its weighted
               * (dark) colour but a FULL unit of alpha, while every tap that
               * misses contributes neither colour nor coverage, because there is
               * no paper in the source for it to carry. The alphas sum and clamp
               * to opaque while the colours sum to nearly nothing, so every
               * fringe resolves to flat black instead of a spectrum.
               *
               * A rainbow is the wavelengths that DIDN'T land on the ink still
               * showing the page. They can only do that if the page is in the
               * source graphic.
               */
              backgroundColor: "#f6e7dd",
            }}
          >
            <div className="absolute inset-0" style={HALFTONE} />

            {/* BEFORE */}
            <div
              className="absolute inset-0 flex flex-col justify-center px-8"
              style={{ opacity: 1 - afterOpacity }}
            >
              <p className="text-4xl leading-tight font-medium tracking-tight">
                Johnathan Mo
              </p>
              <p className="mt-2 text-lg opacity-70">
                Builder. Currently at the intersection of design and systems.
              </p>
            </div>

            {/* AFTER */}
            <div
              className="absolute inset-0 flex flex-col justify-center px-8"
              style={{ opacity: afterOpacity }}
            >
              <p className="text-4xl leading-tight font-medium tracking-tight">
                Ask me anything.
              </p>
              <p className="mt-2 text-lg opacity-70">
                A conversation with everything I&apos;ve built, read and shipped.
              </p>
            </div>
          </div>

          {/*
            A stand-in for the real composer. Its only job is to render a slot
            with the same 30px geometry ChatChip does, so the landing can be
            judged against something real rather than against a coordinate.
          */}
          <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 backdrop-blur">
            <div
              ref={chipRef}
              data-chat-chip
              className="relative shrink-0"
              style={{ width: 30, height: 30 }}
            >
              {/* The tile the orb becomes: springs in under the dissolving orb,
                  exactly the crossfade ChatChip already does against the
                  page-circle. */}
              <div
                className="absolute inset-0 rounded-[9px] bg-[#f2ded2] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_3px_rgba(90,60,50,0.25)]"
                style={{
                  opacity: handoff,
                  transform: `scale(${0.6 + 0.4 * handoff})`,
                }}
              />
            </div>
            <span className="text-sm opacity-40">Ask me anything…</span>
          </div>

          {viewport.width > 0 && (
            <>
              <CausticRing
                geometry={geometry}
                strength={causticStrength * orbPresence}
                band={caustic.band}
                width={caustic.width}
                drop={caustic.drop}
                softness={caustic.softness}
                hue={caustic.hue}
              />
              <OrbSurface
                geometry={geometry}
                milk={bodyMilk * orbPresence}
                shadow={surface.shadow * orbPresence}
              />
              <RefractionFilter
                id={filterId}
                center={{ x: geometry.centerX, y: geometry.centerY }}
                radius={geometry.radius}
                box={viewport}
                envelope={refractionEnvelope}
                chromaticMaxPx={surface.chromaticMaxPx}
                frost={surface.frost}
                chromaticRimOnly={surface.chromaticRimOnly}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
