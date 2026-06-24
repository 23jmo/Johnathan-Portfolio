import type { Components } from "react-markdown";
import Callout from "./Callout";
import CodeBlock from "./CodeBlock";
import NoteImage from "./NoteImage";

/**
 * Shared classes for headings: `scroll-mt-24` keeps anchored sections clear of
 * the reading-progress bar when you jump via the TOC; `group` powers the
 * hover-reveal anchor link injected by rehype-autolink-headings.
 */
const headingBase = "group scroll-mt-24 relative";

/**
 * Element → template map handed to react-markdown's `components` prop. Each entry
 * replaces a default HTML element with a styled, accessible version. Typography
 * (font sizes, weights, vertical rhythm) lives in `.prose-notes` in globals.css;
 * these components add structure, behavior, and the bits prose can't express.
 */
export const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 className={headingBase} {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className={headingBase} {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className={headingBase} {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className={headingBase} {...props}>
      {children}
    </h4>
  ),

  a: ({ href, children, ...props }) => {
    const isExternal = typeof href === "string" && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        {...props}
      >
        {children}
      </a>
    );
  },

  // The `div` slot is where remark-callout's rewritten blockquotes land.
  div: ({ children, className, ...props }) => {
    const calloutType = (props as Record<string, unknown>)["data-callout"];
    if (typeof calloutType === "string") {
      return <Callout type={calloutType}>{children}</Callout>;
    }
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  },

  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-5 border-l-2 border-accent/50 pl-4 italic text-foreground/80"
      {...props}
    >
      {children}
    </blockquote>
  ),

  code: ({ className, children, ...props }) => {
    const isBlock =
      (props as Record<string, unknown>)["data-language"] !== undefined ||
      /language-/.test(className ?? "") ||
      typeof children !== "string";

    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code className="rounded-md border border-border bg-foreground/5 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    );
  },

  // Block code: rehype-pretty-code's <pre> gets enhanced (label + copy button).
  pre: (props) => <CodeBlock {...props} />,

  table: ({ children, ...props }) => (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-foreground/5" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border-b border-border px-4 py-2 text-left font-semibold"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="border-b border-border px-4 py-2 align-top text-foreground/90"
      {...props}
    >
      {children}
    </td>
  ),

  img: (props) => <NoteImage {...props} />,

  hr: () => (
    <hr className="my-10 border-0 border-t border-border" />
  ),
};
