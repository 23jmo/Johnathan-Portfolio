"use client";

import { useEffect } from "react";
import type { Transition } from "framer-motion";
import { useDialKit } from "dialkit";
import { tuning } from "@/lib/scrollchat/tuning";
import {
  BOTTOM_DWELL_MS,
  COMMIT_RATIO,
  FLY_SPRING,
  GESTURE_THRESHOLD,
  MOMENTUM_ATTENUATION,
  MOMENTUM_PROGRESS_CAP,
  PROGRESS_SPRING,
  WHEEL_STREAM_GAP,
} from "@/lib/scrollchat/state";

/**
 * Dev-only tuning panel for the scroll-to-chat gesture.
 *
 * Every dial's default is the shipped constant, so opening the panel and
 * touching nothing reproduces production exactly — and a value that feels right
 * here can be moved into `lib/scrollchat/state.ts` verbatim.
 *
 * The values are pushed into the `tuning` store rather than returned to a
 * consumer, because the gesture handlers and the warp's rAF loop both read
 * imperatively; see that module for why. The push happens in an effect rather
 * than during render: writing to a module-scope object mid-render is a
 * side effect the React Compiler rejects outright, and under a re-render that
 * gets thrown away it would leave the store holding a value no dial shows. A
 * commit-time write is also plenty prompt for a tuning panel — the next wheel
 * event or animation frame reads the new number either way.
 */
/**
 * Translate one of DialKit's resolved spring controls into a framer-motion
 * transition.
 *
 * DialKit's spring control has a toggle that swaps the spring for a bezier
 * curve, which it resolves as `{type: "easing", duration, ease}`. framer-motion
 * calls that same thing a `"tween"` and has no `"easing"` type at all, so
 * handing the value straight over would silently produce an unrecognised
 * transition. Springs need no translation — the two libraries agree on that
 * shape — so they are merged onto the shipped constant, which keeps any field
 * the dial does not expose (`restDelta`) intact.
 */
function toMotionTransition(dialled: object, shipped: Transition): Transition {
  const resolved = dialled as {
    type?: string;
    duration?: number;
    ease?: [number, number, number, number];
  };
  if (resolved.type !== "easing") {
    return { ...shipped, ...dialled } as Transition;
  }
  return { type: "tween", duration: resolved.duration, ease: resolved.ease };
}

export default function ScrollChatDials() {
  const gesture = useDialKit("Scroll gesture", {
    // Pull distance for a full 0 -> 1 sweep. The headline "how hard is this to
    // scroll" number.
    difficulty: [GESTURE_THRESHOLD, 200, 3000, 10] as [
      number,
      number,
      number,
      number,
    ],
    commitAt: [COMMIT_RATIO, 0.2, 0.95, 0.01] as [number, number, number, number],
    touchGain: [2.2, 0.5, 6, 0.1] as [number, number, number, number],
  });

  const momentum = useDialKit("Momentum", {
    // How much of a trackpad inertia tail counts toward the pull. 0 ignores
    // momentum entirely (only a deliberate pull moves the warp).
    attenuation: [MOMENTUM_ATTENUATION, 0, 1, 0.01] as [
      number,
      number,
      number,
      number,
    ],
    progressCap: [MOMENTUM_PROGRESS_CAP, 0, 1, 0.01] as [
      number,
      number,
      number,
      number,
    ],
    dwellMs: [BOTTOM_DWELL_MS, 0, 1000, 10] as [number, number, number, number],
    streamGapMs: [WHEEL_STREAM_GAP, 0, 600, 10] as [
      number,
      number,
      number,
      number,
    ],
  });

  const warp = useDialKit("Warp", {
    // 1 = shipped (page shrinks into the chip). 0 = page holds still and the
    // glass closes over it. See ScrollChatTuning.pageZoom.
    //
    // This is the ONE dial whose default is not the shipped constant: the store
    // still defaults to 1, so production is unchanged, but the panel opens on
    // the half-way look that is the point of the experiment. Whatever number
    // ends up feeling right goes into `tuning.ts` and this line goes away.
    pageZoom: [0.5, 0, 1, 0.01] as [number, number, number, number],
  });

  const springs = useDialKit("Springs", {
    progress: { ...PROGRESS_SPRING },
    fly: { ...FLY_SPRING },
  });

  useEffect(() => {
    tuning.gestureThreshold = gesture.difficulty;
    tuning.commitRatio = gesture.commitAt;
    tuning.touchGain = gesture.touchGain;
    tuning.momentumAttenuation = momentum.attenuation;
    tuning.momentumProgressCap = momentum.progressCap;
    tuning.bottomDwellMs = momentum.dwellMs;
    tuning.wheelStreamGap = momentum.streamGapMs;
    tuning.pageZoom = warp.pageZoom;
    tuning.progressSpring = toMotionTransition(springs.progress, PROGRESS_SPRING);
    tuning.flySpring = toMotionTransition(springs.fly, FLY_SPRING);
  }, [gesture, momentum, warp, springs]);

  return null;
}
