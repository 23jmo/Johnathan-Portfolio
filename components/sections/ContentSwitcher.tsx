"use client";

import { useState } from "react";
import type { BlogPost, NotesDoc } from "@/types";
import ViewToggle, { type HomeView } from "@/components/ui/ViewToggle";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";
import ExperienceSection from "@/components/sections/ExperienceSection";
import ProjectsSection from "@/components/sections/ProjectsSection";
import EducationSection from "@/components/sections/EducationSection";
import YouTubeVideosSection from "@/components/sections/YouTubeVideosSection";
import HackathonsSection from "@/components/sections/HackathonsSection";
import SocialsSection from "@/components/sections/SocialsSection";
import BlogPreviewSection from "@/components/sections/BlogPreviewSection";
import CTAFooter from "@/components/sections/CTAFooter";
import BuildsView from "@/components/sections/BuildsView";
import NotesView from "@/components/sections/NotesView";

interface ContentSwitcherProps {
  blogPosts: BlogPost[];
  notes: NotesDoc[];
}

export default function ContentSwitcher({
  blogPosts,
  notes,
}: ContentSwitcherProps) {
  const [activeView, setActiveView] = useState<HomeView>("me");

  return (
    <>
      <FadeInOnScroll>
        <ViewToggle activeView={activeView} onViewChange={setActiveView} />
      </FadeInOnScroll>
      <div className={activeView === "me" ? "space-y-8" : "hidden"}>
        <ExperienceSection />
        <ProjectsSection />
        <EducationSection />
        <YouTubeVideosSection />
        <HackathonsSection />
        <SocialsSection />
        <BlogPreviewSection posts={blogPosts} />
        <CTAFooter />
      </div>
      <div className={activeView === "builds" ? "" : "hidden"}>
        <BuildsView />
      </div>
      <div className={activeView === "notes" ? "" : "hidden"}>
        <NotesView notes={notes} />
      </div>
    </>
  );
}
