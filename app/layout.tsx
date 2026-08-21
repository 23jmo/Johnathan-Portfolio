import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { figtree } from "@/lib/fonts";
import CustomCursor from "@/components/ui/CustomCursor";
import ScrollProgress from "@/components/ui/ScrollProgress";
import PaperAirplane from "@/components/ui/PaperAirplane";
import SpotifyNowPlaying from "@/components/ui/SpotifyNowPlaying";
import ScrollChatStage from "@/components/scrollchat/ScrollChatStage";
import { Analytics } from "@vercel/analytics/next";
import { Agentation } from "agentation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Johnathan Mo",
  description:
    "CS student at Columbia University. Building software across research labs, startups, big tech, and quant.",
  openGraph: {
    title: "Johnathan Mo",
    description:
      "CS student at Columbia University. Building software across research labs, startups, big tech, and quant.",
    url: "https://johnathanmo.com",
    siteName: "Johnathan Mo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Johnathan Mo",
    description:
      "CS student at Columbia University. Building software across research labs, startups, big tech, and quant.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-gr-* attributes onto <body> before React hydrates, which the
          server HTML never had. The flag only covers one level deep, so the
          one on <html> doesn't reach here — <body> needs its own. */}
      <body
        suppressHydrationWarning
        className={`${figtree.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          <PaperAirplane />
          <ScrollProgress />
          <CustomCursor />
          {/* Wraps the page so it can warp/stretch as the visitor pulls past the
              bottom, revealing the AI chat footer rising from below. */}
          <ScrollChatStage>{children}</ScrollChatStage>
          <SpotifyNowPlaying />
          <Analytics />
          {process.env.NODE_ENV === "development" && <Agentation />}
        </ThemeProvider>
      </body>
    </html>
  );
}
