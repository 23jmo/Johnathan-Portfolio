import type { Transition } from "framer-motion";
import {
  BOTTOM_DWELL_MS,
  COMMIT_RATIO,
  FLY_SPRING,
  GESTURE_THRESHOLD,
  MOMENTUM_ATTENUATION,
  MOMENTUM_PROGRESS_CAP,
  PROGRESS_SPRING,
  WHEEL_STREAM_GAP,
} from "./state";

/**
 * Live tuning values for the scroll-chat gesture and warp.
 *
 * This exists because the two things that need tuning are not both React. The
 * gesture layer reads its numbers inside non-passive `wheel`/`touchmove`
 * handlers and the warp reads its own inside a `requestAnimationFrame` loop —
 * neither can consume a hook's return value, and threading state into either
 * would mean re-subscribing listeners or restarting the loop on every dial drag,
 * which would itself change the feel being tuned.
 *
 * So the dials write into this plain mutable object and both layers read the
 * field at the moment they need it. That keeps the tuning path allocation-free
 * on the hot path, and it means the values are read at their point of use rather
 * than captured in a closure — which is exactly the semantics a tuning panel
 * needs, since a change should take effect on the very next event.
 *
 * The defaults are the SHIPPED constants, imported rather than copied. In
 * production `ScrollChatDials` never mounts, nothing writes here, and every read
 * returns the same value the constant always had — so this module is inert
 * outside development.
 */
export interface ScrollChatTuning {
  /** Pull distance, in px of accumulated scroll, for progress 0 -> 1.
   *  Higher = the pull takes more scrolling ("scroll difficulty"). */
  gestureThreshold: number;
  /** Fraction of the pull at which releasing commits into the chat. */
  commitRatio: number;
  /** How much of a momentum (inertia-tail) scroll is fed into the pull. */
  momentumAttenuation: number;
  /** Ceiling on how far momentum alone can drive progress. */
  momentumProgressCap: number;
  /** How long the page must sit at the bottom before a pull counts as
   *  deliberate rather than as the tail of the scroll that arrived there. */
  bottomDwellMs: number;
  /** Silence between wheel events above which a pull is deliberate, not a tail. */
  wheelStreamGap: number;
  /** Multiplier on touch drag distance, so finger pulls match wheel pulls. */
  touchGain: number;
  /**
   * How much the PAGE ITSELF shrinks as the porthole closes, 0..1.
   *
   * 1 reproduces the shipped behaviour: the page scales all the way down with
   * the porthole, so the chip is the whole homepage in miniature. 0 holds the
   * page at 1:1 and lets the glass close over it like a lens, so the chip is a
   * small crop instead. Values in between split the difference — the page
   * recedes a little while the glass does most of the travel.
   */
  pageZoom: number;
  /**
   * Transition for progress animating on its own (release snap-back, commit).
   *
   * Typed as the full `Transition` rather than the shipped spring's own shape
   * because DialKit's spring control can be flipped to an easing curve, which
   * resolves to `{type: "easing", duration, ease}` — a different object
   * entirely. Widening here is what makes that toggle usable instead of a type
   * error, and both values are only ever spread into `animate()`, which accepts
   * either.
   */
  progressSpring: Transition;
  /** Transition for the finished circle flying into the chip slot. */
  flySpring: Transition;
}

export const tuning: ScrollChatTuning = {
  gestureThreshold: GESTURE_THRESHOLD,
  commitRatio: COMMIT_RATIO,
  momentumAttenuation: MOMENTUM_ATTENUATION,
  momentumProgressCap: MOMENTUM_PROGRESS_CAP,
  bottomDwellMs: BOTTOM_DWELL_MS,
  wheelStreamGap: WHEEL_STREAM_GAP,
  touchGain: 2.2,
  pageZoom: 1,
  progressSpring: PROGRESS_SPRING,
  flySpring: FLY_SPRING,
};
