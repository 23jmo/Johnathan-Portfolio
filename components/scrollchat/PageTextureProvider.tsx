"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CAPTURE_SCROLL_TOLERANCE_PX,
  CAPTURE_STALE_AFTER_MS,
  captureLiveViewport,
  type LiveCapture,
} from "@/lib/scrollchat/liveSurfaceCapture";

/**
 * Supplies the orb with a photograph of the page behind it.
 *
 * WebGL cannot read the pixels behind its own canvas, so the only way the orb
 * can genuinely REFRACT (and magnify) page content is to be handed that content
 * as a texture. The spike at `/webgl-page` answered that by rendering the whole
 * site in WebGL, which works and costs text selection, screen readers, focus
 * order, find-in-page and crawlability — a bad trade for a portfolio.
 *
 * The hybrid keeps the page as real DOM and makes only the ORB a WebGL overlay,
 * refracting a snapshot. The snapshot is stale by design: the transition lasts
 * about a second, and everything behind the glass is under heavy distortion, so
 * a Spotify track that changed 20 seconds ago is not observable. What the
 * snapshot must NOT be is slow, which is why it is warmed before the gesture
 * rather than taken when the gesture starts.
 *
 * WHERE it is warmed matters as much as when. A capture is one viewport band,
 * and the gesture that consumes it only exists at the BOTTOM of the page, so a
 * capture taken at mount photographs the hero section and would have the orb
 * refracting content the visitor scrolled past minutes ago. Warming therefore
 * follows the visitor down: it primes once at idle (which is what pays for the
 * fonts and images, the expensive and scroll-independent half) and re-takes the
 * cheap half whenever the page comes near the bottom at a new offset.
 */
export type TextureStatus =
  | "cold"
  | "warming"
  | "ready"
  | "stale"
  | "unavailable";

interface PageTextureValue {
  status: TextureStatus;
  /** Only non-null when `status === "ready"`, i.e. it matches what is on screen. */
  capture: LiveCapture | null;
  /** Capture now if the current one is missing, old, or at the wrong offset. */
  warm: () => void;
  /** Drop the current capture, e.g. after a resize or a theme change. */
  invalidate: () => void;
}

const PageTextureContext = createContext<PageTextureValue>({
  status: "cold",
  capture: null,
  warm: () => {},
  invalidate: () => {},
});

export function usePageTexture() {
  return useContext(PageTextureContext);
}

/**
 * How close to the bottom of the document counts as "about to need this".
 *
 * The gesture engages only once the page is scrolled all the way down, so one
 * viewport of runway is enough warning to take a capture and still land it
 * before the first wheel tick past the end.
 */
const WARM_WITHIN_VIEWPORTS = 1;

/** Debounce for scroll and resize: both fire continuously, captures are costly. */
const SETTLE_DEBOUNCE_MS = 250;

function scheduleIdle(task: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const idle = window.requestIdleCallback;
  if (idle) {
    // The timeout matters: without it a permanently busy main thread never
    // fires the callback and the texture stays cold forever.
    const handle = idle(() => task(), { timeout: 2000 });
    return () => window.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(task, 200);
  return () => window.clearTimeout(handle);
}

/** True once the document is within a viewport of its end. */
function nearBottom(): boolean {
  const doc = document.documentElement;
  const remaining = doc.scrollHeight - window.scrollY - window.innerHeight;
  return remaining <= window.innerHeight * WARM_WITHIN_VIEWPORTS;
}

/**
 * The scroll offset the gesture will actually be launched from.
 *
 * The orb only exists at the very bottom of the document, so this — not
 * wherever the visitor currently is — is the band worth photographing. Capturing
 * it up front is what removes the mid-scroll rasterization the visitor could
 * otherwise feel as a hitch on the way down.
 */
function bottomBandOffset(): number {
  return Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight
  );
}

