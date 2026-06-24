"use client";

import { motion, useTransform } from "framer-motion";
import { useScrollChat } from "./ScrollChatProvider";

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
  const { progress, glowPulse, phase, reducedMotion } = useScrollChat();

  // Overall presence: fades in over the back half of the pull, full in chat.
  const reveal = useTransform(progress, [0.4, 1], [0, 1]);
  // The typing flash: the bright copy's opacity tracks keystroke energy.
  const flash = useTransform(glowPulse, [0, 1], [0, 1]);
  // A touch of pulse-driven scale so the frame "breathes outward" as you type.
  const pulseScale = useTransform(glowPulse, [0, 1.3], [1, 1.05]);

  if (reducedMotion) {
    // Quiet, static frame only while engaged — no rotation/breathing/pulsing.
    if (phase === "idle") return null;
    return (
      <div className="pointer-events-none fixed inset-0 z-[9998]">
        <div className="scrollchat-screenglow scrollchat-screenglow--static absolute -inset-2" />
      </div>
    );
  }

  return (
    <motion.div
      aria-hidden
      style={{ opacity: reveal }}
      className="pointer-events-none fixed inset-0 z-[9998]"
    >
      {/* -inset-2 so the outer blur doesn't clip at the viewport edge. */}
      <motion.div style={{ scale: pulseScale }} className="absolute -inset-2">
        <div className="scrollchat-screenglow absolute inset-0" />
        <motion.div
          style={{ opacity: flash }}
          className="scrollchat-screenglow scrollchat-screenglow--bright absolute inset-0"
        />
      </motion.div>
    </motion.div>
  );
}
