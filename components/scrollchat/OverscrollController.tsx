"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import { useScrollChat } from "./ScrollChatProvider";
import {
  ARM_ACCENT_RESET_RATIO,
  BOTTOM_DWELL_MS,
  COMMIT_RATIO,
  GESTURE_THRESHOLD,
  MOMENTUM_ATTENUATION,
  MOMENTUM_PROGRESS_CAP,
  PROGRESS_SPRING,
  REARM_COOLDOWN,
  WHEEL_STREAM_GAP,
} from "@/lib/scrollchat/state";
import { ensureAudio, playArm, playDialTick } from "@/lib/scrollchat/audio";

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
  // Timestamp of the most recent wheel event ANYWHERE on the page — used to
  // tell a fresh, deliberate pull from the momentum tail of an earlier scroll.
  const lastWheelAt = useRef(0);
  // When the page ARRIVED at the bottom (null while away from it). A pull only
  // arms after the page has SETTLED there for BOTTOM_DWELL_MS.
  const bottomSince = useRef<number | null>(null);
  const cooldownUntil = useRef(0);
  const phaseRef = useRef(phase);
  const pulling = useRef(false);
  const springRef = useRef<ReturnType<typeof animate> | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickStep = useRef(-1);
  // One-shot "armed" accent (crossed COMMIT_RATIO — release now = commit).
  const armAccentFired = useRef(false);
  // True while the ACTIVE pull was started by momentum spill (an inertia tail),
  // not a deliberate gesture — fed at a reduced, capped rate so it nudges but
  // never commits. Latched at pull start; re-evaluated only on the next pull.
  const momentumOnly = useRef(false);
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
      armAccentFired.current = false;
      momentumOnly.current = false;
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

    // Stamp when the page reaches the bottom; clear the stamp when it leaves.
    // Driven by scroll events (covers wheel, keyboard, scrollbar, and touch
    // inertia arrivals alike) + run once for a page that loads at the bottom.
    const trackBottom = () => {
      if (atBottom()) {
        if (bottomSince.current === null) bottomSince.current = performance.now();
      } else {
        bottomSince.current = null;
      }
    };
    trackBottom();

    // A pull may start any time we're idle + past cooldown + at the bottom.
    // Momentum is no longer blocked here — it's classified in onWheel and fed
    // gently, so leftover inertia nudges the warp without committing it.
    const canStart = () =>
      phaseRef.current === "idle" &&
      performance.now() >= cooldownUntil.current &&
      atBottom();

    // The page has SETTLED at the bottom (not just arrived mid-inertia).
    const dwellMet = () =>
      bottomSince.current !== null &&
      performance.now() - bottomSince.current >= BOTTOM_DWELL_MS;

    const stopSpring = () => {
      springRef.current?.stop();
      springRef.current = null;
    };

    const setFromBudget = () => {
      const ratio = Math.min(1, budget.current / GESTURE_THRESHOLD);
      progress.set(ratio);
      // Momentum nudges are purely visual — no dial ticks / haptics / arm
      // accent, so leftover scroll doesn't chirp or buzz.
      if (!reducedMotion && ratio > 0 && !momentumOnly.current) {
        const step = Math.floor(ratio * 12);
        if (step !== lastTickStep.current) {
          lastTickStep.current = step;
          playDialTick(ratio);
          vibrate(5);
        }
        // One-shot accent on crossing the commit threshold, with hysteresis
        // (re-arms only below ARM_ACCENT_RESET_RATIO) so hovering around the
        // line doesn't chatter the cue.
        if (!armAccentFired.current && ratio >= COMMIT_RATIO) {
          armAccentFired.current = true;
          playArm();
          vibrate(18);
        } else if (armAccentFired.current && ratio < ARM_ACCENT_RESET_RATIO) {
          armAccentFired.current = false;
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
      armAccentFired.current = false;
      momentumOnly.current = false;

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
      // Momentum pulls feed at a fraction of full strength and are capped well
      // below the commit line — they bulge the page a little, then spring back.
      const scaled = momentumOnly.current ? delta * MOMENTUM_ATTENUATION : delta;
      const ceiling = momentumOnly.current
        ? GESTURE_THRESHOLD * MOMENTUM_PROGRESS_CAP
        : GESTURE_THRESHOLD * 1.15;
      budget.current = Math.min(ceiling, Math.max(0, budget.current + scaled));
      const ratio = setFromBudget();
      if (ratio >= 1) {
        if (releaseTimer.current) clearTimeout(releaseTimer.current);
        endPull(); // fully armed → commit immediately (deliberate only)
      } else {
        scheduleRelease();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const sinceLastWheel = performance.now() - lastWheelAt.current;
      lastWheelAt.current = performance.now();

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
      if (!pulling.current) {
        if (!canStart()) return;
        // Classify this fresh pull: DELIBERATE only if it begins after a beat of
        // wheel silence AND the page has settled at the bottom. Otherwise it's
        // the inertia tail of the scroll that carried us here — allowed to
        // nudge the warp, but attenuated + capped so it can't commit.
        momentumOnly.current =
          sinceLastWheel < WHEEL_STREAM_GAP || !dwellMet();
      }
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
        if (!pulling.current) {
          if (!canStart()) return;
          // A finger drag is always deliberate — inertia scrolling emits no
          // touchmove, so there's no momentum tail to attenuate here.
          momentumOnly.current = false;
        }
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
    window.addEventListener("scroll", trackBottom, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", trackBottom);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      stopSpring();
    };
  }, [open, progress, reducedMotion]);

  return null;
}
