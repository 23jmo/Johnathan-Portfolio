import { Fragment, type ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeUnwrapImages from "rehype-unwrap-images";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeReact from "rehype-react";
import remarkCallout from "./remark-callout";
import { markdownComponents } from "./markdownComponents";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Async Server Component that turns a note's raw markdown into a styled React
 * tree via a unified pipeline.
 *
 * We run unified directly (rather than react-markdown) because rehype-pretty-code
 * highlights with Shiki *asynchronously*, and react-markdown only renders
 * synchronously. `.process()` is awaitable, which is exactly what an async RSC
 * wants — and Shiki still runs only on the server, so no highlighter JS ships.
 *
 * Pipeline order matters:
 *  - remark (markdown AST): GFM (tables/tasklists/footnotes) → callout rewrite.
 *  - remark→rehype bridge.
 *  - rehype (HTML AST): slug headings → append hover anchors → Shiki highlight.
 *  - rehype-react: map elements to our component templates.
 *
 * Shiki uses a dual light/dark theme; `keepBackground: false` lets our own
 * `--code-bg` drive the block background. The theme swap is pure CSS
 * (see `.prose-notes` in globals.css) — no client JS, no flash on toggle.
 */
export default async function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCallout)
    .use(remarkRehype)
    // Markdown wraps a standalone image in a <p>; our NoteImage renders a
    // block-level <figure>, which is illegal inside <p> (hydration error).
    // Lift solo images out of their paragraph so <figure> is a valid sibling.
    .use(rehypeUnwrapImages)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: {
        className: ["heading-anchor"],
        ariaLabel: "Link to this section",
        tabIndex: -1,
      },
      content: { type: "text", value: "#" },
    })
    .use(rehypePrettyCode, {
      theme: { light: "github-light", dark: "github-dark" },
      keepBackground: false,
    })
    .use(rehypeReact, {
      Fragment,
      jsx,
      jsxs,
      components: markdownComponents,
    })
    .process(content);

  return file.result as ReactNode;
}
