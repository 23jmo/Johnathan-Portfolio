import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Johnathan Mo - CS Student at Columbia University";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "white",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "80px 100px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxWidth: "1000px",
          }}
        >
          <h1
            style={{
              fontSize: "72px",
              fontWeight: "600",
              margin: "0",
              lineHeight: "1.1",
              color: "#000",
            }}
          >
            Hi, I'm <strong>Johnathan Mo</strong>{" "}
            <span style={{ color: "#71717a" }}>(Jmo)</span>.
          </h1>
          <p
            style={{
              fontSize: "36px",
              margin: "0",
              lineHeight: "1.5",
              color: "#18181b",
              opacity: 0.9,
            }}
          >
            I'm a CS student at <strong>Columbia University</strong>. I love
            building software that solves real problems — from AR surgery tools
            to typing games.
          </p>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
