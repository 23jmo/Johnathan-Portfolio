"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/types";

interface TableOfContentsProps {
  items: TocItem[];
}

/**
 * Sticky side rail listing depth 2–3 headings, with IntersectionObserver
 * scroll-spy that highlights the section currently being read. Renders nothing
 * when a note has no headings, so short notes don't show an empty rail.
 */
export default function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;

    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        // Track every heading's intersection state, then pick the topmost one
        // currently within the detection band so the highlight never blanks out.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-3 font-semibold uppercase tracking-wide text-muted text-xs">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-border">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li
              key={item.id}
              style={{ paddingLeft: item.depth === 3 ? "1.5rem" : "0.75rem" }}
            >
              <a
                href={`#${item.id}`}
                className={`-ml-px block border-l-2 py-0.5 pl-3 transition-colors ${
                  isActive
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