export function PageTextureProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TextureStatus>("cold");
  const [capture, setCapture] = useState<LiveCapture | null>(null);

  // Captures are not cancellable once started, so overlapping runs are barred
  // rather than raced — the loser would only have thrown its work away.
  const inFlight = useRef(false);
  // Read inside `warm` without making `warm` change identity per capture, which
  // would re-subscribe the scroll listener on every successful warm. Mirrored
  // in an effect rather than assigned during render, which React treats as a
  // side effect in the render phase; the one-commit lag is immaterial because
  // every reader is a debounced handler, and `inFlight` already bars the only
  // overlap a stale read could cause.
  const captureRef = useRef<LiveCapture | null>(null);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  /**
   * The last capture failure, kept for the dev diagnostic below.
   *
   * A failed capture is silent by design — the orb falls back and the visitor
   * sees a working transition either way — which is exactly what makes it
   * invisible while developing. Reasoning about "why did it take the SVG path"
   * from the outside is not possible without this.
   */
  const failureRef = useRef<string | null>(null);

  const warm = useCallback((targetScrollTop?: number) => {
    if (inFlight.current) return;
    // Which band this call wants. Defaults to the one under the visitor, but
    // the load-time prime asks for the bottom instead — see `bottomBandOffset`.
    const target = targetScrollTop ?? window.scrollY;
    const current = captureRef.current;
    if (
      current &&
      performance.now() - current.capturedAt < CAPTURE_STALE_AFTER_MS &&
      Math.abs(current.scrollTop - target) <= CAPTURE_SCROLL_TOLERANCE_PX
    ) {
      return;
    }
    inFlight.current = true;
    setStatus("warming");
    captureLiveViewport(Math.min(window.devicePixelRatio || 1, 2), target)
      .then((next) => {
        setCapture(next);
        // A capture taken for a band the visitor has not reached yet is good,
        // but it is not what is on screen — so it is `stale` until they get
        // there. `onScroll` promotes it to `ready` on arrival.
        setStatus(
          Math.abs(next.scrollTop - window.scrollY) <=
            CAPTURE_SCROLL_TOLERANCE_PX
            ? "ready"
            : "stale"
        );
      })
      .catch((error: unknown) => {
        // A failed capture is not fatal: the orb falls back to the SVG
        // refraction path, which needs no texture at all.
        failureRef.current =
          error instanceof Error ? error.message : String(error);
        setCapture(null);
        setStatus("unavailable");
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  const invalidate = useCallback(() => {
    setCapture(null);
    setStatus((current) =>
      current === "warming" || current === "unavailable" ? current : "cold"
    );
  }, []);

  // Prime once the page has settled. Doing this on mount would compete with
  // hydration and first paint for the main thread.
  //
  // It photographs the BOTTOM band, not the band under the visitor. The clone
  // is offset by whatever scroll position we ask for, so any band is reachable
  // from anywhere, and the bottom is the only one the gesture ever consumes.
  // Doing it here means the ~140ms rasterization is spent while the page is
  // idle instead of during the scroll down, which is the hitch that was
  // actually noticeable. `settleScrollRevealAnimations` is what makes an
  // unvisited band capturable — without it every `FadeInOnScroll` section down
  // there is still at `opacity: 0` and the capture comes back blank.
  useEffect(() => {
    return scheduleIdle(() => warm(bottomBandOffset()));
  }, [warm]);

  // Follow the visitor toward the gesture. Marking the existing capture stale
  // as soon as the offset drifts (rather than only once the new one lands) is
  // what keeps the orb from refracting a band that is no longer on screen.
  useEffect(() => {
    let timer = 0;
    const onSettle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (nearBottom()) warm();
      }, SETTLE_DEBOUNCE_MS);
    };
    const onScroll = () => {
      const current = captureRef.current;
      if (current) {
        // Two-way now, not one-way. The load-time prime photographs the BOTTOM
        // band while the visitor is still at the top, so the capture starts out
        // not-matching and has to be promoted when they arrive — a one-way
        // ready→stale edge would leave a perfectly good capture marked stale
        // forever and hand every gesture to the SVG path.
        const matchesViewport =
          Math.abs(current.scrollTop - window.scrollY) <=
          CAPTURE_SCROLL_TOLERANCE_PX;
        setStatus((existing) =>
          existing === "warming" || existing === "unavailable"
            ? existing
            : matchesViewport
              ? "ready"
              : "stale"
        );
      }
      onSettle();
    };
    // A resize changes the capture's SHAPE, not just its offset, so the old one
    // is unusable immediately rather than merely out of date.
    const onResize = () => {
      invalidate();
      onSettle();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [invalidate, warm]);

  // Publish the state onto <html> so it can be read from the console, a
  // screenshot diff, or a browser-driven test without a React devtools bridge.
  // Development only: this exists to make a deliberately silent fallback
  // debuggable, and it is not something a visitor should be able to read.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const root = document.documentElement;
    root.dataset.pageTexture = status;
    if (status === "ready" && capture) {
      // The capture itself, so a QA run can read its pixels or dump it to a
      // file. There is no other way to see what the orb is actually refracting:
      // the canvas never enters the document.
      (window as unknown as Record<string, unknown>).__pageTextureCanvas =
        capture.page.canvas;
      (window as unknown as Record<string, unknown>).__chatTextureCanvas =
        capture.chat?.canvas ?? null;
      root.dataset.pageTextureInfo =
        `${Math.round(capture.captureMs)}ms · ` +
        `${capture.page.cssWidth}x${capture.page.cssHeight} @${capture.scrollTop} · ` +
        `chat ${capture.chat ? "yes" : "MISSING"} · ` +
        `${capture.embeddedImages} embedded, ${capture.droppedImages} dropped`;
    } else if (status === "unavailable") {
      root.dataset.pageTextureInfo = failureRef.current ?? "unknown failure";
    }
  }, [status, capture]);

  return (
    <PageTextureContext.Provider
      value={{
        status,
        // Handing back a capture that no longer matches the viewport would be
        // worse than handing back none: the orb has an SVG path that is always
        // correct, and this one is only better while it is accurate.
        capture: status === "ready" ? capture : null,
        warm,
        invalidate,
      }}
    >
      {children}
    </PageTextureContext.Provider>
  );
}
