import ThemeToggle from "@/components/ui/ThemeToggle";
import HeroSection from "@/components/sections/HeroSection";
import ExperienceSection from "@/components/sections/ExperienceSection";
import ProjectsSection from "@/components/sections/ProjectsSection";
import EducationSection from "@/components/sections/EducationSection";
import AwardsSection from "@/components/sections/AwardsSection";
import YouTubeSection from "@/components/sections/YouTubeSection";
import SocialsSection from "@/components/sections/SocialsSection";
import BlogPreviewSection from "@/components/sections/BlogPreviewSection";
import CTAFooter from "@/components/sections/CTAFooter";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-8">
      <ThemeToggle />
      <HeroSection />
      <ExperienceSection />
      <ProjectsSection />
      <EducationSection />
      <AwardsSection />
      <YouTubeSection />
      <SocialsSection />
      <BlogPreviewSection />
      <CTAFooter />
    </main>
  );
}
