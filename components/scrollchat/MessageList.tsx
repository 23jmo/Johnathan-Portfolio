"use client";

import { useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@/types";
import MessageBubble from "./MessageBubble";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

/** Px of breathing room left above the pinned question. */
const TOP_GAP = 16;

export default function MessageList({ messages, isStreaming }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  // The id of the user turn we've already anchored to the top, so we anchor
  // ONCE per turn (and never yank the view while the answer streams in).
  const anchoredTurnRef = useRef<string | null>(null);

  // The id of the latest user message — a new value means a new turn began.
  let lastUserId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserId = messages[i].id;
      break;
    }
  }

  // Gemini-style threading: when a turn starts, scroll the user's question to
  // the TOP and let the answer grow downward (read top-to-bottom). A dynamic
  // trailing spacer guarantees there's always enough scroll range to lift the
  // question up there, even when the answer is short or the thread is long.
  useLayoutEffect(() => {
    const list = listRef.current;
    const spacer = spacerRef.current;
    if (!list || !spacer || !lastUserId) return;

    const userEl = list.querySelector<HTMLElement>(
      `[data-mid="${CSS.escape(lastUserId)}"]`
    );
    if (!userEl) return;

    // Height from the top of the latest question to the end of real content
    // (the spacer's top edge). Independent of the spacer's own height, so this
    // never feeds back on itself.
    const turnHeight =
      spacer.getBoundingClientRect().top - userEl.getBoundingClientRect().top;
    const needed = Math.max(0, list.clientHeight - turnHeight - TOP_GAP);
    spacer.style.height = `${needed}px`;

    // Anchor the question to the top exactly once per turn — never during the
    // stream, so the growing answer doesn't drag the viewport around.
    if (anchoredTurnRef.current !== lastUserId) {
      anchoredTurnRef.current = lastUserId;
      const delta =
        userEl.getBoundingClientRect().top - list.getBoundingClientRect().top;
      list.scrollTo({
        top: list.scrollTop + delta - TOP_GAP,
        behavior: "smooth",
      });
    }
  }, [messages, isStreaming, lastUserId]);

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="space-y-5 py-6">
        {messages.map((message) =>
          // No spinner: the empty pending assistant bubble simply renders
          // nothing until its first token streams in.
          message.role === "assistant" && message.content.length === 0 ? null : (
            <div key={message.id} data-mid={message.id} data-role={message.role}>
              <MessageBubble message={message} />
            </div>
          )
        )}
        {/* Dynamic spacer: keeps enough scroll range to pin the latest question
            to the top. Shrinks to 0 as a long answer fills the viewport. */}
        <div ref={spacerRef} aria-hidden />
      </div>
    </div>
  );
}
