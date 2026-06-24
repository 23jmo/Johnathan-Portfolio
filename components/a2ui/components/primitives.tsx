import type { ReactNode } from "react";
import type { A2UIAction } from "@/types";

export interface A2UIComponentProps {
  props: Record<string, unknown>;
  children?: ReactNode;
  dispatch: (action: A2UIAction) => void;
}

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

/* ── Layout ─────────────────────────────────────────────────────── */

const GAP: Record<string, string> = {
  none: "gap-0",
  sm: "gap-1.5",
  md: "gap-3",
  lg: "gap-5",
};

const ALIGN: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

export function Row({ props, children }: A2UIComponentProps) {
  const gap = GAP[str(props.gap, "md")] ?? GAP.md;
  const align = ALIGN[str(props.align, "center")] ?? ALIGN.center;
  return <div className={`flex flex-wrap ${gap} ${align}`}>{children}</div>;
}

export function Column({ props, children }: A2UIComponentProps) {
  const gap = GAP[str(props.gap, "md")] ?? GAP.md;
  const align = ALIGN[str(props.align, "stretch")] ?? ALIGN.stretch;
  return <div className={`flex flex-col ${gap} ${align}`}>{children}</div>;
}

export function Card({ children }: A2UIComponentProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      {children}
    </div>
  );
}

export function List({ children }: A2UIComponentProps) {
  return <div className="flex flex-col divide-y divide-white/10">{children}</div>;
}

export function Divider() {
  return <hr className="my-1 border-0 border-t border-white/10" />;
}

/* ── Content ────────────────────────────────────────────────────── */

const TEXT_VARIANT: Record<string, string> = {
  title: "text-lg font-semibold text-white",
  subtitle: "text-sm font-medium text-white/90",
  body: "text-[15px] text-white/85 leading-relaxed",
  caption: "text-xs text-white/55",
};

export function Text({ props }: A2UIComponentProps) {
  const variant = TEXT_VARIANT[str(props.variant, "body")] ?? TEXT_VARIANT.body;
  return <p className={variant}>{str(props.text)}</p>;
}

export function A2UIImage({ props }: A2UIComponentProps) {
  const src = str(props.src);
  if (!src) return null;
  // Plain <img>: A2UI images come from arbitrary hosts (thumbnails, logos), so
  // we avoid next/image's domain allowlist here. They live inside the overlay.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={str(props.alt)}
      className="w-full rounded-xl border border-white/10 object-cover"
    />
  );
}

export function Icon({ props }: A2UIComponentProps) {
  const emoji = str(props.emoji);
  return (
    <span className="text-lg" aria-hidden>
      {emoji || "•"}
    </span>
  );
}

export function Button({ props, dispatch }: A2UIComponentProps) {
  const label = str(props.label, "Button");
  const action = (props.action ?? {}) as A2UIAction;
  return (
    <button
      type="button"
      onClick={() => dispatch(action)}
      className="w-fit rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      {label}
    </button>
  );
}
