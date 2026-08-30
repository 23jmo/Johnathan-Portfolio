/**
 * SPIKE — rasterizes the REAL page surfaces into canvases, pixel for pixel.
 *
 * The first version of this spike hand-painted the content with `fillText`.
 * That could match the page approximately but never exactly, because matching
 * it exactly means reimplementing layout and text shaping.
 *
 * So this does the opposite: it lets the browser's own layout engine do the
 * work, then photographs the result. An SVG `<foreignObject>` holding real
 * XHTML, loaded through an `<img>`, is effectively a polyfill for the
 * `drawElementImage` API that `LiquidGlassCanvas` probes for and never finds.
 * Verified on this machine: the resulting canvas is NOT tainted, so
 * `texImage2D` accepts it.
 *
 * TWO surfaces are captured, because the orb transition crossfades between
 * them: the page (`<main>`, scrolls) and the chat (`[data-orb-chat]`, fixed to
 * the viewport). `OrbWarp` composites them as an opaque page layer at
 * `opacity: 1 - swap` over an opaque chat layer, which is just
 * `mix(page, chat, swap)` — the form the shader uses.
 *
 * `html-to-image` is the obvious library for this and it does not work here. It
 * inlines the computed style of every node, which on this page produces a
 * multi-megabyte SVG that Chrome refuses to decode (it rejects with a bare
 * error `Event`, which is why this is hand-rolled and instrumented instead).
 * Three concrete things had to be handled that a generic tool cannot:
 *
 *   - the page's OWN stylesheet is reused rather than flattened per node, which
 *     is both far smaller and strictly more faithful
 *   - `@font-face` URLs are relative to the stylesheet that declared them, so
 *     they resolve to nothing inside a `data:` URL and must be rewritten
 *   - five project links use cross-origin favicon services; CORS makes them
 *     unembeddable, so they are dropped rather than allowed to fail the capture
 *
 * What is still lost is everything structural rather than visual: no selection,
 * no links, no find-in-page, nothing for a screen reader or a crawler, and any
 * animation is frozen at the instant of capture.
 */

export interface SurfaceCapture {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
}

export interface RasterizedSurfaces {
  /** The scrolling document. */
  page: SurfaceCapture;
  /** The chat panel, sized to the viewport because it is fixed to it. */
  chat: SurfaceCapture;
  /**
   * Where the orb's landing slot sits WITHIN the chat surface, in CSS pixels.
   *
   * `OrbWarp` measures `[data-chat-chip]` from the live DOM rather than assuming
   * a position, because the chip rides in the composer and moves with it. The
   * chip is part of the surface being photographed here, so measuring it in the
   * same pass keeps that property: the orb lands on the chip that is actually
   * drawn, not on where a constant says the chip should be.
   *
   * `null` when the chat never mounted, which is the caller's cue to fall back.
   */
  chatChip: { centerX: number; centerY: number; radius: number } | null;
  rasterizeMs: number;
  /** Diagnostics, surfaced in the HUD because each can silently degrade fidelity. */
  svgBytes: number;
  embeddedFonts: number;
  embeddedImages: number;
  droppedImages: number;
}

/**
 * The offscreen host has to be laid out to be measured, so it cannot use
 * `display: none`. Parking it far off to the left keeps it out of view while
 * leaving it a real box with real geometry.
 */
const OFFSCREEN_LEFT = -100000;

/** A resource that will not fetch quickly is not worth stalling the capture for. */
const RESOURCE_FETCH_TIMEOUT_MS = 4000;

/** Tall enough that every `whileInView` reveal fires before the capture. */
const HYDRATION_VIEWPORT_HEIGHT = 4000;

/** Hydration is not observable, so geometry-settling gets a hard ceiling. */
const HYDRATION_TIMEOUT_MS = 5000;

/**
 * framer-motion renders its `initial` state into the server HTML, so every
 * `FadeInOnScroll` section arrives as `opacity: 0; transform: translateY(20px)`.
 * Nothing will ever scroll these into view, so a naive capture photographs an
 * invisible page. Clearing those two properties reproduces the settled state —
 * which is what the page actually looks like to a reader.
 */
