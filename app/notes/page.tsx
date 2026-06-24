import { getAllNotes } from "@/lib/notes";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notes — Johnathan Mo",
  description: "Class notes and lecture write-ups, served in a clean reader.",
};

export default function NotesPage() {
  const notes = getAllNotes();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="text-muted hover:text-accent transition-colors text-sm mb-8 inline-block"
      >
        &larr; Back home
      </Link>
      <h1 className="text-3xl font-semibold mb-2">Notes</h1>
      <p className="text-muted mb-8">
        Class notes and lecture write-ups, rendered for reading.
      </p>

      {notes.length === 0 ? (
        <p className="text-muted">No notes yet. Check back soon.</p>
      ) : (
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
      )}
    </main>
  );
}
