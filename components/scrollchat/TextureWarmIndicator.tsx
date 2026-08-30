"use client";

import { useEffect, useState } from "react";
import { usePageTexture } from "./PageTextureProvider";

/**
 * A small, quiet indicator that the orb's glass is still being prepared.
 *
 * Deliberately NOT a blocking splash. The page is real DOM and fully usable the
 * whole time this is on screen — the only thing not ready is the refraction
 * texture, and the gesture that needs it lives at the very bottom of the page.
 * Covering a portfolio with a loader to protect a scroll affordance nobody has
 * reached yet would be a worse trade than the one it is trying to avoid.
 *
 * It also only appears if warming actually takes long enough to be worth
 * mentioning, so a fast machine never sees it at all.
 */
const APPEAR_AFTER_MS = 450;

export function TextureWarmIndicator() {
  const { status } = usePageTexture();
  const [delayElapsed, setDelayElapsed] = useState(false);

  // Only ever set from inside the timer. Setting it synchronously here to
  // handle "no longer warming" would be a setState during the effect body,
  // which cascades renders; gating the render on `status` instead costs
  // nothing and keeps the effect one-way.
  useEffect(() => {
    if (status !== "warming") return;
    const timer = window.setTimeout(() => setDelayElapsed(true), APPEAR_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setDelayElapsed(false);
    };
  }, [status]);

  if (status !== "warming" || !delayElapsed) return null;

  return (
    <div
      // Announced politely rather than assertively: it is progress on a
      // decorative enhancement, not something the visitor must act on.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[9990] -translate-x-1/2
                 rounded-full border border-black/5 bg-background/80 px-3 py-1.5
                 text-xs text-muted shadow-sm backdrop-blur-sm
                 motion-safe:animate-pulse dark:border-white/10"
    >
      preparing the glass…
    </div>
  );
}