export function settleScrollRevealAnimations(root: HTMLElement) {
  for (const element of root.querySelectorAll<HTMLElement>("[style]")) {
    const { opacity, transform } = element.style;
    if (opacity !== "" && Number(opacity) < 1) element.style.opacity = "1";
    if (transform && transform !== "none") element.style.transform = "none";
  }
}

/**
 * Data URLs are memoized because a capture is now taken more than once per
 * page load. The bytes behind a font file or a project screenshot do not change
 * within a session, but re-deriving the data URL is not free even when the HTTP
 * cache serves the fetch instantly: the blob still has to be read and base64'd,
 * and fonts in particular are hundreds of kilobytes each. Failures are cached
 * too, so a cross-origin favicon that will never be readable is not re-fetched
 * on every warm.
 */
const dataUrlCache = new Map<string, Promise<string>>();

function fetchAsDataUrl(url: string): Promise<string> {
  const cached = dataUrlCache.get(url);
  if (cached) return cached;
  const pending = fetchAsDataUrlUncached(url);
  dataUrlCache.set(url, pending);
  // A rejected promise left in the map would be re-awaited (and re-rejected)
  // rather than re-fetched, which is the behaviour we want; swallow the
  // unhandled rejection the extra reference would otherwise produce.
  pending.catch(() => {});
  return pending;
}

