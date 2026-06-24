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
          <p className="text-2xl font-medium tracking-tight text-white/90">
            What should I call you?
          </p>
          <p className="text-sm text-white/45">
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
          className="w-full rounded-[26px] border border-white/12 bg-white/[0.05] px-5 py-3 text-center text-[15px] text-white transition-colors placeholder:text-white/35 focus:border-white/25 focus:outline-none"
        />
        <button
          type="submit"
          disabled={name.trim().length === 0}
          className="w-full rounded-full bg-white px-4 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 disabled:bg-white/15 disabled:text-white/40"
        >
          Start chatting
        </button>
      </form>
    </div>
  );
}
