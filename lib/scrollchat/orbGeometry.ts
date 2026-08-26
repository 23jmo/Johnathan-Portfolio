/**
 * Where the glass orb is, how big it is, and where it lands.
 *
 * Extracted from `OrbWarp` because the `/orb-demo` bench had grown its own copy
 * of the same three functions, and two copies of a trajectory are two
 * trajectories — the only symptom being "the bench doesn't move like the real
 * thing" with no obvious cause. Same reason `GlassRefractionFilter` is shared:
 * the transition and its reference have to be the same object.
 *
 * The lens ITSELF is not here. This module owns only the orb's placement over
 * time; the optics live in `glassTuning` and `GlassRefractionFilter`.
 */

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Remap `value` from [inMin, inMax] onto 0..1, clamped at both ends. */
export function linearStep(value: number, inMin: number, inMax: number) {
  if (inMax === inMin) return value >= inMax ? 1 : 0;
  return Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
}

export interface OrbGeometry {
  centerX: number;
  centerY: number;
  radius: number;
}

/** The measured landing slot, in viewport coordinates. */
export interface ChipSlot {
  centerX: number;
  centerY: number;
  radius: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** The subset of `OrbTuning` this module reads. */
export interface OrbShape {
  startRadius: number;
  endRadius: number;
  startBelow: number;
  settleY: number;
  settleYPortrait: number;
  riseBias: number;
}

/**
 * The aspect the orb's numbers were dialled against — a landscape desktop.
 *
 * Everything below that names an aspect is measured against this one, so a
 * viewport shaped like the reference gets exactly the geometry that was signed
 * off, to within a percent.
 */
export const REFERENCE_ASPECT = 16 / 10;

/** Aspect at or below which a viewport is treated as fully portrait — a phone. */
export const PORTRAIT_ASPECT = 0.5;

const REFERENCE_DIAGONAL_PER_WIDTH = Math.hypot(1, 1 / REFERENCE_ASPECT);

/**
 * The length the orb's radii are fractions OF.
 *
 * They are authored as fractions of the viewport WIDTH, which is a safe unit
 * only while the viewport is shaped roughly like the one they were dialled on.
 * A portrait phone is not: `startRadius` 0.85 puts the orb at 94% of the frame
 * ACROSS and 43% of it DOWN, so the sphere reads as a marble floating in a tall
 * screen — and, worse, the page-to-chat crossfade then happens in plain sight
 * above and below it, which is the one thing the orb exists to hide.
 *
 * Keying the radii to the DIAGONAL makes them a fraction of the frame rather
 * than of one of its edges, which is the quantity the look actually depends on.
 * Dividing by the reference aspect's own diagonal-per-width is what keeps the
 * dialled numbers meaning what they meant: on a 16:10 viewport this returns the
 * width itself, so nothing on a desktop moves.
 */
export function orbSizeUnit(viewport: Viewport): number {
  return (
    Math.hypot(viewport.width, viewport.height) / REFERENCE_DIAGONAL_PER_WIDTH
  );
}

/**
 * Where the settled orb's centre sits, as a fraction of viewport height.
 *
 * `settleY` is dialled high in the frame, which is right on a landscape screen:
 * the orb is wider than it is tall there, so it still reaches the bottom
 * corners from up near the top. On a tall screen the same fraction leaves a
 * whole phone's worth of uncovered page below the sphere — exactly where the
 * composer the transition is flying toward lives. Sliding the settle toward the
 * middle as the viewport gets taller balances the two ends again.
 *
 * Interpolated rather than switched, so a tablet (or a rotating phone) crosses
 * the range continuously instead of jumping mid-gesture on a resize.
 */
export function orbSettleY(viewport: Viewport, shape: OrbShape): number {
  const aspect = viewport.width / Math.max(1, viewport.height);
  const tallness = linearStep(aspect, REFERENCE_ASPECT, PORTRAIT_ASPECT);
  return shape.settleY + (shape.settleYPortrait - shape.settleY) * tallness;
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
export function orbGeometryAt(
  progress: number,
  viewport: Viewport,
  shape: OrbShape
): OrbGeometry {
  const unit = orbSizeUnit(viewport);
  const startRadius = shape.startRadius * unit;
  const endRadius = shape.endRadius * unit;

  const shrink = easeInOutCubic(progress);
  const radius = startRadius * Math.pow(endRadius / startRadius, shrink);

  // The rise is deliberately front-loaded relative to the shrink: the orb has to
  // be up over the content BEFORE it is small enough to see past, or the swap
  // happens in plain sight.
  const rise = easeOutCubic(Math.min(1, progress * shape.riseBias));
  const startCenterY = viewport.height + startRadius * shape.startBelow;
  const settleCenterY = orbSettleY(viewport, shape) * viewport.height;

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
export function flyToChip(
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
