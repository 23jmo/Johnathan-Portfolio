import type { A2UINode, A2UIState } from "@/types";

/**
 * Parse an A2UI surface from JSONL text into an {@link A2UIState}.
 *
 * Robustness is the whole point: each line is parsed independently, malformed
 * lines and unknown `type`s are skipped (not fatal), and a trailing partial line
 * is tolerated. This means a surface that is still streaming, or that contains a
 * stray line, degrades gracefully instead of blowing up the chat.
 *
 * Supported line shapes:
 *   {"type":"data","model":{...}}                          → merges data model
 *   {"type":"component","id":"root","component":"Column",
 *      "props":{...},"children":["a","b"]}                 → declares a node
 *   {"type":"begin"|"end", ...}                            → ignored (markers)
 */
export function parseSurface(jsonl: string): A2UIState {
  const state: A2UIState = { nodes: {}, dataModel: {}, rootId: "root" };
  if (!jsonl) return state;

  for (const rawLine of jsonl.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // partial or malformed line — skip
    }

    if (typeof parsed !== "object" || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;
    const type = obj.type;

    if (type === "data" && typeof obj.model === "object" && obj.model !== null) {
      state.dataModel = { ...state.dataModel, ...(obj.model as Record<string, unknown>) };
      continue;
    }

    if (type === "component") {
      const id = typeof obj.id === "string" ? obj.id : null;
      const component = typeof obj.component === "string" ? obj.component : null;
      if (!id || !component) continue;

      const node: A2UINode = {
        id,
        component,
        props:
          typeof obj.props === "object" && obj.props !== null
            ? (obj.props as Record<string, unknown>)
            : {},
        children: Array.isArray(obj.children)
          ? obj.children.filter((c): c is string => typeof c === "string")
          : [],
      };
      state.nodes[id] = node;
      if (typeof obj.root === "string") state.rootId = obj.root;
    }
    // Unknown types (begin/end/etc.) are intentionally ignored.
  }

  return state;
}
