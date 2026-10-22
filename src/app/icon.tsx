import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at top, #0A1019, #05070B)",
          borderRadius: 96,
          border: "1px solid #1D3045",
        }}
      >
        <svg width="320" height="320" viewBox="0 0 512 512">
          <defs>
            <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#008CFF" />
              <stop offset="1" stopColor="#19B5FF" />
            </linearGradient>
          </defs>
          <g strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M114 330 208 156a14 14 0 0 1 24 0l118 154"
              stroke="url(#accent)"
              strokeWidth="26"
            />
            <path d="M114 330h156" stroke="#008CFF" strokeWidth="26" />
          </g>
          <circle cx="380" cy="330" r="42" fill="#19B5FF" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
