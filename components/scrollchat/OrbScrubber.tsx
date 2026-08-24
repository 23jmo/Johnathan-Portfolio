"use client";

import { useEffect, useState } from "react";

import { FLY_OVERLAP_TRIGGER } from "@/lib/scrollchat/state";
import { setScrubHold } from "@/lib/scrollchat/scrub";

/**
 * A floating scrub bar that freezes the orb transition at an arbitrary frame,
 * so the `Orb · *` dials can be judged against a still image instead of a
 * 700ms blur.
 *
 * Deliberately NOT a DialKit group. DialKit renders a stack of labelled number
 * knobs, which is the right shape for tuning independent constants and the
 * wrong shape for walking a timeline — scrubbing wants one wide track you can
 * drag along and arrow-key through, and it wants to stay visible while the orb
 * covers the screen (DialKit's panel sits at z-index 0 in the page, so the
 * scene paints straight over it mid-transition).
 *
 * Hit `Hold` and the track owns the transition. The orb parks wherever it is
 * left and stays there — nothing decays it, because `OrbWarp` decides whether
 * it is live from the motion values themselves rather than from `phase` (which
 * stays "idle" for a scrubbed transition, since no gesture ever committed).
 *
 * Rendered only under `NODE_ENV === "development"` from `app/layout.tsx`.
 */

/**
 * The share of the track spent on `progress` (the orb rising and covering the
 * screen). The remainder is `fly` (the orb lobbing into the chip).
 *
 * Not a physical constant — just the split that gives each beat a usable amount
 * of travel. The rise has far more to look at than the flight, so it gets more
 * of the bar.
 */
const PROGRESS_SPAN = 0.6;

/**
 * Where `fly` starts on the track.
 *
 * DERIVED from `FLY_OVERLAP_TRIGGER` rather than typed in, because the real
 * commit overlaps the two beats — `ScrollChatProvider` launches `fly` the
 * moment `progress` crosses that trigger, NOT when it reaches 1. A track that
 * ran them strictly back-to-back would show a frame at the seam that the real
 * transition never renders, which is precisely the frame someone would then
 * waste time tuning.
 */
const FLY_START = PROGRESS_SPAN * FLY_OVERLAP_TRIGGER;

/** Arrow-key / button nudge, in track units. */
const STEP = 0.005;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const progressAt = (t: number) => clamp01(t / PROGRESS_SPAN);
const flyAt = (t: number) => clamp01((t - FLY_START) / (1 - FLY_START));

/** The dev hook `ScrollChatProvider` publishes. Read fresh on every write
 *  rather than cached: it is (re)assigned from an effect, so a reference taken
 *  at mount can go stale across a hot reload. */
type MotionHandle = { set: (value: number) => void };

function devMotionValues(): { progress: MotionHandle; fly: MotionHandle } | null {
  if (typeof window === "undefined") return null;
  const hook = (window as Window & {
    __scrollchat?: { progress?: MotionHandle; fly?: MotionHandle };
  }).__scrollchat;
  if (!hook?.progress || !hook.fly) return null;
  return { progress: hook.progress, fly: hook.fly };
}

/** Named beat for the current frame, so the readout says what you're looking at. */
function beatAt(t: number): string {
  if (t <= 0) return "at rest";
  if (t < FLY_START) return "rising";
  if (t < PROGRESS_SPAN) return "rise + fly overlap";
  if (t < 1) return "flying to chip";
  return "landed";
}

export default function OrbScrubber() {
  const [held, setHeld] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    setScrubHold(held);

    // A held frame pins the page inside a viewport-fixed scene, so the document
    // still scrolls while nothing on screen moves. Lock it: an inert scrollbar
    // reads as the page having seized up. Inline rather than the provider's
    // `.scrollchat-locked` class so the two mechanisms can never clobber each
    // other's cleanup.
    if (held) document.body.style.overflow = "hidden";
    else document.body.style.removeProperty("overflow");

    const values = devMotionValues();
    if (!values) return;

    if (!held) {
      values.progress.set(0);
      values.fly.set(0);
      return;
    }

    values.progress.set(progressAt(t));
    values.fly.set(flyAt(t));
  }, [held, t]);

  // Unmount (a hot reload, usually) must not leave the page frozen with a
  // locked body and a half-risen orb stuck over it.
  useEffect(
    () => () => {
      setScrubHold(false);
      document.body.style.removeProperty("overflow");
      const values = devMotionValues();
      values?.progress.set(0);
      values?.fly.set(0);
    },
    []
  );

  const nudge = (delta: number) => setT((current) => clamp01(current + delta));

  return (
    <div
      data-orb-scrubber
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        // Above the orb overlay (9997) and ScreenGlow (9998), or the transition
        // it is scrubbing paints straight over the control.
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(18,18,22,0.88)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 8px 28px -8px rgba(0,0,0,0.7)",
        font: "11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "rgba(255,255,255,0.82)",
        userSelect: "none",
      }}
    >
      <button
        type="button"
        onClick={() => setHeld((current) => !current)}
        style={{
          padding: "4px 9px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.16)",
          background: held ? "rgba(120,170,255,0.9)" : "transparent",
          color: held ? "#0b0b0f" : "rgba(255,255,255,0.82)",
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {held ? "HOLD" : "live"}
      </button>

      <button
        type="button"
        onClick={() => nudge(-STEP)}
        disabled={!held}
        style={stepButton(held)}
        aria-label="Step back one frame"
      >
        ◀
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={STEP}
        value={t}
        disabled={!held}
        onChange={(event) => setT(Number(event.target.value))}
        aria-label="Orb transition scrub"
        style={{ width: 260, accentColor: "#78aaff", opacity: held ? 1 : 0.4 }}
      />

      <button
        type="button"
        onClick={() => nudge(STEP)}
        disabled={!held}
        style={stepButton(held)}
        aria-label="Step forward one frame"
      >
        ▶
      </button>

      <span style={{ opacity: held ? 0.95 : 0.45, whiteSpace: "nowrap" }}>
        t {t.toFixed(3)} · p {progressAt(t).toFixed(3)} · f {flyAt(t).toFixed(3)}
      </span>

      <span
        style={{
          opacity: held ? 0.55 : 0.3,
          whiteSpace: "nowrap",
          minWidth: 118,
        }}
      >
        {beatAt(t)}
      </span>
    </div>
  );
}

function stepButton(enabled: boolean) {
  return {
    padding: "3px 7px",
    borderRadius: 5,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "rgba(255,255,255,0.82)",
    font: "inherit",
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.35,
  } as const;
}
