import { NextResponse } from "next/server";

export const runtime = "edge";
export const revalidate = 3600; // Cache for 1 hour

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_HANDLE = "jmooooooooo"; // From @jmooooooooo

export async function GET() {
  try {
    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ subscribers: null, error: "No API key" });
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=${CHANNEL_HANDLE}&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      return NextResponse.json({ subscribers: null, error: "API error" });
    }

    const data = await response.json();
    const subscriberCount = data.items?.[0]?.statistics?.subscriberCount;

    if (!subscriberCount) {
      return NextResponse.json({ subscribers: null, error: "No data" });
    }

    // Format with K for thousands
    const formatted =
      subscriberCount >= 1000
        ? `${(subscriberCount / 1000).toFixed(1)}K`
        : subscriberCount;

    return NextResponse.json({ subscribers: formatted, count: subscriberCount });
  } catch (error) {
    console.error("YouTube API error:", error);
    return NextResponse.json({ subscribers: null, error: "Failed to fetch" });
  }
}
