import { getAllPosts } from "@/lib/blog";
import Link from "next/link";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function BlogPreviewSection() {
  const posts = getAllPosts().slice(0, 3);

  if (posts.length === 0) {
    return null;
  }

  return (
    <FadeInOnScroll>
      <section>
        <ul className="space-y-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group block"
              >
                <span className="font-medium group-hover:text-accent transition-colors">
                  {post.title}
                </span>
                <p className="text-sm text-muted mt-0.5">{post.date}</p>
                <p className="text-foreground/80 mt-1">{post.excerpt}</p>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/blog"
          className="inline-block mt-4 text-accent hover:underline underline-offset-2"
        >
          All posts &rarr;
        </Link>
      </section>
    </FadeInOnScroll>
  );
}
