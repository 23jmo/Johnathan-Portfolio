import type { Citation } from "@/types";

/**
 * A numbered citation pill linking to its source. Internal links navigate
 * within the site; external links open in a new tab. These are real,
 * keyboard-accessible anchors — the citations remain usable for AT users.
 */
export default function CitationChip({ citation }: { citation: Citation }) {
  return (
    <a
      href={citation.href}
      {...(citation.external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
    >
      <span className="font-mono text-[10px] text-white/50">
        [{citation.n}]
      </span>
      <span className="max-w-[14rem] truncate">{citation.label}</span>
      {citation.external && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M3 9l6-6M5 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </a>
  );
}
