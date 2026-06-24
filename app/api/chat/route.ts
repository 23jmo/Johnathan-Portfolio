import Dedalus from "dedalus-labs";
import { buildSystemPrompt } from "@/lib/scrollchat/systemPrompt";
import { getSource } from "@/lib/scrollchat/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dedalus model ids are dash-separated (e.g. `claude-sonnet-4-6`, NOT
// `claude-sonnet-4.6`). A dotted id resolves to no pricing row and Dedalus
// returns a misleading `unpriced_model` 400. Override via env without a redeploy.
const MODEL = process.env.DEDALUS_MODEL || "anthropic/claude-sonnet-4-6";
const MAX_TOOL_STEPS = 6;

/* ── Minimal structural types for the OpenAI-compatible stream ──────────── */
interface DeltaToolCall {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}
interface ChunkChoice {
  delta?: { content?: string | null; tool_calls?: DeltaToolCall[] };
  finish_reason?: string | null;
}
interface StreamChunkLike {
  choices?: ChunkChoice[];
}

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

/** Tool schemas advertised to the model (OpenAI function-tool format). */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "cite",
      description:
        "Cite a grounding source for a claim. Call this, then write the returned marker (e.g. [1]) inline right after the claim it supports.",
      parameters: {
        type: "object",
        properties: {
          sourceId: {
            type: "string",
            description: "A valid source id from the system prompt's list.",
          },
        },
        required: ["sourceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "render_youtube",
      description:
        "Render one or more of Johnathan's YouTube videos inline in the chat.",
      parameters: {
        type: "object",
        properties: {
          selection: {
            type: "string",
            enum: ["latest"],
            description: "Use 'latest' for the most recent video(s).",
          },
          videoId: {
            type: "string",
            description: "A specific YouTube video id to render.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "render_a2ui",
      description:
        "Render a rich generative-UI surface (project card, list, link card). Pass an A2UI v0.9 JSONL string.",
      parameters: {
        type: "object",
        properties: {
          surface: {
            type: "string",
            description: "A2UI surface as newline-delimited JSON (JSONL).",
          },
        },
        required: ["surface"],
      },
    },
  },
];

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Fetch Johnathan's latest longform videos by reusing the existing endpoint. */
async function fetchYouTube(origin: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${origin}/api/youtube/videos`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.videos) ? data.videos : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.DEDALUS_API_KEY;
  const origin = new URL(request.url).origin;

  let body: {
    messages?: IncomingMessage[];
    name?: string;
    pageContext?: { title?: string; path?: string } | null;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const userName = typeof body.name === "string" ? body.name : null;
  const pageContext = body.pageContext ?? null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(sse(data)));

      // Graceful degradation when the key isn't provisioned yet.
      if (!apiKey) {
        send({
          type: "text",
          value:
            "My AI brain isn't wired up yet (the API key is missing). In the meantime, explore the site — there's plenty about Johnathan's work here!",
        });
        send({ type: "done" });
        controller.close();
        return;
      }

      const client = new Dedalus({ apiKey });

      // Conversation state, seeded with the grounding system prompt.
      const convo: Array<Record<string, unknown>> = [
        { role: "system", content: buildSystemPrompt(userName) },
      ];
      if (pageContext?.title) {
        convo.push({
          role: "system",
          content: `The visitor opened this chat from the "${pageContext.title}" page (${pageContext.path ?? "/"}). If relevant, tailor your first answer to what they were just looking at.`,
        });
      }
      convo.push(...history.map((m) => ({ role: m.role, content: m.content })));

      let citationCounter = 0;

      try {
        for (let step = 0; step < MAX_TOOL_STEPS; step++) {
          const createParams = {
            model: MODEL,
            stream: true,
            tools: TOOLS,
            messages: convo,
          };

          const upstream = (await client.chat.completions.create(
            createParams as unknown as Parameters<
              typeof client.chat.completions.create
            >[0]
          )) as unknown as AsyncIterable<StreamChunkLike>;

          let assistantText = "";
          const toolCalls = new Map<
            number,
            { id: string; name: string; args: string }
          >();
          let finishReason: string | null = null;

          for await (const chunk of upstream) {
            const choice = chunk.choices?.[0];
            if (!choice) continue;

            const content = choice.delta?.content;
            if (content) {
              assistantText += content;
              send({ type: "text", value: content });
            }

            for (const tc of choice.delta?.tool_calls ?? []) {
              const existing =
                toolCalls.get(tc.index) ?? { id: "", name: "", args: "" };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.args += tc.function.arguments;
              toolCalls.set(tc.index, existing);
            }

            if (choice.finish_reason) finishReason = choice.finish_reason;
          }

          // No tool calls → the model is done talking.
          if (toolCalls.size === 0) break;

          // Record the assistant's tool-call turn, then resolve each tool.
          const calls = [...toolCalls.values()];
          convo.push({
            role: "assistant",
            content: assistantText || null,
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.args || "{}" },
            })),
          });

          for (const call of calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.args || "{}");
            } catch {
              args = {};
            }

            let toolResult: unknown = { ok: true };

            if (call.name === "cite") {
              const sourceId = String(args.sourceId ?? "");
              const source = getSource(sourceId);
              if (source) {
                citationCounter += 1;
                send({
                  type: "citation",
                  n: citationCounter,
                  sourceId,
                  label: source.label,
                  href: source.href,
                  external: source.external,
                });
                toolResult = { ok: true, marker: `[${citationCounter}]` };
              } else {
                toolResult = { ok: false, error: `unknown source id: ${sourceId}` };
              }
            } else if (call.name === "render_youtube") {
              const videos = await fetchYouTube(origin);
              const videoId =
                typeof args.videoId === "string" ? args.videoId : null;
              const selected = videoId
                ? videos.filter(
                    (v) => (v as { videoId?: string }).videoId === videoId
                  )
                : videos.slice(0, 3);
              send({ type: "youtube", videos: selected });
              toolResult = { ok: true, count: selected.length };
            } else if (call.name === "render_a2ui") {
              const surface = typeof args.surface === "string" ? args.surface : "";
              if (surface) send({ type: "a2ui", surface });
              toolResult = { ok: Boolean(surface) };
            } else {
              toolResult = { ok: false, error: "unknown tool" };
            }

            convo.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(toolResult),
            });
          }

          if (finishReason === "stop") {
            // Some providers stop after tools; loop once more to let it wrap up.
            continue;
          }
        }

        send({ type: "done" });
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Something went wrong.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
