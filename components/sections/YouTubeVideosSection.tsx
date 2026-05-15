"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

interface Video {
  title: string;
  videoId: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: string;
}

function formatViewCount(count: string): string {
  const num = parseInt(count, 10);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
  return `${num} views`;
}

export default function YouTubeVideosSection() {
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    async function fetchVideos() {
      try {
        const res = await fetch("/api/youtube/videos");
        if (res.ok) {
          const data = await res.json();
          if (data.videos?.length) {
            setVideos(data.videos);
          }
        }
      } catch {
        // Silently fail — section just won't render
      }
    }
    fetchVideos();
  }, []);

  if (videos.length === 0) return null;

  return (
    <FadeInOnScroll>
      <section>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {videos.map((video) => (
            <a
              key={video.videoId}
              href={`https://www.youtube.com/watch?v=${video.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-md overflow-hidden transition-transform duration-200 hover:scale-[1.02]"
            >
              <div className="relative aspect-video overflow-hidden rounded-md">
                <Image
                  src={video.thumbnail}
                  alt={video.title}
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                  sizes="150px"
                />
              </div>
              <div className="mt-1.5">
                <p className="text-xs font-medium leading-snug line-clamp-2 text-foreground/90">
                  {video.title}
                </p>
                <p className="text-[11px] text-muted mt-0.5">
                  {formatViewCount(video.viewCount)}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>
    </FadeInOnScroll>
  );
}
