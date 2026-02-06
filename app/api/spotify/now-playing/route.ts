import { NextResponse } from "next/server";
import { getNowPlaying } from "@/lib/spotify";

export const revalidate = 30;

export async function GET() {
  try {
    const track = await getNowPlaying();
    return NextResponse.json(track);
  } catch {
    return NextResponse.json({ isPlaying: false });
  }
}
