"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import { useScrollChat } from "./ScrollChatProvider";
import {
  COMMIT_RATIO,
  GESTURE_THRESHOLD,
  PROGRESS_SPRING,
  REARM_COOLDOWN,
} from "@/lib/scrollchat/state";
import { ensureAudio, playDialTick } from "@/lib/scrollchat/audio";

/** ms gap with no wheel/touch input before a pull counts as "released". */
const RELEASE_MS = 110;

/**
 * Detects an overscroll-past-bottom gesture and feeds it into `progress`.
 * Renders nothing — it's all event wiring.
 *
 *  - Engages only at the document bottom while pushing further down.
 *  - Accumulates a px budget → progress = budget / THRESHOLD (clamped 0..1).
 *  - On release: commits into the chat if progress ≥ COMMIT_RATIO, otherwise
 *    springs progress back to 0 with a snappy little bounce.
 *  - Pre-warms the warp snapshot while the visitor nears the footer so the
 *    effect starts without a capture hitch.
 */
export default function OverscrollController() {
  const { phase, progress, open, reducedMotion } = useScrollChat();

  const budget = useRef(0);
  const lastTouchY = useRef<number | null>(null);
  const cooldownUntil = useRef(0);
  const phaseRef = useRef(phase);
  const pulling = useRef(false);
  const springRef = useRef<ReturnType<typeof animate> | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickStep = useRef(-1);
  // Haptics are only allowed after a real touch (tap). Trackpad/wheel input
  // isn't a tap, so calling navigator.vibrate there is blocked + warns — gate it.
  const touchUsed = useRef(false);
  const vibrate = (pattern: number | number[]) => {
    if (touchUsed.current) navigator.vibrate?.(pattern);
  };

  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== "idle") {
      budget.current = 0;
      pulling.current = false;
      lastTickStep.current = -1;
      springRef.current?.stop();
      springRef.current = null;
    } else {
      // Closing the chat at the bottom shouldn't instantly re-arm the gesture.
      cooldownUntil.current = performance.now() + REARM_COOLDOWN;
    }
  }, [phase]);

  useEffect(() => {
    const docBottomGap = () =>
      document.documentElement.scrollHeight -
      (window.innerHeight + window.scrollY);

    const atBottom = () => docBottomGap() <= 2;

    const canStart = () =>
      phaseRef.current === "idle" &&
      performance.now() >= cooldownUntil.current &&
      atBottom();

    const stopSpring = () => {
      springRef.current?.stop();
      springRef.current = null;
    };

    const setFromBudget = () => {
      const ratio = Math.min(1, budget.current / GESTURE_THRESHOLD);
      progress.set(ratio);
      if (!reducedMotion && ratio > 0) {
        const step = Math.floor(ratio * 12);
        if (step !== lastTickStep.current) {
          lastTickStep.current = step;
          playDialTick(ratio);
          vibrate(5);
        }
      }
      return ratio;
    };

    const beginPull = () => {
      stopSpring();
      pulling.current = true;
    };

    const scheduleRelease = () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = setTimeout(endPull, RELEASE_MS);
    };

    const endPull = () => {
      if (!pulling.current) return;
      pulling.current = false;
      const ratio = Math.min(1, budget.current / GESTURE_THRESHOLD);
      budget.current = 0;
      lastTickStep.current = -1;

      if (ratio >= COMMIT_RATIO) {
        if (!reducedMotion) vibrate([12, 8, 20]);
        open(); // provider springs progress → 1, phase warping → chat
        return;
      }
      // Below the line: spring back to a flat page.
      if (reducedMotion) {
        progress.set(0);
        return;
      }
      springRef.current = animate(progress, 0, {
        ...PROGRESS_SPRING,
        onComplete: () => {
          springRef.current = null;
        },
      });
    };

    const applyDelta = (delta: number) => {
      budget.current = Math.min(
        GESTURE_THRESHOLD * 1.15,
        Math.max(0, budget.current + delta)
      );
      const ratio = setFromBudget();
      if (ratio >= 1) {
        if (releaseTimer.current) clearTimeout(releaseTimer.current);
        endPull(); // fully armed → commit immediately
      } else {
        scheduleRelease();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0) {
        // Scrolling up during a pull eases it back down rather than committing.
        if (pulling.current) {
          e.preventDefault();
          beginPull();
          budget.current = Math.max(0, budget.current + e.deltaY);
          setFromBudget();
          scheduleRelease();
        }
        return;
      }
      if (!pulling.current && !canStart()) return;
      ensureAudio();
      e.preventDefault();
      beginPull();
      applyDelta(e.deltaY);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchUsed.current = true; // a real tap — haptics are now permitted
      lastTouchY.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? null;
      if (y === null || lastTouchY.current === null) return;
      const delta = lastTouchY.current - y; // + when dragging up (scroll down)
      lastTouchY.current = y;

      if (delta > 0) {
        if (!pulling.current && !canStart()) return;
        ensureAudio();
        e.preventDefault();
        beginPull();
        applyDelta(delta * 2.2); // touch deltas are small; scale to feel right
      } else if (pulling.current) {
        e.preventDefault();
        beginPull();
        budget.current = Math.max(0, budget.current + delta * 2.2);
        setFromBudget();
        scheduleRelease();
      }
    };

    const onTouchEnd = () => {
      lastTouchY.current = null;
      if (pulling.current) {
        if (releaseTimer.current) clearTimeout(releaseTimer.current);
        endPull();
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      stopSpring();
    };
  }, [open, progress, reducedMotion]);

  return null;
}
