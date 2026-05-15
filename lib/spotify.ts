const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_NOW_PLAYING_URL =
  "https://api.spotify.com/v1/me/player/currently-playing";
const SPOTIFY_RECENTLY_PLAYED_URL =
  "https://api.spotify.com/v1/me/player/recently-played?limit=2";

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  return data.access_token ?? null;
}

function extractTrack(
  track: Record<string, unknown>,
  isPlaying: boolean,
  progressMs?: number
) {
  const item = track as {
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album: { images: { url: string }[] };
    external_urls: { spotify: string };
  };

  return {
    isPlaying,
    title: item.name,
    artist: item.artists.map((a) => a.name).join(", "),
    albumImageUrl: item.album.images?.[0]?.url,
    songUrl: item.external_urls?.spotify,
    progressMs: progressMs ?? 0,
    durationMs: item.duration_ms ?? 0,
  };
}

export async function getNowPlaying() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { current: { isPlaying: false } };
  }

  try {
    const response = await fetch(SPOTIFY_NOW_PLAYING_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 204 || response.status > 400) {
      return getRecentlyPlayedData(accessToken);
    }

    const data = await response.json();

    if (!data.is_playing || !data.item) {
      return getRecentlyPlayedData(accessToken);
    }

    const current = extractTrack(data.item, true, data.progress_ms);

    // Also fetch recently played for the "previous" track
    const previous = await getRecentlyPlayedTrack(accessToken);

    return { current, previous };
  } catch {
    return { current: { isPlaying: false } };
  }
}

async function getRecentlyPlayedData(accessToken: string) {
  try {
    const response = await fetch(SPOTIFY_RECENTLY_PLAYED_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { current: { isPlaying: false } };
    }

    const data = await response.json();
    const items = data.items ?? [];

    if (items.length === 0) {
      return { current: { isPlaying: false } };
    }

    const current = extractTrack(items[0].track, false);
    const previous =
      items.length > 1
        ? extractTrack(items[1].track, false)
        : undefined;

    return { current, previous };
  } catch {
    return { current: { isPlaying: false } };
  }
}

async function getRecentlyPlayedTrack(accessToken: string) {
  try {
    const response = await fetch(SPOTIFY_RECENTLY_PLAYED_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return undefined;

    const data = await response.json();
    const track = data.items?.[0]?.track;
    if (!track) return undefined;

    return extractTrack(track, false);
  } catch {
    return undefined;
  }
}
