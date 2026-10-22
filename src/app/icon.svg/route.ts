import { NextResponse } from "next/server";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#05070B"/>
      <stop offset="1" stop-color="#0A1019"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#008CFF"/>
      <stop offset="1" stop-color="#19B5FF"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <rect x="28" y="28" width="456" height="456" rx="80" fill="none" stroke="#1D3045" stroke-width="2"/>
  <g stroke-linecap="round" stroke-linejoin="round">
    <path d="M114 330 208 156a14 14 0 0 1 24 0l118 154" stroke="url(#accent)" stroke-width="26"/>
    <path d="M114 330h156" stroke="#008CFF" stroke-width="26"/>
  </g>
  <circle cx="380" cy="330" r="42" fill="#19B5FF"/>
</svg>`;

export function GET() {
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
