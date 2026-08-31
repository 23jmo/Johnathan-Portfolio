/**
 * Shared site URL and crawl rules.
 * Apex johnathanmo.com 307s to www, so every public URL we emit uses www.
 */

export const SITE_URL = "https://www.johnathanmo.com";

/**
 * Fixture / test slugs. Keep the pages (prefer noindex over delete) but
 * leave them out of the sitemap so crawlers stop treating them as real URLs.
 * /blog/test-test is a real essay with an ugly slug. /notes/sample-lecture
 * is sample notes that exercise the template.
 */
export const SITEMAP_EXCLUDED_BLOG_SLUGS = new Set(["test-test"]);
export const SITEMAP_EXCLUDED_NOTE_SLUGS = new Set(["sample-lecture"]);

export const noindexRobots = {
  index: false,
  follow: false,
} as const;

export function isExcludedBlogSlug(slug: string): boolean {
  return SITEMAP_EXCLUDED_BLOG_SLUGS.has(slug);
}

export function isExcludedNoteSlug(slug: string): boolean {
  return SITEMAP_EXCLUDED_NOTE_SLUGS.has(slug);
}
