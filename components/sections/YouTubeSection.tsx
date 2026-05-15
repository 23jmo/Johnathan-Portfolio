"use client";

import { useEffect, useState } from "react";
import { youtubeChannel } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function YouTubeSection() {
  const [subCount, setSubCount] = useState<string | null>(null);

  const youtubeIcon = [
    {
      src: "/icons/youtube.svg",
      alt: "YouTube",
      tooltipText: "YouTube",
      href: youtubeChannel,
    },
  ];

  useEffect(() => {
    async function fetchSubCount() {
      try {
        const res = await fetch("/api/youtube/subscribers");
        if (res.ok) {
          const data = await res.json();
          if (data.subscribers) {
            setSubCount(data.subscribers);
          }
        }
      } catch {
        // Silently fail
      }
    }
    fetchSubCount();
  }, []);

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          I make videos about CS, projects, and college life.{" "}
          <IconCluster items={youtubeIcon} />
          {subCount && ` (${subCount} subscribers)`}
        </p>
      </section>
    </FadeInOnScroll>
  );
}
