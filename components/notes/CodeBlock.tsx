"use client";

import { useRef, useState, type ComponentPropsWithoutRef } from "react";

type CodeBlockProps = ComponentPropsWithoutRef<"pre"> & {
  "data-language"?: string;
};

/**
 * Client wrapper around a server-highlighted <pre>. Shiki has already colored
 * the spans on the server; this adds only the interactive chrome: a language
 * label and a copy button that reads the rendered code straight out of the DOM
 * (no need to re-serialize React children into a string).
 */
export default function CodeBlock({
  children,
  className,
  ...props
}: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const language = props["data-language"];

  const handleCopy = async () => {
    const code =
      preRef.current?.querySelector("code")?.textContent ??
      preRef.current?.textContent ??
      "";
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context / permissions) — fail quietly.
    }
  };

  return (
    <div className="group not-prose relative my-5">
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-2">
        {language && (
          <span className="rounded-md bg-foreground/5 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted">
            {language}
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="pointer-events-auto rounded-md border border-border bg-background/80 px-2 py-0.5 text-[11px] text-muted opacity-0 backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          aria-label="Copy code to clipboard"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre
        ref={preRef}
        className={`overflow-x-auto rounded-xl border border-border p-4 text-sm leading-relaxed ${className ?? ""}`}
        style={{ backgroundColor: "var(--code-bg)" }}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}
