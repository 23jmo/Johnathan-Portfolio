import { NextResponse } from "next/server";
import { getNowPlaying } from "@/lib/spotify";
import type { SpotifyData } from "@/types";

export const revalidate = 30;

export async function GET() {
  try {
    const track = await getNowPlaying();
    return NextResponse.json<SpotifyData>(track);
  } catch {
    // Fallback MUST be a full SpotifyData ({ current }), not a bare track —
    // the client reads data.current.* unconditionally, so a `current`-less
    // payload crashes the render. Typing the response makes TS enforce it.
    return NextResponse.json<SpotifyData>({ current: { isPlaying: false } });
  }
}
