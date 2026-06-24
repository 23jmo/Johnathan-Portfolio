import Link from "next/link";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";
import type { NotesDoc } from "@/types";

interface NotesViewProps {
  notes: NotesDoc[];
}

/**
 * Homepage "Notes" view — a scannable list of class notes that deep-links into
 * the full reader at /notes/[slug]. Mirrors BuildsView so the three ViewToggle
 * tabs (Me / Builds / Notes) feel like siblings rather than separate pages.
 */
export default function NotesView({ notes }: NotesViewProps) {
  if (notes.length === 0) {
    return (
      <FadeInOnScroll>
        <p className="text-muted">No notes yet. Check back soon.</p>
      </FadeInOnScroll>
    );
  }

  return (
    <FadeInOnScroll>
      <ul className="space-y-6">
        {notes.map((note) => (
          <li key={note.slug}>
            <Link href={`/notes/${note.slug}`} className="group block">
              <span className="font-medium text-lg group-hover:text-accent transition-colors">
                {note.title}
              </span>
              {note.date && (
                <p className="text-sm text-muted mt-1">{note.date}</p>
              )}
              {note.summary && (
                <p className="text-foreground/80 mt-1">{note.summary}</p>
              )}
              {note.tags && note.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
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
            </Link>
          </li>
        ))}
      </ul>
    </FadeInOnScroll>
  );
}
