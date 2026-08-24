"use client";

import { useSyncExternalStore } from "react";

/**
 * Live tuning for the ORB TRANSITION — where the glass sphere is, how big it is
 * over time, and what it emits. The third member of the family:
 *
 *   - `tuning.ts`      — the GESTURE. How hard the pull is, how it springs.
 *   - `glassTuning.ts` — the OPTICS. How the lens bends, folds and frosts.
 *   - this file        — the MOTION. Where that lens goes.
 *
 * Split from `glassTuning` because the optics are SHARED: the same maps and the
 * same filter graph serve the orb and the `/glass-demo` bench, so a knob there
 * moves both. Nothing in here touches the lens profile — these numbers only
 * decide what the orb ASKS of it, which is what makes them safe to drag while
 * the transition is on screen.
 *
 * Seeded with the values the look was signed off at on `/orb-demo`, whose own
 * DialKit groups still win on that page. Re-tune there, then copy the numbers
 * into `ORB_TUNING_DEFAULTS`.
 *
 * In production `OrbDials` never mounts, nothing ever writes here, and every
 * read returns the default — so the store half is inert outside development.
 */
export interface OrbTuning {
  /* --- Motion. Radii are fractions of the viewport WIDTH. --- */
  /** Deliberately > 1: the orb is wider than the screen, so only an arc of it
   *  is ever in frame at the start. */
  startRadius: number;
  endRadius: number;
  /** How far below the bottom edge the centre starts, in start-radii. */
  startBelow: number;
  /** Where the settled bubble ends up, as a fraction of viewport height. */
  settleY: number;
  /** > 1 finishes the rise before the shrink finishes. Under 1 the orb is still
   *  climbing when it is already small enough to see past, and the swap shows. */
  riseBias: number;

  /* --- Reveal. The window over which the page crossfades to the chat. Wants to
     sit entirely inside the span where the orb still covers the middle of the
     screen, or the swap is visible around its edge. --- */
  swapFrom: number;
  swapTo: number;

  /* --- The emitted caustic pooling along the lower inside of the rim. Not
     physical, and deliberately so: there is no blue anywhere in the scene for
     the glass to bend, so this is the one part of the reference a refraction
     pass cannot produce. --- */
  /** Gone by this much progress — in the reference it dies well before the orb
   *  settles. */
  causticFadeBy: number;
  causticStrength: number;
  /** Where the band sits, as a fraction of the radius. Near 1 = hugging the rim. */
  causticBand: number;
  /** Half-thickness of the band, same units. */
  causticWidth: number;
  /** How far the band's centre is pushed below the sphere's — what turns a full
   *  ring into a smile that dies at the tips. */
  causticDrop: number;
  causticSoftness: number;
  causticHue: number;

  /* --- The commit leg: the throw to the chip slot and the handoff. --- */
  /** How high the throw arcs above a straight line, as a fraction of viewport
   *  height. */
  lob: number;
  /** Mirrors ChatChip's own arrival window so the two crossfade instead of one
   *  popping over the other. */
  dissolveFrom: number;
  dissolveTo: number;

  /* --- The orb's own material, painted over the refracted content. --- */
  /**
   * The white body wash, off at both ends. It gave the sphere presence over a
   * flat background by laying a translucent sheet over the very content the lens
   * exists to show. The meniscus line and the dark outer rim draw the silhouette
   * without touching the interior.
   *
   * Kept as knobs because the argument for them is real at the small end: a 30px
   * bubble has almost no refraction left to read by. If the orb vanishes at the
   * end of the flight, `milkSmall` is the one to lift.
   */
  milk: number;
  milkSmall: number;
  shadow: number;
  /**
   * Ceiling on the red-to-blue channel separation, in screen pixels.
   *
   * The shared `chromatic` knob is a FRACTION of the displacement scale, and
   * that scale is linear in the radius — so tuning that puts a ~3.6px fringe on
   * a 120px lens puts ~16px on a full-screen orb, which stops reading as glass.
   * With `chromaticRimOnly` at 1 the interior is protected, so this now only
   * governs how hard the EDGE disperses and can sit high.
   */
  chromaticMaxPx: number;
  /**
   * The frosted rim band, off. `PageWarp` wanted it — its porthole was a hole IN
   * the page and the band melded the edge into the surrounding pixels. The orb
   * is a free-standing object sitting ON the page with nothing to meld into, so
   * the same band is just a ring of haze eating the content behind the edge.
   */
  frost: number;
  /**
   * Confine the dispersion to the rim. This is what lets the middle stay
   * optically perfect while the edge goes violent — without it the two are the
   * same number, because a uniform spread blurs the interior by its own width.
   */
  chromaticRimOnly: number;

  /* --- How hard the orb drives the shared lens profile. --- */
  /**
   * Overall bend strength, well above 1 on purpose. A fold appears wherever
   * mag'(u) exceeds R/K, so driving K up LOWERS that threshold and widens the
   * band where the mapping stops being one-to-one — which is what makes content
   * at the rim get drawn several times over instead of merely stretched.
   */
  refraction: number;
  /**
   * How much of that bend survives as the orb shrinks. Refraction scales with
   * radius, so a small orb bends almost nothing on its own. At 0 the bend simply
   * follows the radius down and the bubble goes optically flat before it lands.
   */
  smallBoost: number;
}

export const ORB_TUNING_DEFAULTS: OrbTuning = {
  startRadius: 0.85,
  endRadius: 0.07,
  startBelow: 0.95,
  settleY: 0.28,
  riseBias: 1.5,

  swapFrom: 0.39,
  swapTo: 0.51,

  causticFadeBy: 0.59,
  causticStrength: 0.62,
  causticBand: 0.68,
  causticWidth: 0.08,
  causticDrop: 0.19,
  causticSoftness: 0.125,
  causticHue: 192,

  lob: 0.08,
  dissolveFrom: 0.62,
  dissolveTo: 0.9,

  milk: 0,
  milkSmall: 0,
  shadow: 0.23,
  chromaticMaxPx: 21,
  frost: 0,
  chromaticRimOnly: 1,

  refraction: 2.05,
  smallBoost: 0.25,
};

/**
 * The live values, held as ONE frozen object replaced wholesale on every
 * change.
 *
 * Wholesale rather than field-by-field (which is what `glassTuning` does)
 * because nothing reads these from a rAF loop: `OrbWarp` renders every frame of
 * the gesture anyway, so the snapshot IS the read path, and
 * `useSyncExternalStore` compares snapshots by identity — a store that mutated
 * in place would never report a change, and one that built a fresh object per
 * `getSnapshot` call would loop forever.
 */
let snapshot: OrbTuning = ORB_TUNING_DEFAULTS;

/** The server render has no dials, so it always sees the defaults. */
const serverSnapshot: OrbTuning = ORB_TUNING_DEFAULTS;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Push a dialled set. Called from `OrbDials` only. */
export function publishOrbTuning(next: OrbTuning) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/**
 * The numbers the orb should be drawn with right now: the defaults in
 * production, or whatever `OrbDials` last published in development.
 */
export function useOrbTuning(): OrbTuning {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );
}
