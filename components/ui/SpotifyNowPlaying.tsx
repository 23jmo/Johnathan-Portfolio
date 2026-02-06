"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { SpotifyTrack } from "@/types";

export default function SpotifyNowPlaying() {
  const [track, setTrack] = useState<SpotifyTrack | null>(null);

  useEffect(() => {
    async function fetchNowPlaying() {
      try {
        const res = await fetch("/api/spotify/now-playing");
        if (res.ok) {
          const data = await res.json();
          setTrack(data);
        }
      } catch {
        // Silently fail — widget just won't show
      }
    }

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!track || (!track.isPlaying && !track.title)) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      {track.albumImageUrl && (
        <Image
          src={track.albumImageUrl}
          alt={track.title ?? "Album art"}
          width={40}
          height={40}
          className="rounded"
          unoptimized
        />
      )}
      <div className="flex flex-col text-sm">
        <div className="flex items-center gap-2">
          {track.isPlaying && (
            <span className="w-2 h-2 rounded-full bg-green-500 spotify-pulse" />
          )}
          <span className="text-muted">
            {track.isPlaying ? "Now playing" : "Recently played"}
          </span>
        </div>
        {track.songUrl ? (
          <a
            href={track.songUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-accent transition-colors"
          >
            {track.title} — {track.artist}
          </a>
        ) : (
          <span>
            {track.title} — {track.artist}
          </span>
        )}
      </div>
    </div>
  );
}
