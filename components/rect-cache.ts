/**
 * Cached `getBoundingClientRect` for an element.
 *
 * NOT part of what Canvas UI published — their `Glass.tsx` imports it from
 * `../rect-cache` but the module itself was not in the source we were given, so
 * this is a minimal stand-in written to the call sites (`.current`, `.destroy()`).
 *
 * The point of it is that `getBoundingClientRect` forces layout, and the lens
 * reads the rect on every `pointermove` — which on a busy page is enough to
 * cause visible jank. Caching it and invalidating on the three things that can
 * actually move the element (scroll anywhere in the tree, viewport resize, the
 * element's own box changing) keeps the pointer path free of layout reads.
 */
export interface RectCache {
  readonly current: DOMRect;
  destroy: () => void;
}

export function createRectCache(element: Element): RectCache {
  let rect = element.getBoundingClientRect();
  const update = () => {
    rect = element.getBoundingClientRect();
  };

  // Capture phase, because scrolling in any ancestor moves the element and a
  // bubbling listener never sees scroll events from nested scroll containers.
  window.addEventListener("scroll", update, { passive: true, capture: true });
  window.addEventListener("resize", update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(element);

  return {
    get current() {
      return rect;
    },
    destroy() {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
      observer.disconnect();
    },
  };
}
