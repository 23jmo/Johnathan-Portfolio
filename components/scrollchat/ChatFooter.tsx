"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useTransform } from "framer-motion";
import { useScrollChat } from "./ScrollChatProvider";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import NameGate from "./NameGate";

/**
 * How much of the panel the software keyboard is currently covering, in px.
 *
 * A `position: fixed` box is laid out against the LAYOUT viewport, and the
 * on-screen keyboard does not shrink that — so on a phone the composer sits
 * underneath the keyboard from the moment it opens, which is the only moment it
 * matters. The VISUAL viewport does shrink, and the difference between the two
 * is exactly the covered strip.
 *
 * The threshold is what keeps this from firing on anything else: a mobile URL
 * bar sliding back in moves the same two numbers apart by a few dozen pixels,
 * and reacting to that would make the panel twitch every time the page settles.
 * No keyboard is that short.
 */
const KEYBOARD_MIN_PX = 120;

function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      const covered =
        document.documentElement.clientHeight -
        (viewport.height + viewport.offsetTop);
      setInset(covered >= KEYBOARD_MIN_PX ? Math.round(covered) : 0);
    };

    sync();
    // `scroll` as well as `resize`: the visual viewport also PANS when the
    // keyboard opens over a focused field, and only its offset moves then.
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  return inset;
}

/**
 * The AI chat — a STATIONARY full-screen layer that lives *behind* the page. It
 * doesn't slide in; it's simply revealed, by `OrbWarp` crossfading the page off
 * it while a glass orb covers the screen.
 *
 * Deliberately Gemini-minimal: a clean dark field, a centered greeting when
 * empty, the conversation, and a single input pinned at the bottom. No seam, no
 * header chrome, no gradient type — the "Apple Intelligence" colour now lives in
 * the screen-framing glow, not in the panel itself.
 *
 * It only becomes interactive once the gesture commits (phase === "chat").
 */
export default function ChatFooter() {
  const {
    progress,
    phase,
    close,
    messages,
    isStreaming,
    needsName,
    userName,
    setUserName,
    sendMessage,
    reducedMotion,
  } = useScrollChat();

  const panelRef = useRef<HTMLDivElement>(null);
  const open = phase === "chat";
  const keyboardInset = useKeyboardInset();

  // NO opacity ramp of its own any more. This used to dissolve in over
  // [0, COMMIT_RATIO], which was the right curve when the page warped into a
  // shrinking circle and the chat was revealed by the page getting out of the
  // way. `OrbWarp` reveals it by crossfading instead, over a window chosen so
  // the swap happens while the orb still covers the middle of the screen — and a
  // second ramp here would multiply with that one, leaving the panel short of
  // full opacity for exactly the stretch of the pull where it is most visible.

  // Fully retire the panel at rest: `visibility: hidden` removes it from
  // paint, hit-testing, and the compositor (opacity: 0 alone keeps the layer).
  // Driven off `progress` directly — no re-render — so the first pull frame
  // flips it visible again in time for the reveal. Every engaged state
  // (pull, warping, chat, reversing) holds progress > 0, so gating on
  // progress alone is safe; the panel stays mounted because it must already
  // exist behind the page for the pull to reveal it.
  const panelVisibility = useTransform(progress, (p) =>
    p > 0.001 ? "visible" : "hidden"
  );

  // Arrival staging for the greeting ONLY: it rides the finger during the pull
  // and its last ~6px settle on the commit spring, so the chat doesn't just
  // statically exist behind the dissolve. Deliberately NOT applied to the input
  // container — PageWarp measures the chip slot once at progress≈0, so a
  // translated input would make the flying circle land below the real slot.
  const greetingRise = useTransform(progress, [0, 1], [14, 0]);

  // Focus the panel + restore focus on close, only while it's the live dialog.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  // Escape to close (also mid-warp, so the commit is abortable) + focus trap
  // (committed only).
  useEffect(() => {
    if (!open && phase !== "warping") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (!open) return;
      if (e.key === "Tab") {
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, phase, close]);

  const isEmpty = messages.length === 0;

  return (
    <motion.div
      ref={panelRef}
      data-warp-ignore
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      aria-label="Chat with Johnathan's AI"
      tabIndex={-1}
      // `inert` keeps the dissolving-in preview out of the tab order + AT tree
      // until the gesture commits. React 19 renders the boolean attr natively.
      inert={!open || undefined}
      style={
        reducedMotion
          ? {
              opacity: open ? 1 : 0,
              visibility: open ? "visible" : "hidden",
              pointerEvents: open ? "auto" : "none",
            }
          : {
              visibility: panelVisibility,
              pointerEvents: open ? "auto" : "none",
            }
      }
      // `inset-0`: a full-screen stationary backdrop (NOT a rising footer). It's
      // outside any filtered/transformed ancestor in PageWarp's wrapper, so
      // fixed positioning resolves to the viewport.
      className="scrollchat-panel fixed inset-0 z-[9994] flex flex-col text-foreground outline-none"
    >
      {/* Minimal close affordance (Escape also works).

          `z-20`, NOT `z-10`: the body wrapper below is also a positioned
          `z-10`, and it comes later in DOM order, so an equal z-index makes IT
          win the paint order and swallow every tap on this button. That reads
          as a phone-only bug because the wrapper is `w-full max-w-3xl mx-auto`
          — a centred 768px column that never reaches this corner on a desktop
          viewport, but edge-to-edge on anything narrower than ~820px. */}
      <button
        type="button"
        onClick={close}
        aria-label="Close chat"
        tabIndex={open ? 0 : -1}
        className="absolute right-4 top-4 z-20 rounded-full p-2 text-foreground/35 transition-colors hover:bg-foreground/5 hover:text-foreground/80"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {/* Body — centered measure. The keyboard inset is padding rather than a
          height, so the message list (which is the flex child that grows) gives
          up the space and the composer rides above the keyboard. */}
      <div
        style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4"
      >
        {needsName ? (
          <NameGate onSubmit={setUserName} />
        ) : isEmpty ? (
          <motion.div
            style={reducedMotion ? undefined : { y: greetingRise }}
            className="flex flex-1 flex-col items-center justify-center text-center"
          >
            <h2 className="text-3xl font-medium tracking-tight text-foreground/90">
              Hi{userName ? ` ${userName}` : " there"}.
            </h2>
            <p className="mt-2 text-base text-foreground/45">
              Ask me anything about Johnathan.
            </p>
          </motion.div>
        ) : (
          <MessageList messages={messages} isStreaming={isStreaming} />
        )}

        {!needsName && <ChatInput onSend={sendMessage} disabled={isStreaming} />}
      </div>
    </motion.div>
  );
}
