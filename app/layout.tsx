import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { figtree } from "@/lib/fonts";
import CustomCursor from "@/components/ui/CustomCursor";
import ScrollProgress from "@/components/ui/ScrollProgress";
import PaperAirplane from "@/components/ui/PaperAirplane";
import SpotifyNowPlaying from "@/components/ui/SpotifyNowPlaying";
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
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Johnathan Mo - CS Student at Columbia University",
      },
    ],
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
      <body className={`${figtree.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          <PaperAirplane />
          <ScrollProgress />
          <CustomCursor />
          {children}
          <SpotifyNowPlaying />
        </ThemeProvider>
      </body>
    </html>
  );
}
