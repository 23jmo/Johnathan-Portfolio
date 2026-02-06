import { getAllPosts } from "@/lib/blog";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Johnathan Mo",
  description: "Thoughts on CS, research, and building things.",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="text-muted hover:text-accent transition-colors text-sm mb-8 inline-block"
      >
        &larr; Back home
      </Link>
      <h1 className="text-3xl font-semibold mb-8">Blog</h1>
      {posts.length === 0 ? (
        <p className="text-muted">No posts yet. Check back soon.</p>
      ) : (
        <ul className="space-y-6">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={`/blog/${post.slug}`} className="group block">
                <span className="font-medium text-lg group-hover:text-accent transition-colors">
                  {post.title}
                </span>
                <p className="text-sm text-muted mt-1">{post.date}</p>
                <p className="text-foreground/80 mt-1">{post.excerpt}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
