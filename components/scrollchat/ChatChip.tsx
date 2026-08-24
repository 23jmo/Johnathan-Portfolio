"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimationControls, useTransform } from "framer-motion";
import { CHIP_ARRIVAL_SPRING } from "@/lib/scrollchat/state";
import { useScrollChat } from "./ScrollChatProvider";

const SIZE = 30;

/**
 * Arrival thresholds on `fly`, synchronized with PageWarp's circle dissolve
 * (which runs over f∈[0.62, 0.9]): the tile springs in as the circle fades so
 * the handoff reads as a crossfade. 0.1 of hysteresis between in/out prevents
 * flip-flopping when the fly spring overshoots.
 */
const ARRIVE_AT = 0.6;
const DEPART_AT = 0.5;

/**
 * The page-context chip — the warped page's final resting form, integrated as
 * the leading tile INSIDE the chat input (not a floating disc). It reads as a
 * tiny glossy app tile (page-coloured, diagonal sheen + faux home indicator).
 *
 * The warp flies the page-circle down to THIS slot — PageWarp measures the
 * outer `[data-chat-chip]` box (which never scales, so the measurement is
 * stable) — and dissolves the circle onto it while the inner tile springs in
 * underneath: a morph from page → in-input token. A soft glow brightens as the
 * visitor types (glowPulse).
 *
 * Arrival is driven off the `fly` MotionValue (NOT React phase) so it lands in
 * lockstep with the dissolving circle and can't stall the fly spring.
 */
export default function ChatChip() {
  const { fly, glowPulse } = useScrollChat();
  const controls = useAnimationControls();
  const arrivedRef = useRef(false);
  const glow = useTransform(glowPulse, [0, 1], [0.25, 0.8]);

  useEffect(() => {
    // If the chat is already open when this chip mounts, play the arrival right
    // away — no `change` event would fire.
    if (fly.get() >= ARRIVE_AT) {
      arrivedRef.current = true;
      controls.start("in");
    }
    const unsub = fly.on("change", (v) => {
      if (v >= ARRIVE_AT && !arrivedRef.current) {
        arrivedRef.current = true;
        controls.start("in");
      } else if (v < DEPART_AT && arrivedRef.current) {
        arrivedRef.current = false;
        controls.start("out");
      }
    });
    return unsub;
  }, [fly, controls]);

  return (
    // Outer box is the stable warp target — never transformed, so its rect is a
    // reliable landing slot regardless of the inner tile's arrival scale.
    <div
      data-chat-chip
      aria-hidden
      className="relative shrink-0 self-center"
      style={{ width: SIZE, height: SIZE }}
    >
      {/* soft colored ambient glow that brightens while typing */}
      <motion.div
        style={{ opacity: glow }}
        className="pointer-events-none absolute -inset-1 rounded-[12px] bg-[radial-gradient(circle,rgba(120,140,255,0.6),transparent_70%)] blur-[6px]"
      />
      <motion.div
        initial="out"
        animate={controls}
        variants={{
          // 0.6 floor keeps the tile near the dissolving circle's size — a
          // smaller floor reads as a separate object popping in from nothing.
          out: { scale: 0.6, opacity: 0 },
          in: {
            scale: 1,
            opacity: 1,
            transition: CHIP_ARRIVAL_SPRING,
          },
        }}
        style={{ background: "var(--background)" }}
        className="relative h-full w-full overflow-hidden rounded-[9px] border border-foreground/15 shadow-[0_3px_10px_-3px_rgba(0,0,0,0.6)]"
      >
        {/* glossy diagonal sheen */}
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),transparent_45%)]" />
        {/* faux home indicator */}
        <div className="absolute bottom-[3px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-foreground/30" />
      </motion.div>
    </div>
  );
}
