import { getPostBySlug, getAllPosts } from "@/lib/blog";
import { isExcludedBlogSlug, noindexRobots } from "@/lib/seo";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const revalidate = 3600;

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "Post Not Found" };
  return {
    title: `${post.title} — Johnathan Mo`,
    description: post.excerpt,
    // Ugly/test slugs stay readable but out of the index.
    ...(isExcludedBlogSlug(slug) ? { robots: noindexRobots } : {}),
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/blog"
        className="text-muted hover:text-accent transition-colors text-sm mb-8 inline-block"
      >
        &larr; All posts
      </Link>
      <article>
        <h1 className="text-3xl font-semibold mb-2">{post.title}</h1>
        <p className="text-sm text-muted mb-8">{post.date}</p>
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <MDXRemote source={post.content} />
        </div>
      </article>
    </main>
  );
}
