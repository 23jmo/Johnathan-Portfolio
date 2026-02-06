const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_NOW_PLAYING_URL =
  "https://api.spotify.com/v1/me/player/currently-playing";
const SPOTIFY_RECENTLY_PLAYED_URL =
  "https://api.spotify.com/v1/me/player/recently-played?limit=1";

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

export async function getNowPlaying() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { isPlaying: false };
  }

  try {
    const response = await fetch(SPOTIFY_NOW_PLAYING_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 204 || response.status > 400) {
      return getRecentlyPlayed(accessToken);
    }

    const data = await response.json();

    if (!data.is_playing || !data.item) {
      return getRecentlyPlayed(accessToken);
    }

    return {
      isPlaying: true,
      title: data.item.name,
      artist: data.item.artists
        .map((a: { name: string }) => a.name)
        .join(", "),
      albumImageUrl: data.item.album.images?.[0]?.url,
      songUrl: data.item.external_urls?.spotify,
    };
  } catch {
    return { isPlaying: false };
  }
}

async function getRecentlyPlayed(accessToken: string) {
  try {
    const response = await fetch(SPOTIFY_RECENTLY_PLAYED_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { isPlaying: false };
    }

    const data = await response.json();
    const track = data.items?.[0]?.track;

    if (!track) {
      return { isPlaying: false };
    }

    return {
      isPlaying: false,
      title: track.name,
      artist: track.artists.map((a: { name: string }) => a.name).join(", "),
      albumImageUrl: track.album.images?.[0]?.url,
      songUrl: track.external_urls?.spotify,
    };
  } catch {
    return { isPlaying: false };
  }
}
