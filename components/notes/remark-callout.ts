import { visit } from "unist-util-visit";
import type { Root, Blockquote, Paragraph, Text } from "mdast";

/**
 * Supported GitHub-style alert types. Authorable in plain Notion markdown as a
 * blockquote whose first line is `[!NOTE]`, `[!TIP]`, etc.
 */
const CALLOUT_TYPES = ["NOTE", "TIP", "WARNING", "IMPORTANT", "CAUTION"] as const;
type CalloutType = (typeof CALLOUT_TYPES)[number];

const MARKER = new RegExp(`^\\[!(${CALLOUT_TYPES.join("|")})\\]\\s*`, "i");

/**
 * Remark transform: rewrites GitHub-alert blockquotes into callout containers.
 *
 * A blockquote whose first paragraph begins with `[!TYPE]` is converted into a
 * `<div data-callout="type">` (via hast hName/hProperties), with the marker text
 * stripped. The renderer's `div` component picks up `data-callout` and swaps in
 * the styled <Callout>. Ordinary blockquotes are left untouched.
 */
export default function remarkCallout() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const firstChild = node.children[0];
      if (!firstChild || firstChild.type !== "paragraph") return;

      const paragraph = firstChild as Paragraph;
      const firstText = paragraph.children[0];
      if (!firstText || firstText.type !== "text") return;

      const textNode = firstText as Text;
      const match = textNode.value.match(MARKER);
      if (!match) return;

      const type = match[1].toUpperCase() as CalloutType;

      // Strip the `[!TYPE]` marker from the leading text.
      textNode.value = textNode.value.slice(match[0].length);

      // If the marker occupied its own line, the next inline node is a hard
      // break (or the trimmed text is now empty) — drop the dangling remnants.
      if (textNode.value.replace(/^\n+/, "").length === 0) {
        paragraph.children.shift();
        if (paragraph.children[0]?.type === "break") {
          paragraph.children.shift();
        }
      } else {
        textNode.value = textNode.value.replace(/^\n+/, "");
      }

      node.data = {
        ...node.data,
        hName: "div",
        hProperties: {
          ...((node.data?.hProperties as object) ?? {}),
          "data-callout": type.toLowerCase(),
        },
      };
    });
  };
}
