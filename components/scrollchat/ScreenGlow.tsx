"use client";

import { motion, useTransform } from "framer-motion";
import {
  ARMED_GLOW_INPUT,
  ARMED_GLOW_OUTPUT,
} from "@/lib/scrollchat/state";
import { useScrollChat } from "./ScrollChatProvider";

/**
 * Opacity the frame is held at while the gesture is merely ARMED — enough to
 * force Blink to paint (and therefore allocate + rasterize) the two stacked
 * full-viewport blurred image layers, so that allocation is not still pending
 * when `reveal` lifts them into view mid-gesture.
 *
 * Chrome composites to 8-bit channels, so this contributes at most 0.001 x 255
 * = 0.26 of one level and rounds away to nothing: the frame is exactly as
 * invisible as it was at opacity 0, and its visible ramp still starts at
 * progress 0.4 (Math.max never lowers `reveal`).
 */
const ARMED_PREWARM_OPACITY = 0.001;

/**
 * The "Apple Intelligence" frame: a soft, hue-cycling glow that hugs all four
 * edges (and especially the corners) of the VIEWPORT while AI mode is engaged.
 *
 *  - PRESENCE: fades in over the back half of the pull (`progress`) and is full
 *    once committed — it only appears once you swipe past the threshold.
 *  - ALIVE: the base layer slowly rotates its hue + breathes (CSS).
 *  - REACTIVE: a brighter copy flashes on top, its opacity driven by `glowPulse`
 *    — which spikes on every keystroke (harder on space) and springs back — so
 *    the frame visibly pulses as you type.
 *
 * Pointer-events-none and above the page, so it frames everything without ever
 * intercepting input.
 */
export default function ScreenGlow() {
  const {
    progress,
    glowPulse,
    phase,
    reducedMotion,
    // Renamed: `armed` already means the brightness ramp in this file.
    armed: gestureArmed,
  } = useScrollChat();

  // Overall presence: fades in over the back half of the pull, full in chat.
  const reveal = useTransform(progress, [0.4, 1], [0, 1]);
  // ...held off zero while armed, so the layer already exists by the time the
  // pull crosses 0.4. Pre-promotion only; the visible ramp is untouched.
  const revealPrewarmed = useTransform(
    [reveal, gestureArmed],
    ([revealed, isGestureArmed]: number[]) =>
      Math.max(revealed, isGestureArmed > 0 ? ARMED_PREWARM_OPACITY : 0)
  );
  // `opacity: 0` alone leaves the transform animation ticking site-wide. Hide
  // the whole glow subtree at true rest, then restore it at ARM TIME so Blink
  // still gets the pre-gesture frame needed to allocate and rasterize it.
  const glowVisibility = useTransform(
    [progress, gestureArmed],
    ([pullProgress, isGestureArmed]: number[]) =>
      pullProgress > 0.001 || isGestureArmed > 0 ? "visible" : "hidden"
  );
  // "Armed" accent: the bright layer steps up once the pull crosses the commit
  // threshold, then releases toward progress=1 so it never permanently washes
  // out the typing flash once in chat.
  const armed = useTransform(progress, ARMED_GLOW_INPUT, ARMED_GLOW_OUTPUT);
  // The bright copy has ONE opacity consumer — armed + typing flash combined
  // additively (two style bindings on the same property don't compose).
  const brightOpacity = useTransform(
    [glowPulse, armed],
    ([g, a]: number[]) => Math.min(1, a + Math.min(1, g))
  );
  // A touch of pulse-driven scale so the frame "breathes outward" as you type.
  const pulseScale = useTransform(glowPulse, [0, 1.3], [1, 1.05]);

  if (reducedMotion) {
    // Quiet, static frame only while engaged — no rotation/breathing/pulsing.
    if (phase === "idle") return null;
    return (
      <div className="pointer-events-none fixed inset-0 z-[9998]">
        <div className="scrollchat-screenglow-frame">
          <div className="scrollchat-screenglow-rotator scrollchat-screenglow-rotator--static">
            <div className="scrollchat-screenglow scrollchat-screenglow--static absolute inset-0" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      aria-hidden
      style={{ opacity: revealPrewarmed, visibility: glowVisibility }}
      className="pointer-events-none fixed inset-0 z-[9998]"
    >
      <motion.div style={{ scale: pulseScale }} className="absolute inset-0">
        {/* The static frame preserves the original viewport-relative mask. */}
        <div className="scrollchat-screenglow-frame">
          {/* One rotator keeps both filtered copies exactly phase-locked. */}
          <div className="scrollchat-screenglow-rotator">
            <div className="scrollchat-screenglow absolute inset-0" />
            <motion.div
              style={{ opacity: brightOpacity }}
              className="scrollchat-screenglow scrollchat-screenglow--bright absolute inset-0"
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
