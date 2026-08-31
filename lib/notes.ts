import fs from "fs";
import path from "path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import type { NotesDoc, TocItem } from "@/types";

const NOTES_DIR = path.join(process.cwd(), "content", "notes");

const isProduction = process.env.NODE_ENV === "production";

/**
 * Parse the YAML frontmatter + body of a single note file into a NotesDoc.
 * `includeContent` lets the index skip carrying full markdown bodies around.
 */
function parseNote(
  slug: string,
  raw: string,
  includeContent: boolean
): NotesDoc {
  const { data, content } = matter(raw);

  return {
    slug,
    title: typeof data.title === "string" ? data.title : slug,
    date: typeof data.date === "string" ? data.date : "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
    summary: typeof data.summary === "string" ? data.summary : undefined,
    draft: data.draft === true,
    // Fixture notes stay published and get noindex instead of a 404.
    noindex: data.noindex === true,
    content: includeContent ? content : "",
  };
}

/**
 * Read every `*.md` note, newest first. Drafts are hidden in production.
 * Mirrors lib/blog.ts's resilience: a missing directory or unreadable file
 * degrades to an empty list rather than crashing the route.
 */
export function getAllNotes(): NotesDoc[] {
  try {
    const fileNames = fs
      .readdirSync(NOTES_DIR)
      .filter((name) => name.endsWith(".md"));

    const notes = fileNames
      .map((fileName) => {
        const slug = fileName.replace(/\.md$/, "");
        const raw = fs.readFileSync(path.join(NOTES_DIR, fileName), "utf8");
        return parseNote(slug, raw, false);
      })
      .filter((note) => !(isProduction && note.draft))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return notes;
  } catch {
    return [];
  }
}

/**
 * Reject path-traversal attempts before touching the filesystem. A valid note
 * slug is a single path segment with no separators or `..`.
 */
function isSafeSlug(slug: string): boolean {
  return slug.length > 0 && !/[/\\]|\.\./.test(slug);
}

/**
 * Read a single note by slug, returning the full document (with body) or null
 * if the slug is unsafe, the file is missing, or it is a production-hidden draft.
 */
export function getNoteBySlug(slug: string): NotesDoc | null {
  if (!isSafeSlug(slug)) return null;

  try {
    const filePath = path.join(NOTES_DIR, `${slug}.md`);
    const raw = fs.readFileSync(filePath, "utf8");
    const note = parseNote(slug, raw, true);
    if (isProduction && note.draft) return null;
    return note;
  } catch {
    return null;
  }
}

/**
 * Build the side table of contents from the markdown body. We parse the same
 * mdast that the renderer consumes and slug headings with GithubSlugger so the
 * ids match rehype-slug exactly (otherwise scroll-spy anchors would 404).
 * Only depth 2–3 headings are surfaced to keep the rail shallow and scannable.
 */
export function extractToc(markdown: string): TocItem[] {
  const slugger = new GithubSlugger();
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const items: TocItem[] = [];

  visit(tree, "heading", (node: { depth: number }) => {
    if (node.depth < 2 || node.depth > 3) return;
    const text = mdastToString(node).trim();
    if (!text) return;
    items.push({ id: slugger.slug(text), text, depth: node.depth });
  });

  return items;
}
