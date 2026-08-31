import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Google Search Console HTML-file verification:
  // drop google*.html into public/. Next.js serves public/ as static files
  // with the exact body at /google*.html. Do not commit a placeholder token.
  images: {
    formats: ["image/avif", "image/webp"],
    // Notes may reference locally-stored SVG diagrams (exported figures). These
    // are first-party assets under /public, so allowing SVG is safe here; the
    // CSP + sandbox neutralize any scripting inside the SVG.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
};

export default nextConfig;
