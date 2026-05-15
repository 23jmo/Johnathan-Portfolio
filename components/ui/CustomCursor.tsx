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

    const addHover = () => cursor.classList.add("hovering");
    const removeHover = () => cursor.classList.remove("hovering");

    document.addEventListener("mousemove", moveCursor);

    const attachHoverListeners = () => {
      const interactiveElements = document.querySelectorAll(
        "a, button, [role='button']"
      );
      interactiveElements.forEach((el) => {
        el.addEventListener("mouseenter", addHover);
        el.addEventListener("mouseleave", removeHover);
      });
    };

    attachHoverListeners();

    const observer = new MutationObserver(attachHoverListeners);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("mousemove", moveCursor);
      observer.disconnect();
    };
  }, []);

  return <div ref={cursorRef} className="custom-cursor" />;
}
