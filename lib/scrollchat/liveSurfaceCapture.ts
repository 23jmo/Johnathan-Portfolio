import {
  captureHost,
  collectStyleSheetCss,
  collectUsedFontFamilies,
  copyBodyBackground,
  embedFonts,
  inlineImages,
  mountForCapture,
  settleScrollRevealAnimations,
  type SurfaceCapture,
} from "./domRasterizer";

/**
 * Capture the page that is ON SCREEN RIGHT NOW into a canvas the orb can
 * refract.
 *
 * This is the transient-hybrid path, and it is deliberately NOT
 * `rasterizeHomeSurfaces`. That one boots a second copy of the site in a hidden
 * iframe and waits for it to hydrate — correct for the spike, which needs the
 * whole document at a synthetic 4000px viewport, but it costs ~1.7s and
 * produces a render that is not the one the visitor is looking at (its own
 * Spotify fetch, its own scroll position, its own reveal animations).
 *
 * Here the page stays real DOM and only the ORB is WebGL, so the texture just
 * has to match the current viewport. Serializing the live `<main>` skips the
 * iframe and the hydration wait entirely — the page is already hydrated, that
 * is the whole point.
 */
export interface LiveCapture {
  /** The page as it appears on screen right now. */
  page: SurfaceCapture;
  /**
   * The chat panel, at full opacity.
   *
   * Needed because the transition's crossfade is PER-PIXEL, not a whole-element
   * opacity: the orb holds the page inside its disc while the chat fills in
   * around it. A shader can only mix two images if it has both, so the chat has
   * to be photographed even though it is invisible at the moment of capture.
   *
   * `null` when `ChatFooter` has not mounted (a first visit shows `NameGate`
   * instead), which is the caller's cue to fall back to the SVG path.
   */
  chat: SurfaceCapture | null;
  /** Document-space y of the top of the capture, in CSS px. */
  scrollTop: number;
  capturedAt: number;
  captureMs: number;
  embeddedImages: number;
  droppedImages: number;
}

/** A capture older than this is assumed to have drifted from the live page. */
export const CAPTURE_STALE_AFTER_MS = 30_000;

/**
 * How far the page may scroll away from a capture before it stops matching.
 *
 * The orb refracts the viewport as it was photographed, so a capture taken a
 * few pixels off is imperceptible under the distortion while one taken a
 * screen away is simply the wrong content. Anything past this triggers a
 * re-capture rather than a rescue, because the capture is a flat image and
 * there is nothing outside its band to slide into view.
 */
export const CAPTURE_SCROLL_TOLERANCE_PX = 24;

/**
 * The font CSS, embedded once per page load.
 *
 * This is the expensive half of a capture — several hundred kilobytes of woff2
 * fetched and base64'd — and unlike the markup it is identical every time,
 * because a session does not swap out its typefaces. Memoizing it is what makes
 * the second capture (the one taken on approach to the bottom of the page, when
 * the visitor is close to actually needing it) cheap enough to take at all.
 */
let embeddedFontCss: Promise<string> | null = null;

function fontCssFor(host: HTMLElement): Promise<string> {
  if (!embeddedFontCss) {
    embeddedFontCss = embedFonts(
      collectStyleSheetCss(),
      collectUsedFontFamilies([host])
    ).then((result) => result.css);
    embeddedFontCss.catch(() => {
      // Let the next capture try again rather than caching the failure: unlike
      // a single missing resource, losing the whole sheet ruins the capture.
      embeddedFontCss = null;
    });
  }
  return embeddedFontCss;
}

