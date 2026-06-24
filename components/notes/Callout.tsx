import type { ReactNode } from "react";

type CalloutType = "note" | "tip" | "warning" | "important" | "caution";

interface CalloutConfig {
  label: string;
  icon: ReactNode;
  /** Tailwind classes for the tinted container, dark-aware. */
  container: string;
  /** Accent color for the icon + title row. */
  accent: string;
}

/**
 * Inline SVG icons keep the callout self-contained (no icon-library dependency)
 * and inherit `currentColor` so they tint with the accent automatically.
 */
const Icons = {
  note: (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-2 3a1 1 0 011-1h.5a1 1 0 011 1v3a1 1 0 11-2 0v-3z" />
    </svg>
  ),
  tip: (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M10 2a6 6 0 00-3.6 10.8c.3.22.5.55.55.92l.15 1.03A1 1 0 008.08 16h3.84a1 1 0 00.98-.83l.15-1.03c.05-.37.25-.7.55-.92A6 6 0 0010 2zM8 18a1 1 0 011-1h2a1 1 0 011 1 1 1 0 01-1 1H9a1 1 0 01-1-1z" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M8.26 3.1c.77-1.33 2.71-1.33 3.48 0l6.04 10.43c.77 1.33-.2 3-1.74 3H3.96c-1.54 0-2.51-1.67-1.74-3L8.26 3.1zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 7a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  ),
  important: (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  ),
  caution: (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 6a1 1 0 112 0v4a1 1 0 11-2 0V6zm1 9a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" />
    </svg>
  ),
};

const CONFIG: Record<CalloutType, CalloutConfig> = {
  note: {
    label: "Note",
    icon: Icons.note,
    container:
      "border-blue-400/40 bg-blue-50 dark:border-blue-400/30 dark:bg-blue-950/30",
    accent: "text-blue-600 dark:text-blue-400",
  },
  tip: {
    label: "Tip",
    icon: Icons.tip,
    container:
      "border-emerald-400/40 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-950/30",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    label: "Warning",
    icon: Icons.warning,
    container:
      "border-amber-400/50 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/30",
    accent: "text-amber-600 dark:text-amber-400",
  },
  important: {
    label: "Important",
    icon: Icons.important,
    container:
      "border-violet-400/40 bg-violet-50 dark:border-violet-400/30 dark:bg-violet-950/30",
    accent: "text-violet-600 dark:text-violet-400",
  },
  caution: {
    label: "Caution",
    icon: Icons.caution,
    container:
      "border-rose-400/40 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-950/30",
    accent: "text-rose-600 dark:text-rose-400",
  },
};

interface CalloutProps {
  type: string;
  children: ReactNode;
}

/**
 * Admonition box. Falls back to `note` styling for any unrecognized type so a
 * typo in the source never blows up the render.
 */
export default function Callout({ type, children }: CalloutProps) {
  const config = CONFIG[(type as CalloutType)] ?? CONFIG.note;

  return (
    <div
      className={`not-prose my-5 rounded-xl border px-4 py-3 ${config.container}`}
    >
      <div
        className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${config.accent}`}
      >
        {config.icon}
        <span>{config.label}</span>
      </div>
      <div className="text-sm leading-relaxed text-foreground/90 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}
