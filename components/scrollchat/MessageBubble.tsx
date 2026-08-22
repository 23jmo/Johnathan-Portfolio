import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ChatMessage } from "@/types";
import CitationChip from "./CitationChip";
import A2UISurface from "@/components/a2ui/A2UISurface";
import A2UISkeleton from "@/components/a2ui/A2UISkeleton";

/** Compact markdown styling for chat bubbles — links open in a new tab. */
const chatMarkdown: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1 list-disc space-y-0.5 pl-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 list-decimal space-y-0.5 pl-4">{children}</ol>
  ),
  code: ({ children }) => (
    <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
};

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex flex-col gap-2 ${isUser ? "max-w-[85%]" : "w-full"}`}>
        {/* Gemini-minimal: user turns sit in a subtle pill; the assistant reply
            is plain prose on the dark field (no bubble), so it reads like a
            document, not a chat balloon. */}
        <div
          className={
            isUser
              ? "self-end rounded-2xl rounded-br-md bg-white/[0.08] px-3.5 py-2 text-[15px] leading-relaxed text-white/95"
              : "text-[15px] leading-relaxed text-white/90"
          }
        >
          {message.content ? (
            <div className="[&_a]:text-white/80">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdown}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>

        {/* A2UI generative-UI surfaces */}
        {message.a2uiSurfaces && message.a2uiSurfaces.length > 0 && (
          <A2UISurface surfaces={message.a2uiSurfaces} />
        )}

        {/* One skeleton per surface the model has announced but not yet sent.
            Tool arguments are buffered upstream until the model stops talking,
            so this placeholder can be on screen for several seconds. */}
        {Array.from({ length: message.pendingSurfaceCount ?? 0 }, (_, index) => (
          <A2UISkeleton key={`surface-skeleton-${index}`} />
        ))}

        {/* Inline YouTube videos */}
        {message.youtube && message.youtube.length > 0 && (
          <div className="flex flex-col gap-2">
            {message.youtube.map((video) => (
              <div
                key={video.videoId}
                className="overflow-hidden rounded-xl border border-white/10 bg-black"
              >
                <div className="relative aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${video.videoId}`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
                {video.title && (
                  <p className="px-3 py-2 text-xs text-white/70">{video.title}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Citations row */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.citations.map((c) => (
              <CitationChip key={`${c.n}-${c.sourceId}`} citation={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
