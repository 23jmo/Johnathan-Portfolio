import {
  experiences,
  projects,
  education,
  hackathons,
  awards,
  socialLinks,
  youtubeChannel,
  ctaLink,
} from "@/lib/content";
import type { Source } from "@/types";

/**
 * Stable citation ids → destinations. The AI is told these ids in the system
 * prompt and cites them via the `cite` tool; this maps them back to real,
 * clickable links. Ids are derived deterministically from content.ts so adding
 * a project/experience automatically makes it citable.
 */

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

function buildSources(): Record<string, Source> {
  const map: Record<string, Source> = {};

  const add = (id: string, label: string, href: string | undefined) => {
    const resolved = href && href.length > 0 ? href : "/";
    map[id] = { id, label, href: resolved, external: isExternal(resolved) };
  };

  experiences.forEach((e) =>
    add(`exp-${slug(e.company)}`, `${e.title} @ ${e.company}`, e.link)
  );
  projects.forEach((p) => add(`proj-${slug(p.name)}`, p.name, p.link));
  education.forEach((ed) =>
    add(`edu-${slug(ed.school)}`, `${ed.school} (${ed.degree})`, ed.link)
  );
  hackathons.forEach((h) =>
    add(`hack-${slug(h.projectName)}`, `${h.projectName} — ${h.name}`, h.link)
  );
  awards.forEach((a) => add(`award-${slug(a.title)}`, a.title, "/"));
  socialLinks.forEach((s) => add(`social-${slug(s.name)}`, s.name, s.url));

  add("youtube", "Johnathan's YouTube", youtubeChannel);
  add("booking", "Email Johnathan", ctaLink);
  add("site", "johnathanmo.com", "/");

  return map;
}

const SOURCES = buildSources();

export function getSource(id: string): Source | null {
  return SOURCES[id] ?? null;
}

export function getAllSources(): Record<string, Source> {
  return SOURCES;
}

/** Human-readable list of every citable id, for the system prompt. */
export function listSourceIds(): string {
  return Object.values(SOURCES)
    .map((s) => `- ${s.id}: ${s.label}`)
    .join("\n");
}
