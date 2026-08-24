"use client";

import { useState } from "react";

/**
 * First-use gate: collect the visitor's name before chatting. Persisted to
 * localStorage via the provider's identity seam (no DB yet). Intentionally
 * lightweight — one field, friendly copy.
 */
export default function NameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 text-center">
        <div className="space-y-1.5">
          <p className="text-2xl font-medium tracking-tight text-foreground/90">
            What should I call you?
          </p>
          <p className="text-sm text-foreground/45">
            So I know who I&apos;m talking to.
          </p>
        </div>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          // 16px below `sm` for the same reason the composer is: under 16px,
          // iOS Safari zooms the page on focus and never zooms back.
          className="w-full rounded-[26px] border border-foreground/12 bg-foreground/[0.05] px-5 py-3 text-center text-base text-foreground transition-colors placeholder:text-foreground/35 focus:border-foreground/25 focus:outline-none sm:text-[15px]"
        />
        <button
          type="submit"
          disabled={name.trim().length === 0}
          className="w-full rounded-full bg-foreground px-4 py-3 text-sm font-medium text-black transition-all hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-foreground/40"
        >
          Start chatting
        </button>
      </form>
    </div>
  );
}
