"use client";

import { useRef, useState } from "react";
import { useScrollChat } from "./ScrollChatProvider";
import ChatChip from "./ChatChip";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Auto-growing text input, Gemini-minimal. Enter sends; Shift+Enter inserts a
 * newline. Every keystroke spikes the screen glow (`pulse`) — a small bump per
 * character, a bigger one per space (new word) — so the Apple-Intelligence frame
 * visibly reacts to typing.
 */
export default function ChatInput({
  onSend,
  disabled,
  placeholder = "Ask anything",
}: ChatInputProps) {
  const { pulse } = useScrollChat();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    // Pulse the glow: harder on space (a new word), a small bump per character.
    if (e.key === " ") pulse(0.85);
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey)
      pulse(0.3);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="pb-5 pt-2">
      <div className="flex items-end gap-2 rounded-[26px] border border-white/12 bg-white/[0.05] px-3 py-2.5 transition-colors focus-within:border-white/25">
        {/* Page-context chip — the warped page lands here as a leading tile. */}
        <ChatChip />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          aria-label="Message"
          className="max-h-[160px] flex-1 resize-none bg-transparent py-1 text-[15px] text-white placeholder:text-white/35 focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Send message"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all hover:bg-white/90 disabled:bg-white/15 disabled:text-white/40"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
