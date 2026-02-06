"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import type { SpotifyData, SpotifyTrack } from "@/types";

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function SoundBars({ small = false, dark = true }: { small?: boolean; dark?: boolean }) {
  const barH = small ? 12 : 16;
  const barW = small ? 2 : 3;
  const color = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)";
  return (
    <div className="flex items-center" style={{ gap: "2px", height: `${barH}px` }}>
      {[0.8, 0.6, 0.9, 0.7].map((dur, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: `${barW}px`,
            backgroundColor: color,
            height: "40%",
            animation: `sound-bar ${dur}s ease-in-out infinite ${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function MusicIcon({ size = 22, dark = true }: { size?: number; dark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={dark ? "text-white/30" : "text-black/25"}>
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}

const PILL_WIDTH = 240;
const EXPANDED_WIDTH = 360;

export default function SpotifyNowPlaying() {
  const [data, setData] = useState<SpotifyData | null>(null);
  const [interpolatedProgress, setInterpolatedProgress] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [prevImgError, setPrevImgError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const fetchedAtRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Click outside to collapse
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (expanded && dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  const startProgressInterpolation = useCallback(
    (track: SpotifyTrack, fetchedAt: number) => {
      function tick() {
        if (!track.isPlaying || !track.progressMs || !track.durationMs) return;
        const elapsed = Date.now() - fetchedAt;
        const current = Math.min(track.progressMs + elapsed, track.durationMs);
        setInterpolatedProgress(current);
        animFrameRef.current = requestAnimationFrame(tick);
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      tick();
    },
    []
  );

  useEffect(() => {
    async function fetchNowPlaying() {
      try {
        const res = await fetch("/api/spotify/now-playing");
        if (res.ok) {
          const result: SpotifyData = await res.json();
          setData(result);
          setImgError(false);
          setPrevImgError(false);
          fetchedAtRef.current = Date.now();
          if (result.current.isPlaying && result.current.progressMs) {
            setInterpolatedProgress(result.current.progressMs);
            startProgressInterpolation(result.current, Date.now());
          } else {
            setInterpolatedProgress(result.current.progressMs ?? 0);
          }
        }
      } catch {
        // Silently fail
      }
    }
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 15000);
    return () => {
      clearInterval(interval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [startProgressInterpolation]);

  if (!data || (!data.current.isPlaying && !data.current.title)) {
    return null;
  }

  const { current, previous } = data;
  const progress = current.isPlaying ? interpolatedProgress : (current.progressMs ?? 0);
  const duration = current.durationMs ?? 0;
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  // Theme-aware colors — transparent liquid glass
  const dockBg = isDark
    ? "linear-gradient(135deg, rgba(40,40,40,0.4) 0%, rgba(20,20,20,0.5) 100%)"
    : "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(245,245,245,0.55) 100%)";
  const dockBorder = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)";
  const prevBg = isDark ? "rgba(30,30,30,0.6)" : "rgba(255,255,255,0.7)";
  const prevBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const artBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSecondary = isDark ? "text-white/45" : "text-gray-500";
  const textMuted = isDark ? "text-white/40" : "text-gray-400";
  const textFaint = isDark ? "text-white/30" : "text-gray-300";
  const textPrevTitle = isDark ? "text-white/60" : "text-gray-600";
  const progressTrack = isDark ? "bg-white/10" : "bg-black/8";
  const progressFill = isDark ? "bg-white/50" : "bg-gray-600";
  const pausedText = isDark ? "text-white/40" : "text-gray-400";

  const springTransition = {
    type: "spring" as const,
    stiffness: 300,
    damping: 28,
    mass: 0.9,
  };

  return (
    <>
      {/* Previous track — tiny left-edge element, only when expanded */}
      <AnimatePresence>
        {expanded && previous?.title && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 0.5, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-6 left-4 z-40 hidden sm:flex items-center gap-2 px-2 py-1.5 rounded-lg backdrop-blur-md hover:!opacity-100 transition-opacity duration-300"
            style={{ background: prevBg, borderWidth: 1, borderColor: prevBorder }}
          >
            {previous.albumImageUrl && !prevImgError ? (
              <div className="w-5 h-5 rounded-sm overflow-hidden shrink-0" style={{ backgroundColor: artBg }}>
                <img src={previous.albumImageUrl} alt="" className="w-full h-full object-cover" onError={() => setPrevImgError(true)} />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0" style={{ backgroundColor: artBg }}>
                <MusicIcon size={10} dark={isDark} />
              </div>
            )}
            <span className={`text-[10px] truncate max-w-[80px] leading-tight ${textPrevTitle}`}>
              {previous.title}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main element — Dynamic Island style */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40" ref={dockRef}>
        <motion.div
          onClick={() => setExpanded(!expanded)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="cursor-pointer select-none overflow-hidden shadow-2xl spotify-glass-dock"
          style={{
            background: dockBg,
            backdropFilter: "blur(12px) saturate(1.4)",
            WebkitBackdropFilter: "blur(12px) saturate(1.4)",
            borderWidth: 1.5,
            borderColor: dockBorder,
            boxShadow: isDark
              ? "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(255,255,255,0.05)"
              : "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 2px rgba(255,255,255,0.4)",
          }}
          animate={{
            borderRadius: expanded ? 20 : 50,
            width: expanded ? EXPANDED_WIDTH : PILL_WIDTH,
            height: expanded ? 100 : 48,
            scale: hovered && !expanded ? 1.06 : 1,
          }}
          transition={springTransition}
        >
          <AnimatePresence mode="wait" initial={false}>
            {expanded ? (
              /* ========== EXPANDED MODE ========== */
              <motion.div
                key="expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-3.5 relative p-3"
                style={{ height: "100%" }}
              >
                {/* Album art */}
                {current.albumImageUrl && !imgError ? (
                  <a
                    href={current.songUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="w-[72px] h-[72px] rounded-xl overflow-hidden shadow-lg" style={{ backgroundColor: artBg }}>
                      <img src={current.albumImageUrl} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
                    </div>
                  </a>
                ) : (
                  <div className="w-[72px] h-[72px] rounded-xl flex items-center justify-center shrink-0 shadow-lg" style={{ backgroundColor: artBg }}>
                    <MusicIcon size={24} dark={isDark} />
                  </div>
                )}

                {/* Song info */}
                <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                  <div className="flex items-center gap-1.5">
                    {current.isPlaying && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] spotify-pulse shrink-0" />
                    )}
                    <span className={`text-[9px] uppercase tracking-widest leading-none ${textMuted}`}>
                      {current.isPlaying ? "Jmo is listening to" : "Recently played"}
                    </span>
                  </div>

                  {current.songUrl ? (
                    <a
                      href={current.songUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-sm font-semibold truncate hover:opacity-80 transition-colors leading-snug ${textPrimary}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {current.title}
                    </a>
                  ) : (
                    <span className={`text-sm font-semibold truncate leading-snug ${textPrimary}`}>
                      {current.title}
                    </span>
                  )}

                  <span className={`text-xs truncate leading-tight ${textSecondary}`}>
                    {current.artist}
                  </span>

                  {duration > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className={`flex-1 h-[3px] rounded-full overflow-hidden ${progressTrack}`}>
                        <div
                          className={`h-full rounded-full ${progressFill}`}
                          style={{
                            width: `${Math.min(progressPercent, 100)}%`,
                            transition: "width 1s linear",
                          }}
                        />
                      </div>
                      <span className={`text-[9px] tabular-nums shrink-0 ${textFaint}`}>
                        {formatTime(progress)}/{formatTime(duration)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Sound bars — top right */}
                {current.isPlaying && (
                  <div className="absolute top-3 right-3">
                    <SoundBars small dark={isDark} />
                  </div>
                )}
              </motion.div>
            ) : (
              /* ========== PILL MODE ========== */
              <motion.div
                key="pill"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-3 px-3"
                style={{ height: "100%" }}
              >
                {/* Tiny album art */}
                {current.albumImageUrl && !imgError ? (
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: artBg }}>
                    <img src={current.albumImageUrl} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: artBg }}>
                    <MusicIcon size={14} dark={isDark} />
                  </div>
                )}

                {/* Song title + artist */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-[12px] font-medium truncate leading-tight ${textPrimary}`}>
                    {current.title}
                  </span>
                  <span className={`text-[10px] truncate leading-tight ${textMuted}`}>
                    {current.artist}
                  </span>
                </div>

                {/* Sound bars — vertically centered */}
                {current.isPlaying ? (
                  <SoundBars dark={isDark} />
                ) : (
                  <span className={`text-[10px] ${pausedText}`}>paused</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
