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
            gap: "32px",
          }}
        >
          <h1
            style={{
              fontSize: "96px",
              fontWeight: "700",
              margin: "0",
              lineHeight: "1",
              color: "#000",
            }}
          >
            Johnathan Mo
          </h1>
          <p
            style={{
              fontSize: "48px",
              margin: "0",
              lineHeight: "1.3",
              color: "#52525b",
              fontWeight: "400",
            }}
          >
            CS @ Columbia University
          </p>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
