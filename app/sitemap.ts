import { getAllPosts } from "@/lib/blog";
import { getAllNotes } from "@/lib/notes";
import {
  SITE_URL,
  isExcludedBlogSlug,
  isExcludedNoteSlug,
} from "@/lib/seo";
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();
  const notes = getAllNotes();

  // Real posts and notes only. Fixture slugs stay off the sitemap.
  const blogEntries = posts
    .filter((post) => !isExcludedBlogSlug(post.slug))
    .map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  const noteEntries = notes
    .filter((note) => !note.noindex && !isExcludedNoteSlug(note.slug))
    .map((note) => ({
      url: `${SITE_URL}/notes/${note.slug}`,
      lastModified: note.date ? new Date(note.date) : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/notes`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...blogEntries,
    ...noteEntries,
  ];
}
