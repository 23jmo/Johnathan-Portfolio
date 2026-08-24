"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { ThinkingStage } from "@/types";

/**
 * The classic terminal braille cycle. Ten frames read as continuous rotation
 * while only ever swapping a single character, so the whole animation costs one
 * text-node mutation per tick — no layout, no paint beyond one glyph.
 */
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;

/**
 * Copy per stage. Every line except the `thinking` set is triggered by a real
 * `tool_start` event off the stream, so the text describes work that is
 * genuinely happening. `thinking` is the only speculative set, and it rotates
 * purely so a long first-token wait does not look frozen.
 */
const STAGE_MESSAGES: Record<ThinkingStage, readonly string[]> = {
  thinking: [
    "Thinking…",
    "Reading Johnathan's work…",
    "Connecting the dots…",
    "Pulling up the details…",
  ],
  sources: ["Checking the sources…"],
  videos: ["Finding the videos…"],
  surface: ["Building the card…"],
};
const MESSAGE_INTERVAL_MS = 2400;

export default function ThinkingIndicator({
  stage = "thinking",
}: {
  stage?: ThinkingStage;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [frameIndex, setFrameIndex] = useState(0);
  /**
   * A free-running tick rather than an index into the current array. Every
   * tool-driven stage has exactly one line, so `tick % length` pins it there
   * automatically — which means a stage change needs no state reset, and the
   * component avoids the cascading render that resetting from an effect causes.
   */
  const [messageTick, setMessageTick] = useState(0);

  const messages = STAGE_MESSAGES[stage] ?? STAGE_MESSAGES.thinking;

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % BRAILLE_FRAMES.length);
    }, FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const timer = window.setInterval(() => {
      setMessageTick((current) => current + 1);
    }, MESSAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [messages]);

  // A static glyph when motion is reduced — the copy still conveys progress.
  const glyph = prefersReducedMotion ? "⠿" : BRAILLE_FRAMES[frameIndex];

  return (
    <div className="flex items-center gap-2.5 text-[15px] leading-relaxed text-foreground/45">
      {/*
        aria-hidden is load-bearing, not cosmetic: this sits inside the message
        list's aria-live="polite" region, and a glyph changing ~12x a second
        would make a screen reader announce without pause. Only the message
        text below — which changes every few seconds — is exposed.
      */}
      <span
        aria-hidden="true"
        className="w-[1ch] shrink-0 font-mono text-base tabular-nums text-foreground/70"
      >
        {glyph}
      </span>
      <span>{messages[messageTick % messages.length]}</span>
    </div>
  );
}
