import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { figtree } from "@/lib/fonts";
import CustomCursor from "@/components/ui/CustomCursor";
import ScrollProgress from "@/components/ui/ScrollProgress";
import PaperAirplane from "@/components/ui/PaperAirplane";
import "./globals.css";

export const metadata: Metadata = {
  title: "Johnathan Mo",
  description:
    "CS student at Columbia University. Building software across research labs, startups, and big tech.",
  openGraph: {
    title: "Johnathan Mo",
    description:
      "CS student at Columbia University. Building software across research labs, startups, and big tech.",
    url: "https://johnathanmo.com",
    siteName: "Johnathan Mo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Johnathan Mo",
    description:
      "CS student at Columbia University. Building software across research labs, startups, and big tech.",
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
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <PaperAirplane />
          <ScrollProgress />
          <CustomCursor />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
