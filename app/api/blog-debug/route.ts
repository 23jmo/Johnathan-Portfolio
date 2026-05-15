import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_BLOG_DB_ID;

  if (!apiKey || !dbId) {
    return NextResponse.json({ error: "Missing env vars", apiKey: !!apiKey, dbId: !!dbId });
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({ ok: false, status: res.status, error: data });
  }

  return NextResponse.json({
    ok: true,
    count: data.results?.length ?? 0,
    results: data.results?.map((r: any) => ({
      id: r.id,
      slug: r.properties?.Slug?.rich_text?.[0]?.plain_text,
      title: r.properties?.Name?.title?.[0]?.plain_text,
      published: r.properties?.Published?.checkbox,
    })),
  });
}
