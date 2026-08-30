import type { Metadata } from "next";
import WebGLPageSpike from "@/components/spike/WebGLPageSpike";

/**
 * SPIKE ROUTE — the portfolio's main page rendered entirely inside a WebGL2
 * canvas, so the cost and the feel can be compared against the shipping
 * SVG-filter version at `/`.
 *
 * Kept out of the index and the sitemap on purpose: there is nothing here for a
 * crawler to read, which is itself one of the findings.
 */
export const metadata: Metadata = {
  title: "WebGL page spike",
  robots: { index: false, follow: false },
};

export default function WebGLPageSpikeRoute() {
  return <WebGLPageSpike />;
}
