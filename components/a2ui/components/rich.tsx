import type { A2UIComponentProps } from "./primitives";
import CitationChip from "@/components/scrollchat/CitationChip";

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

/** Responsive inline YouTube player. */
export function Video({ props }: A2UIComponentProps) {
  const videoId = str(props.videoId);
  if (!videoId) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
      <div className="relative aspect-video">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={str(props.title, "YouTube video")}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
      {str(props.title) && (
        <p className="px-3 py-2 text-xs text-white/70">{str(props.title)}</p>
      )}
    </div>
  );
}

/** A2UI citation → reuses the chat's CitationChip. */
export function Citation({ props }: A2UIComponentProps) {
  const href = str(props.href);
  if (!href) return null;
  return (
    <CitationChip
      citation={{
        n: typeof props.n === "number" ? props.n : 0,
        sourceId: str(props.sourceId),
        label: str(props.label, href),
        href,
        external: Boolean(props.external),
      }}
    />
  );
}

/** Rich, clickable link preview card. */
export function LinkCard({ props }: A2UIComponentProps) {
  const href = str(props.href);
  if (!href) return null;
  const external = Boolean(props.external) || /^https?:\/\//.test(href);
  const image = str(props.image);

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition-colors hover:border-white/25"
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white group-hover:text-white">
          {str(props.title, href)}
        </p>
        {str(props.description) && (
          <p className="truncate text-xs text-white/55">
            {str(props.description)}
          </p>
        )}
      </div>
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path d="M4 12L12 4M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
