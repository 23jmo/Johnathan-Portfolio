"use client";

import { type ReactNode } from "react";
import ScrollChatProvider, { useScrollChat } from "./ScrollChatProvider";
import OverscrollController from "./OverscrollController";
import PageWarp from "./PageWarp";
import ScreenGlow from "./ScreenGlow";

/** Always-available, keyboard-reachable entry point (a11y: not gated behind a gesture). */
function AskButton() {
  const { phase, open } = useScrollChat();
  if (phase !== "idle") return null;

  return (
    <button
      type="button"
      data-warp-ignore
      onClick={() => open()}
      className="fixed bottom-5 right-5 z-[9990] flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur-md transition-all hover:border-transparent hover:shadow-[0_0_26px_-4px_rgba(99,130,255,0.65)]"
    >
      <span className="scrollchat-spark h-2 w-2 rounded-full" />
      Ask my AI
    </button>
  );
}

/**
 * Root of the scroll-to-AI-chat experience. Unlike a modal overlay, this WRAPS
 * the page content (`PageWarp`) so the live page can warp into a circle as the
 * visitor pulls past the bottom, revealing the stationary `ChatFooter` that
 * lives behind it. `ScreenGlow` frames the viewport in AI mode. Mounted once in
 * app/layout.tsx around {children}.
 */
export default function ScrollChatStage({ children }: { children: ReactNode }) {
  return (
    <ScrollChatProvider>
      {/* PageWarp wraps the page AND renders ChatFooter (the stationary chat
          backdrop that lives behind the page) inside its wrapper. */}
      <PageWarp>{children}</PageWarp>
      <ScreenGlow />
      <OverscrollController />
      <AskButton />
    </ScrollChatProvider>
  );
}
