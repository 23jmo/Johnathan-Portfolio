import { buildLlmsTxt } from "@/lib/llmsTxt";

/**
 * /llms.txt for LLM crawlers. Plain text, built from homepage content.
 */
export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
