import type { A2UIState } from "@/types";
import { parseSurface } from "./parser";

/**
 * Merge one or more JSONL chunks into a single A2UI surface state. The agent may
 * build a surface across multiple `render_a2ui` calls (each arriving as its own
 * chunk); merging node maps and data models lets later chunks add or override
 * earlier nodes — the per-surface store the runtime renders from.
 */
export function mergeSurfaces(chunks: string[]): A2UIState {
  const merged: A2UIState = { nodes: {}, dataModel: {}, rootId: "root" };

  for (const chunk of chunks) {
    const state = parseSurface(chunk);
    Object.assign(merged.nodes, state.nodes);
    Object.assign(merged.dataModel, state.dataModel);
    // A later chunk that names a different root wins.
    if (state.rootId && state.rootId !== "root") merged.rootId = state.rootId;
  }

  return merged;
}
