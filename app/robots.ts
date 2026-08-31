import { SITE_URL } from "@/lib/seo";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    // Apex 307s to www. Point crawlers at the canonical host.
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
