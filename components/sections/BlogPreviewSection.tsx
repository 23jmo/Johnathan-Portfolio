import Link from "next/link";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";
import type { BlogPost } from "@/types";

interface BlogPreviewSectionProps {
  posts: BlogPost[];
}

export default function BlogPreviewSection({ posts }: BlogPreviewSectionProps) {
  return (
    <FadeInOnScroll>
      <section>
        {posts.length > 0 && (
          <ul className="space-y-4">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="group block">
                  <span className="font-medium group-hover:text-accent transition-colors">
                    {post.title}
                  </span>
                  <p className="text-sm text-muted mt-0.5">{post.date}</p>
                  <p className="text-foreground/80 mt-1">{post.excerpt}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {posts.length > 0 && (
          <Link
            href="/blog"
            className="mt-4 inline-block text-accent hover:underline underline-offset-2"
          >
            All posts &rarr;
          </Link>
        )}
      </section>
    </FadeInOnScroll>
  );
}
