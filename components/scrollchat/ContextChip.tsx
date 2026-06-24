"use client";

import { motion } from "framer-motion";
import type { PageContext } from "@/types";

interface ContextChipProps {
  context: PageContext;
  onRemove?: () => void;
}

/**
 * The "page you came from" chip shown in the chat header. It carries a shared
 * `layoutId` so sub-phase 2d can fly the warp circle into this exact position
 * (framer-motion shared-layout animation). It doubles as the page context the
 * AI is grounded against.
 */
export default function ContextChip({ context, onRemove }: ContextChipProps) {
  return (
    <motion.div
      layoutId="scrollchat-context-chip"
      className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 py-1 pl-1 pr-2 text-xs text-white/80"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 via-violet-400 to-pink-400 text-[10px] font-bold text-black">
        {context.title.charAt(0).toUpperCase()}
      </span>
      <span className="max-w-[10rem] truncate">{context.title}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove page context"
          className="rounded-full p-0.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}
