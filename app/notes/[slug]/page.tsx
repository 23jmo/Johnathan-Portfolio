import { getNoteBySlug, getAllNotes, extractToc } from "@/lib/notes";
import MarkdownRenderer from "@/components/notes/MarkdownRenderer";
import TableOfContents from "@/components/notes/TableOfContents";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface NotePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllNotes().map((note) => ({ slug: note.slug }));
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const note = getNoteBySlug(slug);
  if (!note) return { title: "Note Not Found" };
  return {
    title: `${note.title} — Johnathan Mo`,
    description: note.summary,
  };
}

export default async function NotePage({ params }: NotePageProps) {
  const { slug } = await params;
  const note = getNoteBySlug(slug);

  if (!note) {
    notFound();
  }

  const toc = extractToc(note.content);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <Link
        href="/notes"
        className="text-muted hover:text-accent transition-colors text-sm mb-8 inline-block"
      >
        &larr; All notes
      </Link>

      <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
        {/* Article column — constrained to a comfortable reading measure. */}
        <article className="min-w-0">
          <header className="mb-10">
            <h1 className="text-3xl font-semibold tracking-tight">
              {note.title}
            </h1>
            {note.date && (
              <p className="mt-2 text-sm text-muted">{note.date}</p>
            )}
            {note.tags && note.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border bg-foreground/5 px-2 py-0.5 text-xs text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className="prose-notes max-w-2xl">
            <MarkdownRenderer content={note.content} />
          </div>
        </article>

        {/* Sticky TOC rail — hidden on narrow viewports. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <TableOfContents items={toc} />
          </div>
        </aside>
      </div>
    </main>
  );
}
