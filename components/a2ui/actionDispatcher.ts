import type { A2UIAction } from "@/types";

/**
 * Build the dispatcher A2UI components call when interacted with. A `sendMessage`
 * action posts a new chat turn (the A2UI round-trip); an `href` action navigates.
 * This is the single seam between rendered generative UI and the chat loop.
 */
export function createDispatcher(opts: {
  sendMessage: (text: string) => void;
}): (action: A2UIAction) => void {
  return (action: A2UIAction) => {
    if (!action) return;
    if (action.sendMessage) {
      opts.sendMessage(action.sendMessage);
      return;
    }
    if (action.href) {
      const external = /^https?:\/\//.test(action.href);
      if (external) {
        window.open(action.href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = action.href;
      }
    }
  };
}
