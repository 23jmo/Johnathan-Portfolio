import ThemeToggle from "@/components/ui/ThemeToggle";
import HeroSection from "@/components/sections/HeroSection";
import ContentSwitcher from "@/components/sections/ContentSwitcher";
import { getAllPosts } from "@/lib/blog";

export const revalidate = 3600;

export default async function Home() {
  const blogPosts = (await getAllPosts()).slice(0, 3);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-8">
      <ThemeToggle />
      <HeroSection />
      <ContentSwitcher blogPosts={blogPosts} />
    </main>
  );
}
