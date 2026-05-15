"use client";

import { useEffect, useState } from "react";
import { education, youtubeChannel } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function EducationSection() {
  const [subCount, setSubCount] = useState<string | null>(null);
  const [exactCount, setExactCount] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSubCount() {
      try {
        const res = await fetch("/api/youtube/subscribers");
        if (res.ok) {
          const data = await res.json();
          if (data.subscribers) {
            setSubCount(data.subscribers);
            setExactCount(Number(data.count).toLocaleString());
          }
        }
      } catch {
        // Silently fail
      }
    }
    fetchSubCount();
  }, []);

  const columbiaIcon = [
    {
      src: education[0].logo,
      alt: education[0].school,
      tooltipText: `${education[0].school} — ${education[0].gpa} GPA`,
      href: education[0].link,
    },
  ];

  const umichIcon = [
    {
      src: education[1].logo,
      alt: education[1].school,
      tooltipText: `${education[1].school} — ${education[1].gpa} GPA`,
      href: education[1].link,
      scale: education[1].logoScale,
      backgroundColor: education[1].logoBackground,
    },
  ];

  const youtubeIcon = [
    {
      src: "/icons/youtube.svg",
      alt: "YouTube",
      tooltipText: "YouTube",
      href: youtubeChannel,
    },
  ];

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          I&apos;m studying <strong>{education[0].degree}</strong> at{" "}
          <strong>{education[0].school}</strong> <IconCluster items={columbiaIcon} />,
          previously at <strong>{education[1].school}</strong> <IconCluster items={umichIcon} />,
          and I make videos about CS, projects, and college life <IconCluster items={youtubeIcon} />
          {subCount && (
            <span className="group relative inline-block text-muted tabular-nums cursor-default transition-colors hover:text-foreground">
              ({subCount} subscribers)
              {exactCount && (
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-foreground text-background text-xs rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50">
                  {exactCount} subscribers
                </span>
              )}
            </span>
          )}.
        </p>
      </section>
    </FadeInOnScroll>
  );
}