async function fetchAsDataUrlUncached(url: string): Promise<string> {
  const response = await fetch(url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(RESOURCE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${url}`));
    reader.readAsDataURL(blob);
  });
}

/**
 * Load every image, then replace its source with a data URL.
 *
 * Two things make this necessary. Lazy images never load off-screen and the
 * host is parked 100,000px to the left, so they would all rasterize blank. And
 * an SVG loaded through an `<img>` may not fetch external resources at all, so
 * anything still pointing at a URL when the capture happens is simply missing.
 */
export async function inlineImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  for (const image of images) image.loading = "eager";

  // Let the browser pick a source (and honour srcset) before it is frozen.
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          })
    )
  );

  let embedded = 0;
  let dropped = 0;
  await Promise.all(
    images.map(async (image) => {
      const source = image.currentSrc || image.src;
      // `srcset` would override the data URL we are about to install.
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      if (!source || source.startsWith("data:")) {
        if (source) embedded++;
        return;
      }
      try {
        image.src = await fetchAsDataUrl(source);
        embedded++;
      } catch {
        // Cross-origin favicon services land here. Removing the element beats
        // leaving a broken reference that renders as a blank box.
        image.remove();
        dropped++;
      }
    })
  );
  return { embedded, dropped };
}

/** Concatenate every readable stylesheet, resolving relative URLs as we go. */
export function collectStyleSheetCss(): string {
  const blocks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[];
    try {
      rules = Array.from(sheet.cssRules);
    } catch {
      // A cross-origin stylesheet cannot be read. None of the page's own CSS is
      // served that way, so this is only ever third-party noise.
      continue;
    }
    const base = sheet.href ?? document.baseURI;
    blocks.push(rules.map((rule) => resolveRelativeUrls(rule.cssText, base)).join("\n"));
  }
  return blocks.join("\n");
}

/**
 * Rewrite `url(...)` to absolute.
 *
 * This is the bug that makes a naive capture silently fall back to a system
 * font: next/font emits `src: url(../media/xxx.woff2)`, relative to the
 * stylesheet. Inside a `data:` URL there is no stylesheet to be relative to.
 */
function resolveRelativeUrls(cssText: string, base: string): string {
  return cssText.replace(
    /url\((['"]?)([^)'"]+)\1\)/g,
    (match, _quote: string, url: string) => {
      if (/^(data:|https?:|\/\/)/.test(url)) return match;
      try {
        return `url("${new URL(url, base).href}")`;
      } catch {
        return match;
      }
    }
  );
}

/** Every font family actually used by the captured subtrees. */
export function collectUsedFontFamilies(roots: HTMLElement[]): Set<string> {
  const families = new Set<string>();
  for (const root of roots) {
    for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
      for (const family of getComputedStyle(element).fontFamily.split(",")) {
        families.add(family.trim().replace(/^["']|["']$/g, "").toLowerCase());
      }
    }
  }
  return families;
}

/**
 * Base64 the web fonts the page actually uses into the stylesheet.
 *
 * Restricting this to families in use matters: the dev server also serves the
 * Next.js overlay's Geist faces, and embedding all thirteen `@font-face` blocks
 * would add hundreds of kilobytes to an SVG that is already at the edge of what
 * Chrome will decode.
 */
export async function embedFonts(
  css: string,
  usedFamilies: Set<string>
): Promise<{ css: string; embedded: number }> {
  const wanted = new Map<string, string>();
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const family = block
      .match(/font-family:\s*([^;]+)/i)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase();
    if (!family || !usedFamilies.has(family)) continue;
    for (const [, , url] of block.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) {
      if (!url.startsWith("data:")) wanted.set(url, url);
    }
  }

  let embedded = 0;
  await Promise.all(
    Array.from(wanted.keys()).map(async (url) => {
      try {
        wanted.set(url, await fetchAsDataUrl(url));
        embedded++;
      } catch {
        wanted.delete(url);
      }
    })
  );

  let result = css;
  for (const [url, dataUrl] of wanted) {
    result = result.split(`url("${url}")`).join(`url("${dataUrl}")`);
  }
  return { css: result, embedded };
}

/**
 * Reproduce `<body>`'s painted background on a captured wrapper.
 *
 * `globals.css` puts a 20px radial-gradient dot grid on `body`, not on `main`.
 * Capturing only `<main>` therefore drops it, and the difference is obvious the
 * moment the capture is put next to the real page — a flat field instead of the
 * dotted one. Copying the computed longhands also picks up whichever of the
 * light/dark variants is currently active.
 */
export function copyBodyBackground(): string {
  const bodyStyle = getComputedStyle(document.body);
  return [
    "background-color",
    "background-image",
    "background-size",
    "background-position",
    "background-repeat",
  ]
    .map((property) => `${property}:${bodyStyle.getPropertyValue(property)}`)
    .join(";");
}

/**
 * Copy the resolved theme variables onto a captured wrapper.
 *
 * `globals.css` declares them on `:root`, and inside the SVG document `:root`
 * is the `<svg>` element, not the page. Stamping the computed values inline
 * removes any doubt about which theme the capture comes out in.
 */
export function inlineThemeVariables(): string {
  const rootStyle = getComputedStyle(document.documentElement);
  const declarations: string[] = [];
  for (const property of Array.from(rootStyle)) {
    if (!property.startsWith("--")) continue;
    const value = rootStyle.getPropertyValue(property).trim();
    if (value) declarations.push(`${property}:${value}`);
  }
  return declarations.join(";");
}

/**
 * UTF-8 safe base64. `btoa` alone throws on any character above U+00FF, and the
 * captured page carries plenty of them — em dashes and the middot separators in
 * the project rows are enough to break it.
 */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // Chunked because spreading a multi-hundred-kilobyte array into
  // `String.fromCharCode` blows the argument limit.
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * Load the home page in an offscreen iframe and wait for React to hydrate it.
 *
 * Fetching the HTML and parsing it is simpler but NOT faithful: measured at the
 * same width, the un-hydrated server markup is 1129px tall with 10 sections
 * while the live page is 1330px with 11. Client components decide real layout
 * here, so the only way to match the page is to actually run it.
 *
 * The iframe is made tall on purpose. `FadeInOnScroll` reveals on
 * `whileInView`, so a short viewport leaves everything below the fold at
 * `opacity: 0`; giving it a tall one lets the real animations settle normally.
 */
async function loadHydratedHomePage(
  cssWidth: number
): Promise<{ main: HTMLElement; chat: HTMLElement | null; dispose: () => void }> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = [
    "position:fixed",
    "top:0",
    `left:${OFFSCREEN_LEFT}px`,
    `width:${cssWidth}px`,
    `height:${HYDRATION_VIEWPORT_HEIGHT}px`,
    "border:0",
    "visibility:hidden",
  ].join(";");
  frame.src = "/";
  document.body.appendChild(frame);

  const dispose = () => frame.remove();
  try {
    await new Promise<void>((resolve, reject) => {
      frame.addEventListener("load", () => resolve(), { once: true });
      frame.addEventListener(
        "error",
        () => reject(new Error("Home page failed to load.")),
        { once: true }
      );
    });

    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Could not reach the iframe document.");

    // Hydration is not an event, so settle on geometry: once the height stops
    // moving the client components have finished rendering.
    let previousHeight = -1;
    let stableTicks = 0;
    const deadline = performance.now() + HYDRATION_TIMEOUT_MS;
    let main = frameDocument.querySelector("main");
    while (performance.now() < deadline && stableTicks < 2) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      main = frameDocument.querySelector("main");
      const height = main?.getBoundingClientRect().height ?? 0;
      stableTicks = height > 0 && height === previousHeight ? stableTicks + 1 : 0;
      previousHeight = height;
    }
    if (!main) throw new Error("No <main> element on the home page.");

    return {
      main,
      chat: frameDocument.querySelector<HTMLElement>("[data-orb-chat]"),
      dispose,
    };
  } catch (loadError) {
    dispose();
    throw loadError;
  }
}

/**
 * Plant a node in THIS document, sized and styled the way the real page paints
 * it, and hand back the host so it can be measured and serialized.
 *
 * The node is imported here rather than captured inside the iframe because the
 * spike page already carries the identical Tailwind bundle and next/font face —
 * which keeps `getComputedStyle` and the stylesheet collection on a single
 * document and avoids cross-document style bugs.
 */
export function mountForCapture(
  sourceNode: Element,
  cssWidth: number,
  fixedHeight: number | null,
  extraCss: string
): HTMLElement {
  const host = document.createElement("div");
  host.className = document.body.className;
  host.style.cssText = [
    "position:fixed",
    "top:0",
    `left:${OFFSCREEN_LEFT}px`,
    `width:${cssWidth}px`,
    fixedHeight === null ? "" : `height:${fixedHeight}px`,
    extraCss,
    inlineThemeVariables(),
  ]
    .filter(Boolean)
    .join(";");
  host.appendChild(document.importNode(sourceNode, true));
  document.body.appendChild(host);
  for (const script of host.querySelectorAll("script")) script.remove();
  settleScrollRevealAnimations(host);
  return host;
}

/** Serialize one mounted host into an image and draw it onto a canvas. */
export async function captureHost(
  host: HTMLElement,
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
  css: string,
  extraCss: string
): Promise<{ capture: SurfaceCapture; svgBytes: number }> {
  // Serialize a CLONE with the offscreen parking removed. Capturing `host`
  // directly carries `position:fixed; left:-100000px` into the SVG, which
  // renders a perfectly valid, perfectly blank image — the content is there,
  // just painted 100,000px to the left of the viewBox.
  const captureNode = host.cloneNode(true) as HTMLElement;
  captureNode.style.cssText = [
    `width:${cssWidth}px`,
    `height:${cssHeight}px`,
    extraCss,
    inlineThemeVariables(),
  ].join(";");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cssWidth}" height="${cssHeight}">` +
    `<style><![CDATA[${css}]]></style>` +
    `<foreignObject x="0" y="0" width="${cssWidth}" height="${cssHeight}">` +
    new XMLSerializer().serializeToString(captureNode) +
    `</foreignObject></svg>`;

  // MUST be a `data:` URL. A `blob:` URL holding byte-identical SVG loads fine
  // and then TAINTS the canvas, so `texImage2D` rejects it with a SecurityError
  // — measured both ways on this machine, the scheme is the only difference.
  // Base64 rather than percent-encoding because the payload is hundreds of
  // kilobytes and `encodeURIComponent` inflates it far worse.
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Chrome refused to decode the captured SVG."));
    image.src = `data:image/svg+xml;base64,${toBase64(svg)}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssWidth * pixelRatio);
  canvas.height = Math.round(cssHeight * pixelRatio);
  const context = canvas.getContext("2d")!;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.drawImage(image, 0, 0, cssWidth, cssHeight);

  return {
    capture: { canvas, cssWidth, cssHeight },
    svgBytes: svg.length,
  };
}

/**
 * Run the home page and photograph both of the orb transition's surfaces.
 */
export async function rasterizeHomeSurfaces(
  cssWidth: number,
  viewportCssHeight: number,
  pixelRatio: number
): Promise<RasterizedSurfaces> {
  const startedAt = performance.now();
  const source = await loadHydratedHomePage(cssWidth);

  const pageBackgroundCss = copyBodyBackground();
  const pageHost = mountForCapture(source.main, cssWidth, null, pageBackgroundCss);

  // The chat panel only ever paints mid-gesture, so at rest it is doubly
  // invisible and both halves have to be undone by hand:
  //
  //   * `[data-orb-chat]` lives inside a stage box that only exists during the
  //     transition, so at rest it measures zero. Giving the host the viewport
  //     box is what the gesture would have done.
  //   * `ChatFooter` itself carries `visibility: hidden` until the chat opens,
  //     which is why forcing the wrapper alone still captured a fully
  //     transparent surface — the wrapper was visible and empty.
  //
  // `position: fixed` also has to go. A fixed element inside a `foreignObject`
  // has no viewport to resolve against and collapses out of the drawing, so it
  // becomes `absolute` against the host, which IS the viewport box here.
  const chatHost = source.chat
    ? mountForCapture(source.chat, cssWidth, viewportCssHeight, "")
    : null;
  const chatPanel = chatHost?.querySelector<HTMLElement>(".scrollchat-panel");
  if (chatHost) {
    const stageBox = chatHost.firstElementChild as HTMLElement | null;
    if (stageBox) stageBox.style.cssText = "position:absolute;inset:0;opacity:1";
    if (chatPanel) {
      chatPanel.style.setProperty("position", "absolute", "important");
      chatPanel.style.setProperty("inset", "0", "important");
      chatPanel.style.setProperty("visibility", "visible", "important");
      chatPanel.style.setProperty("opacity", "1", "important");
      chatPanel.style.setProperty("transform", "none", "important");
    }
  }
  source.dispose();

  try {
    const hosts = [pageHost, chatHost].filter(Boolean) as HTMLElement[];
    const imageCounts = { embedded: 0, dropped: 0 };
    for (const host of hosts) {
      const counts = await inlineImages(host);
      imageCounts.embedded += counts.embedded;
      imageCounts.dropped += counts.dropped;
    }
    // Measuring before the face is ready lays the text out in the fallback font
    // and bakes the wrong line breaks into the capture.
    await document.fonts.ready;

    const { css, embedded: embeddedFonts } = await embedFonts(
      collectStyleSheetCss(),
      collectUsedFontFamilies(hosts)
    );

    const pageHeight = Math.ceil(pageHost.getBoundingClientRect().height);
    const pageResult = await captureHost(
      pageHost,
      cssWidth,
      pageHeight,
      pixelRatio,
      css,
      pageBackgroundCss
    );

    // Measured after `document.fonts.ready`, because the composer's height (and
    // so the chip's y) depends on the text metrics of the placeholder.
    const chipElement = chatHost?.querySelector<HTMLElement>("[data-chat-chip]");
    let chatChip: RasterizedSurfaces["chatChip"] = null;
    if (chatHost && chipElement) {
      const hostBox = chatHost.getBoundingClientRect();
      const chipBox = chipElement.getBoundingClientRect();
      if (chipBox.width > 0) {
        chatChip = {
          centerX: chipBox.left - hostBox.left + chipBox.width / 2,
          centerY: chipBox.top - hostBox.top + chipBox.height / 2,
          radius: chipBox.width / 2,
        };
      }
    }

    // The chat paints its own opaque panel; capture it on that, not on the
    // page's paper, so the crossfade mixes the two surfaces the DOM would.
    const chatBackground = chatPanel
      ? `background:${getComputedStyle(chatPanel).backgroundColor}`
      : pageBackgroundCss;
    const chatResult = chatHost
      ? await captureHost(
          chatHost,
          cssWidth,
          viewportCssHeight,
          pixelRatio,
          css,
          chatBackground
        )
      : pageResult;

    return {
      page: pageResult.capture,
      chat: chatResult.capture,
      chatChip,
      rasterizeMs: Math.round(performance.now() - startedAt),
      svgBytes: pageResult.svgBytes + chatResult.svgBytes,
      embeddedFonts,
      embeddedImages: imageCounts.embedded,
      droppedImages: imageCounts.dropped,
    };
  } finally {
    pageHost.remove();
    chatHost?.remove();
  }
}
