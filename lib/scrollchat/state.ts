import type { PageContext } from "@/types";

/** Phases of the scroll-to-chat experience. */
export type ScrollChatPhase = "idle" | "warping" | "chat" | "reversing";

/** Wheel/touch budget (in px) required to fully arm the gesture. */
export const GESTURE_THRESHOLD = 700;

/** Fraction of the threshold at which releasing commits into the chat. */
export const COMMIT_RATIO = 0.55;

/** Cooldown after closing before the overscroll gesture can re-arm, in ms. */
export const REARM_COOLDOWN = 600;

/**
 * Spring used everywhere progress animates on its own (release snap-back,
 * commit, reverse). Snappy with a touch of overshoot — the "slight bounce".
 * The warp transforms clamp progress to [0,1] (useTransform clamps by default),
 * so the overshoot never over-warps.
 */
export const PROGRESS_SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 26,
  restDelta: 0.001,
};

/**
 * Derive a human-friendly page context (title + path) from a pathname. Used to
 * label the chip that "flies into" the chat representing the page you came from.
 */
export function pageContextFromPath(path: string): PageContext {
  if (path === "/" || path === "") return { title: "Home", path: "/" };

  const segments = path.split("/").filter(Boolean);
  const [section, slug] = segments;

  const sectionLabel =
    section === "notes" ? "Notes" : section === "blog" ? "Blog" : section;

  if (slug) {
    const pretty = slug
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { title: `${capitalize(sectionLabel)} — ${pretty}`, path };
  }

  return { title: capitalize(sectionLabel), path };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
