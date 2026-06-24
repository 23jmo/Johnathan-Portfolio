"use client";

import { useMemo } from "react";
import { useScrollChat } from "@/components/scrollchat/ScrollChatProvider";
import { mergeSurfaces } from "./store";
import { renderNode } from "./treeBuilder";
import { createDispatcher } from "./actionDispatcher";

/**
 * Renders one generative-UI surface from its JSONL chunk(s). Parsing is memoized
 * on the chunk contents so re-renders during streaming stay cheap. Actions from
 * the surface are wired to the chat's sendMessage (the A2UI round-trip).
 */
export default function A2UISurface({ surfaces }: { surfaces: string[] }) {
  const { sendMessage } = useScrollChat();

  const state = useMemo(() => mergeSurfaces(surfaces), [surfaces]);
  const dispatch = useMemo(
    () => createDispatcher({ sendMessage }),
    [sendMessage]
  );

  const tree = renderNode(state, state.rootId, dispatch);
  if (!tree) return null;

  return <div className="a2ui-surface">{tree}</div>;
}
