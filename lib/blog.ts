import type { BlogPost } from "@/types";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const DATABASE_ID = process.env.NOTION_BLOG_DB_ID;
const NOTION_VERSION = "2022-06-28";

function isConfigured() {
  return !!(NOTION_API_KEY && DATABASE_ID);
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function extractPostFromPage(page: any): BlogPost {
  const props = page.properties ?? {};
  const titleParts = props["Name"]?.title ?? [];
  const slugParts = props["Slug"]?.rich_text ?? [];
  const excerptParts = props["Excerpt"]?.rich_text ?? [];

  const rawSlug = slugParts[0]?.plain_text ?? "";
  const slug = rawSlug.length > 0 && rawSlug.length <= 100 ? rawSlug : page.id;

  return {
    slug,
    title: titleParts[0]?.plain_text ?? "Untitled",
    date: props["Date"]?.date?.start ?? "",
    excerpt: excerptParts[0]?.plain_text ?? "",
    content: "",
  };
}

async function notionBlocksToMarkdown(pageId: string): Promise<string> {
  const res = await fetch(
    `https://api.notion.com/v1/blocks/${pageId}/children`,
    { headers: notionHeaders() }
  );
  if (!res.ok) return "";

  const data = await res.json();
  const lines: string[] = [];

  for (const block of data.results ?? []) {
    const richText = (items: any[]) =>
      (items ?? []).map((t: any) => t.plain_text).join("");

    switch (block.type) {
      case "paragraph":
        lines.push(richText(block.paragraph?.rich_text) + "\n");
        break;
      case "heading_1":
        lines.push(`# ${richText(block.heading_1?.rich_text)}\n`);
        break;
      case "heading_2":
        lines.push(`## ${richText(block.heading_2?.rich_text)}\n`);
        break;
      case "heading_3":
        lines.push(`### ${richText(block.heading_3?.rich_text)}\n`);
        break;
      case "bulleted_list_item":
        lines.push(`- ${richText(block.bulleted_list_item?.rich_text)}`);
        break;
      case "numbered_list_item":
        lines.push(`1. ${richText(block.numbered_list_item?.rich_text)}`);
        break;
      case "code":
        lines.push(
          `\`\`\`${block.code?.language ?? ""}\n${richText(block.code?.rich_text)}\n\`\`\``
        );
        break;
      case "quote":
        lines.push(`> ${richText(block.quote?.rich_text)}\n`);
        break;
      case "divider":
        lines.push("---\n");
        break;
    }
  }

  return lines.join("\n");
}

export async function getAllPosts(): Promise<BlogPost[]> {
  if (!isConfigured()) return [];

  try {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify({
          filter: { property: "Published", checkbox: { equals: true } },
          sorts: [{ property: "Date", direction: "descending" }],
        }),
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map(extractPostFromPage);
  } catch {
    return [];
  }
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!isConfigured()) return null;

  try {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify({
          filter: {
            and: [
              { property: "Slug", rich_text: { equals: slug } },
              { property: "Published", checkbox: { equals: true } },
            ],
          },
        }),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;

    const page = data.results[0];
    const post = extractPostFromPage(page);
    post.content = await notionBlocksToMarkdown(page.id);
    return post;
  } catch {
    return null;
  }
}
