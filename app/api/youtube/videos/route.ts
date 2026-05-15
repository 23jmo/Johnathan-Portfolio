import { NextResponse } from "next/server";

export const runtime = "edge";
export const revalidate = 3600; // Cache for 1 hour

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_HANDLE = "jmooooooooo";

interface VideoItem {
  title: string;
  videoId: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: string;
}

/** Decode HTML entities that YouTube API returns in titles */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** Parse ISO 8601 duration (e.g. "PT4M13S") to seconds */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export async function GET() {
  try {
    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ videos: [] });
    }

    // Step 1: Get channel ID from handle
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${CHANNEL_HANDLE}&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 86400 } }
    );

    if (!channelResponse.ok) {
      return NextResponse.json({ videos: [] });
    }

    const channelData = await channelResponse.json();
    const channelId = channelData.items?.[0]?.id;

    if (!channelId) {
      return NextResponse.json({ videos: [] });
    }

    // Step 2: Search for recent videos (fetch extra to filter out Shorts)
    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!searchResponse.ok) {
      return NextResponse.json({ videos: [] });
    }

    const searchData = await searchResponse.json();
    const searchItems = searchData.items;

    if (!searchItems?.length) {
      return NextResponse.json({ videos: [] });
    }

    // Step 3: Get video details (statistics + duration) to filter Shorts
    const videoIds = searchItems.map((item: { id: { videoId: string } }) => item.id.videoId).join(",");
    const detailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    const detailsData = detailsResponse.ok ? await detailsResponse.json() : { items: [] };
    const detailsMap = new Map<string, { viewCount: string; duration: string }>();
    for (const item of detailsData.items ?? []) {
      detailsMap.set(item.id, {
        viewCount: item.statistics?.viewCount ?? "0",
        duration: item.contentDetails?.duration ?? "PT0S",
      });
    }

    // Step 4: Filter out Shorts (≤60s) and take first 3 longform videos
    const videos: VideoItem[] = [];
    for (const item of searchItems) {
      if (videos.length >= 3) break;
      const details = detailsMap.get(item.id.videoId);
      if (!details) continue;
      const durationSeconds = parseDuration(details.duration);
      if (durationSeconds <= 60) continue; // Skip Shorts
      videos.push({
        title: decodeHtmlEntities(item.snippet.title),
        videoId: item.id.videoId,
        thumbnail: item.snippet.thumbnails.high.url,
        publishedAt: item.snippet.publishedAt,
        viewCount: details.viewCount,
      });
    }

    return NextResponse.json({ videos });
  } catch (error) {
    console.error("YouTube Videos API error:", error);
    return NextResponse.json({ videos: [] });
  }
}
