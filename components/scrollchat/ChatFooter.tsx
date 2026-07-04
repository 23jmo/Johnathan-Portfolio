"use client";

import { useEffect, useRef } from "react";
import { motion, useTransform } from "framer-motion";
import { COMMIT_RATIO } from "@/lib/scrollchat/state";
import { useScrollChat } from "./ScrollChatProvider";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import NameGate from "./NameGate";

/**
 * The AI chat — a STATIONARY full-screen layer that lives *behind* the page. It
 * doesn't slide in; it's simply revealed (an opacity dissolve bound to
 * `progress`) as the page above warps into a circle and flies off as the chip.
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

  // The chat lives BEHIND the (now-opaque) page and is occluded by it except at
  // the feathered bottom edge. Its opacity ramps gradually with the pull so the
  // bottom peek starts VERY FAINT and reaches full only as you near the commit
  // point — the page lifting/feathering away is what reveals it, softly.
  const dissolve = useTransform(progress, [0, COMMIT_RATIO], [0, 1]);

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
              opacity: dissolve,
              visibility: panelVisibility,
              pointerEvents: open ? "auto" : "none",
            }
      }
      // `inset-0`: a full-screen stationary backdrop (NOT a rising footer). It's
      // outside any filtered/transformed ancestor in PageWarp's wrapper, so
      // fixed positioning resolves to the viewport.
      className="scrollchat-panel fixed inset-0 z-[9994] flex flex-col text-white outline-none"
    >
      {/* Minimal close affordance (Escape also works). */}
      <button
        type="button"
        onClick={close}
        aria-label="Close chat"
        tabIndex={open ? 0 : -1}
        className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/35 transition-colors hover:bg-white/5 hover:text-white/80"
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

      {/* Body — centered measure */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">
        {needsName ? (
          <NameGate onSubmit={setUserName} />
        ) : isEmpty ? (
          <motion.div
            style={reducedMotion ? undefined : { y: greetingRise }}
            className="flex flex-1 flex-col items-center justify-center text-center"
          >
            <h2 className="text-3xl font-medium tracking-tight text-white/90">
              Hi{userName ? ` ${userName}` : " there"}.
            </h2>
            <p className="mt-2 text-base text-white/45">
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
