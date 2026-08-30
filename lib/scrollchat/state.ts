import type { PageContext } from "@/types";

/** Phases of the scroll-to-chat experience. */
export type ScrollChatPhase = "idle" | "warping" | "chat" | "reversing";

/** Wheel/touch budget (in px) required to fully arm the gesture. */
export const GESTURE_THRESHOLD = 2175;

/**
 * A pull is DELIBERATE (full strength) only if it begins after this much wheel
 * silence. Trackpad momentum (the "let go" inertia tail of the scroll that
 * brought you to the bottom) streams events continuously at ~16ms intervals, so
 * a pull that starts inside a live stream is classified as momentum and fed at
 * a reduced rate (see MOMENTUM_*). Touch is always deliberate: touchmove only
 * fires with a finger down, and inertia scrolling emits none.
 */
export const WHEEL_STREAM_GAP = 150;

/**
 * A pull is DELIBERATE only if the page has also settled at the bottom this
 * long. Complements WHEEL_STREAM_GAP: the gap classifies a steady tail, but a
 * single timing hiccup >150ms mid-tail would misread one event as deliberate.
 * Dwell is immune to hiccups — the scroll that CARRIED you to the bottom can't
 * masquerade as a deliberate pull, because arrival resets the clock.
 */
export const BOTTOM_DWELL_MS = 250;

/**
 * Momentum (an inertia tail arriving at the bottom) is no longer blocked — it
 * still nudges the warp, just gently. Its wheel deltas feed the gesture budget
 * at this fraction of a deliberate pull's, so leftover scroll gives a small
 * elastic response instead of nothing.
 */
export const MOMENTUM_ATTENUATION = 0.2;

/**
 * Hard ceiling on how far momentum alone can drive progress (0..1). Kept safely
 * below COMMIT_RATIO so an inertia tail can bulge the page a little but can
 * never form the sphere or commit — only a deliberate pull crosses the line.
 */
export const MOMENTUM_PROGRESS_CAP = 0.4;

/** Fraction of the threshold at which releasing commits into the chat. */
export const COMMIT_RATIO = 0.98;

/**
 * Distance (px) from the document bottom at which the gesture ARMS. Arming is
 * NOT a gesture threshold — firing still requires `atBottom()` (a gap inside
 * `BOTTOM_EPSILON`) and the same dwell/commit rules as before. Arming only
 * decides WHEN the feature is allowed to be expensive:
 *
 *  - the non-passive `wheel`/`touchmove` listeners attach only inside this
 *    window, so the rest of the site keeps Chrome's passive-scroll fast path;
 *  - the warp's glass filter and the screen glow pre-promote their GPU layers
 *    here, so the compositing cost is paid BEFORE the gesture instead of on its
 *    first frame.
 *
 * Sized as a short lead-in rather than a full viewport: long enough that the
 * wheel handler has already seen several events (and `lastWheelAt` is warm)
 * before the bottom is reached, short enough that the pre-promoted layers only
 * exist while the visitor is effectively standing at the footer.
 */
export const GESTURE_ARM_GAP = 240;

/** Cooldown after closing before the overscroll gesture can re-arm, in ms. */
export const REARM_COOLDOWN = 600;

/**
 * Spring used everywhere progress animates on its own (release snap-back,
 * commit, reverse). Snappy with a touch of overshoot — the "slight bounce".
 * The warp transforms clamp progress to [0,1] (useTransform clamps by default),
 * so the overshoot never over-warps.
 */
export const PROGRESS_SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 26,
  restDelta: 0.001,
};

/**
 * On commit, the `fly` beat launches once `progress` crosses this — overlapping
 * the two beats so the circle never visibly stalls between "formed" and "flies".
 */
export const FLY_OVERLAP_TRIGGER = 0.9;

/**
 * On close, `progress` starts unwinding once `fly` falls to this. Do not raise
 * above ~0.35: it's the safety margin that keeps the chat's dissolve (which
 * saturates at progress = COMMIT_RATIO) from fading the chat while the clip
 * circle doesn't yet cover the viewport.
 */
export const CLOSE_OVERLAP_TRIGGER = 0.3;

/** Max progress-velocity (units/s) carried into the commit spring — guards
 * against 10–20 units/s wheel spikes launching the warp like a slingshot. */
export const COMMIT_VELOCITY_MAX = 3;

/** Commit beat 2: the completed circle flying down into the chip slot. */
export const FLY_SPRING = {
  type: "spring" as const,
  stiffness: 260,
  damping: 26,
  restDelta: 0.001,
};

/** Exit springs — near-critically damped (no bounce, correct for an exit) and
 * faster than the entry, so leaving feels lighter than arriving. */
export const CLOSE_FLY_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  restDelta: 0.001,
};
export const CLOSE_PROGRESS_SPRING = {
  type: "spring" as const,
  stiffness: 360,
  damping: 30,
  restDelta: 0.001,
};

/** ChatChip arrival: ζ≈0.66 — a single ~7% overshoot settling in ~300ms,
 * synchronized with the page-circle's dissolve (playful, no wobble). */
export const CHIP_ARRIVAL_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 24,
  mass: 0.8,
};

/**
 * Hard ceiling on how long the exit ("reversing") may run before the provider
 * forces it to finish. The normal exit completes in ~350-550ms; if a spring is
 * interrupted mid-flight (HMR remount, a stray value.set() cancelling the
 * animation, a dropped frame) the phase would otherwise wedge at "reversing" —
 * body locked, gesture dead, warp styles cooked. The watchdog snaps both
 * values to 0 and flips idle, which also triggers the style-clear failsafe.
 */
export const REVERSING_WATCHDOG_MS = 1500;

/**
 * The one-shot "armed" accent fires when the pull crosses COMMIT_RATIO upward
 * and re-arms only after dropping back below this — hysteresis so wobbling
 * around the threshold doesn't chatter the haptic/audio cue.
 */
export const ARM_ACCENT_RESET_RATIO = 0.5;

/**
 * ScreenGlow's "armed" brightness ramp over `progress`: steps up just past the
 * commit threshold ("release now = commit"), holds, then releases toward 1 so
 * the bright layer never permanently washes out the typing flash once in chat.
 */
export const ARMED_GLOW_INPUT = [0.52, 0.62, 0.8, 1];
export const ARMED_GLOW_OUTPUT = [0, 0.5, 0.5, 0];

/**
 * Derive a human-friendly page context (title + path) from a pathname. Used to
 * label the chip that "flies into" the chat representing the page you came from.
 */
export function pageContextFromPath(path: string): PageContext {
  if (path === "/" || path === "") return { title: "Home", path: "/" };

  const segments = path.split("/").filter(Boolean);
  const [section, slug] = segments;

  const sectionLabel =
    section === "notes" ? "Notes" : section === "blog" ? "Blog" : section;

  if (slug) {
    const pretty = slug
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { title: `${capitalize(sectionLabel)} — ${pretty}`, path };
  }

  return { title: capitalize(sectionLabel), path };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
