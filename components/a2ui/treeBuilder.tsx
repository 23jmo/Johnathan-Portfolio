import { Fragment, type ReactNode } from "react";
import type { A2UIAction, A2UIState } from "@/types";
import { registry } from "./registry";
import { resolveProps } from "./bindingResolver";

/**
 * Recursively render an A2UI node tree starting from `id`, resolving each node's
 * data bindings against the surface data model. Two safety properties:
 *  - Cycle guard: a node already on the current path is skipped (`seen`).
 *  - Unknown components degrade gracefully — we still render their children so a
 *    surface using one unsupported wrapper isn't entirely lost.
 */
export function renderNode(
  state: A2UIState,
  id: string,
  dispatch: (action: A2UIAction) => void,
  seen: Set<string> = new Set()
): ReactNode {
  if (seen.has(id)) return null;
  const node = state.nodes[id];
  if (!node) return null;

  const nextSeen = new Set(seen);
  nextSeen.add(id);

  const children = (node.children ?? []).map((childId) => (
    <Fragment key={childId}>
      {renderNode(state, childId, dispatch, nextSeen)}
    </Fragment>
  ));

  const Component = registry[node.component];
  if (!Component) {
    return children.length > 0 ? <>{children}</> : null;
  }

  const props = resolveProps(node.props, state.dataModel);
  return (
    <Component props={props} dispatch={dispatch}>
      {children}
    </Component>
  );
}