export async function captureLiveViewport(
  pixelRatio: number,
  /**
   * Which band of the document to photograph, in CSS px from the top.
   *
   * Defaults to wherever the page actually is. Passing an explicit offset is
   * what lets the texture be warmed for the BOTTOM of the page — the only
   * place the gesture exists — while the visitor is still at the top, so the
   * capture is already correct when they arrive instead of being taken during
   * the scroll that arrives there.
   */
  targetScrollTop?: number
): Promise<LiveCapture> {
  const startedAt = performance.now();
  const main = document.querySelector("main");
  if (!main) throw new Error("No <main> to capture.");

  const cssWidth = document.documentElement.clientWidth;
  const cssHeight = window.innerHeight;
  const scrollTop = targetScrollTop ?? window.scrollY;

  // The clone is mounted unscrolled, so shifting it up by the current scroll
  // offset is what makes the captured band line up with what is on screen.
  const host = mountForCapture(
    main,
    cssWidth,
    null,
    `overflow:hidden;${copyBodyBackground()}`
  );
  // Settle the reveal animations BEFORE the band offset is applied, not after:
  // this walks every inline style and zeroes any transform it finds, which
  // would take the `translateY` below with it.
  //
  // Without this the capture photographs whatever `FadeInOnScroll` happens to
  // be showing, and every section is `initial={{ opacity: 0, y: 20 }}` until it
  // scrolls into view. That makes a band the visitor has not reached yet come
  // back BLANK, and a band they are arriving at come back mid-fade. Forcing the
  // settled state is what makes a band capturable ahead of time at all.
  settleScrollRevealAnimations(host);
  const inner = host.firstElementChild as HTMLElement | null;
  if (inner) inner.style.transform = `translateY(${-scrollTop}px)`;

  // The chat is `position: fixed; inset: 0`, so unlike the page it needs no
  // scroll offset — it is already viewport-sized wherever the document is.
  const chatSource = document.querySelector(".scrollchat-panel");
  const chatHost = chatSource
    ? mountForCapture(
        chatSource,
        cssWidth,
        cssHeight,
        // The panel is transparent at rest and only reads as opaque because the
        // page behind it is gone. Captured on its own it would come out as a
        // transparent sheet, so its own paper is painted in explicitly.
        `overflow:hidden;${copyBodyBackground()}`
      )
    : null;
  if (chatHost) {
    // The clone inherits the live panel's at-rest hiding via its own inline
    // styles, and there are TWO of them: `opacity: 0` from the crossfade
    // wrapper, and `visibility: hidden`, which `ChatFooter` applies separately
    // to retire the panel from hit-testing and the accessibility tree between
    // gestures. Resetting only the opacity leaves the clone laid out but not
    // painted, so the capture comes back as bare background and the orb
    // refracts an empty chat for the whole transition. Both must be undone.
    // Same reason as the page clone: the greeting carries an arrival transform
    // and the panel is mid-animation at rest.
    settleScrollRevealAnimations(chatHost);
    const chatInner = chatHost.firstElementChild as HTMLElement | null;
    if (chatInner) {
      chatInner.style.visibility = "visible";
      chatInner.style.opacity = "1";
      chatInner.style.position = "absolute";
      chatInner.style.inset = "0";
    }
  }

  try {
    const imageCounts = await inlineImages(host);
    // Fonts must be resolved before serializing, or the SVG lays out in the
    // fallback face and every line break lands somewhere else.
    await document.fonts.ready;
    const css = await fontCssFor(host);

    const { capture } = await captureHost(
      host,
      cssWidth,
      cssHeight,
      pixelRatio,
      css,
      `overflow:hidden;${copyBodyBackground()}`
    );

    let chat: SurfaceCapture | null = null;
    if (chatHost) {
      await inlineImages(chatHost);
      chat = (
        await captureHost(
          chatHost,
          cssWidth,
          cssHeight,
          pixelRatio,
          css,
          `overflow:hidden;${copyBodyBackground()}`
        )
      ).capture;
    }

    return {
      page: capture,
      chat,
      scrollTop,
      capturedAt: performance.now(),
      captureMs: performance.now() - startedAt,
      embeddedImages: imageCounts.embedded,
      droppedImages: imageCounts.dropped,
    };
  } finally {
    host.remove();
    chatHost?.remove();
  }
}
