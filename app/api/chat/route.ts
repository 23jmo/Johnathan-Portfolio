import OpenAI from "openai";
import { buildSystemPrompt } from "@/lib/scrollchat/systemPrompt";
import { getSource } from "@/lib/scrollchat/sources";
import {
  checkRateLimit,
  getClientIdentifier,
} from "@/lib/scrollchat/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Overridable without a redeploy. `gpt-5.6-luna` is the cheapest tier that still
// drives the tool loop reliably (~25x cheaper per turn than gpt-5.5), which
// matters because this endpoint is public and every question costs real money.
// Bump to `gpt-5.6-terra` or `gpt-5.5` via env if answer quality regresses.
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const MAX_TOOL_STEPS = 6;

type ChatMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatChunk = OpenAI.Chat.Completions.ChatCompletionChunk;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

/** Tool schemas advertised to the model. */
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

/**
 * Reject an over-limit caller.
 *
 * This deliberately answers with an SSE body rather than plain JSON: the client
 * never inspects `res.ok`, it goes straight to `res.body` and parses events, so
 * a JSON error would be swallowed by its parse guard and render as a silently
 * empty reply. The 429 status and Retry-After are still set for anything that
 * does read them (bots, monitoring, the browser's network panel).
 */
function rateLimitedResponse(retryAfterSeconds: number): Response {
  const waitDescription =
    retryAfterSeconds > 60
      ? "in a few minutes"
      : `in about ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`;

  const body =
    sse({
      type: "error",
      message: `Whoa — that's a lot of questions at once. Give me a breather and try again ${waitDescription}.`,
      retryable: true,
    }) + sse({ type: "done" });

  return new Response(body, {
    status: 429,
    headers: { ...SSE_HEADERS, "Retry-After": String(retryAfterSeconds) },
  });
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

/**
 * Failures that are worth retrying: the provider is momentarily overloaded,
 * rate-limited, or the connection dropped. A 4xx that isn't 408/409/429 means
 * the request itself is wrong, so retrying just burns time.
 */
function isTransientUpstreamError(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  // Connection/timeout errors carry no status but are retryable.
  return (
    error instanceof Error &&
    /timeout|network|connection|fetch failed/i.test(error.message)
  );
}

/**
 * Visitor-facing copy. Provider error bodies are raw JSON that leaks internals
 * (and reads as a crash), so they never reach the chat bubble — the real error
 * is logged server-side instead.
 */
function describeErrorForVisitor(error: unknown): string {
  const status = (error as { status?: unknown })?.status;
  if (status === 429) {
    return "I'm getting a lot of questions right now — give me a few seconds and ask again.";
  }
  if (status === 401 || status === 403) {
    return "My AI brain isn't authenticated right now. Johnathan's been pinged — in the meantime, have a look around the site.";
  }
  if (isTransientUpstreamError(error)) {
    return "My model provider is having a moment. Try that again in a few seconds — it usually clears up fast.";
  }
  return "Something went wrong on my end. Try asking again?";
}

const RETRY_BACKOFF_MS = [700, 1800, 4000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Open an upstream completion stream, retrying transient failures with backoff.
 * Only the *opening* handshake is retried — once tokens have been forwarded to
 * the browser, a retry would duplicate visible text.
 */
async function openCompletionStream(
  client: OpenAI,
  messages: ChatMessageParam[]
): Promise<AsyncIterable<ChatChunk>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await client.chat.completions.create({
        model: MODEL,
        stream: true,
        tools: TOOLS,
        messages,
        // Required, not merely an optimization: the gpt-5.6 family rejects
        // function tools on /v1/chat/completions with a 400 unless reasoning is
        // switched off. gpt-5.5 accepts it too, so this keeps OPENAI_MODEL
        // freely swappable. This workload is grounded lookup, not deduction —
        // measured reasoning usage was near zero even when it was allowed.
        reasoning_effort: "none",
      });
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < RETRY_BACKOFF_MS.length && isTransientUpstreamError(error);
      if (!canRetry) break;
      console.warn(
        `[chat] transient upstream error (attempt ${attempt + 1}), retrying`,
        error instanceof Error ? error.message : error
      );
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }

  throw lastError;
}

export async function POST(request: Request) {
  // Checked first: rejecting costs nothing, and every step past here either
  // parses attacker-controlled input or spends money at the provider.
  const clientId = getClientIdentifier(request);
  const rateLimit = checkRateLimit(clientId);
  if (!rateLimit.allowed) {
    console.warn(
      `[chat] rate limited ${clientId} on "${rateLimit.violatedRule?.label}" rule`
    );
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const apiKey = process.env.OPENAI_API_KEY;
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
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(sse(data)));

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

      // The SDK retries 5xx/429 internally; `openCompletionStream` adds a
      // second, slower layer on top for longer provider brownouts.
      const client = new OpenAI({ apiKey, maxRetries: 3 });

      // Conversation state, seeded with the grounding system prompt.
      const convo: ChatMessageParam[] = [
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
          const upstream = await openCompletionStream(client, convo);

          let assistantText = "";
          const toolCalls = new Map<
            number,
            { id: string; name: string; args: string; announced: boolean }
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
              const existing = toolCalls.get(tc.index) ?? {
                id: "",
                name: "",
                args: "",
                announced: false,
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.args += tc.function.arguments;

              // Announce the tool the moment its NAME arrives, long before its
              // arguments finish streaming. Tool results are only emitted once
              // the model stops talking, so without this the UI has no idea a
              // card is being written and shows nothing for seconds.
              if (existing.name && !existing.announced) {
                existing.announced = true;
                send({ type: "tool_start", name: existing.name });
              }

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
              type: "function" as const,
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
                toolResult = {
                  ok: false,
                  error: `unknown source id: ${sourceId}`,
                };
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
              const surface =
                typeof args.surface === "string" ? args.surface : "";
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
        // Log the real provider payload for debugging; show the visitor prose.
        console.error("[chat] upstream failure", error);
        send({
          type: "error",
          message: describeErrorForVisitor(error),
          retryable: isTransientUpstreamError(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
