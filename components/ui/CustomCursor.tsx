"use client";

import { useEffect, useRef } from "react";

export default function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    // Hide on touch devices
    if (window.matchMedia("(pointer: coarse)").matches) {
      cursor.style.display = "none";
      return;
    }

    const moveCursor = (e: MouseEvent) => {
      cursor.style.left = `${e.clientX - 6}px`;
      cursor.style.top = `${e.clientY - 6}px`;
    };

    // Hover is DELEGATED to the document rather than bound per element.
    // Binding per element needed a MutationObserver to catch new nodes, and
    // that observer re-ran a document-wide querySelectorAll on every unrelated
    // mutation and re-added mouseenter/mouseleave WITHOUT removing the previous
    // pair — so listeners accumulated for the life of the page, fastest exactly
    // when the DOM churns most (e.g. the scroll-chat swapping its entry button
    // out as the phase flips). Delegation is three listeners, total, forever:
    // elements added later are covered because nothing is bound to them.
    //
    // mouseover/mouseout (not mouseenter/mouseleave) because only these bubble.
    const INTERACTIVE_SELECTOR = "a, button, [role='button']";

    const isInsideInteractive = (node: EventTarget | null) =>
      node instanceof Element && !!node.closest(INTERACTIVE_SELECTOR);

    const onPointerOver = (e: MouseEvent) => {
      if (isInsideInteractive(e.target)) cursor.classList.add("hovering");
    };

    const onPointerOut = (e: MouseEvent) => {
      // Moving between two children of the SAME link/button still fires
      // mouseout; only drop the state when the pointer has actually left every
      // interactive ancestor.
      if (!isInsideInteractive(e.target)) return;
      if (isInsideInteractive(e.relatedTarget)) return;
      cursor.classList.remove("hovering");
    };

    document.addEventListener("mousemove", moveCursor);
    document.addEventListener("mouseover", onPointerOver);
    document.addEventListener("mouseout", onPointerOut);

    return () => {
      document.removeEventListener("mousemove", moveCursor);
      document.removeEventListener("mouseover", onPointerOver);
      document.removeEventListener("mouseout", onPointerOut);
    };
  }, []);

  return <div ref={cursorRef} data-warp-ignore className="custom-cursor" />;
}
