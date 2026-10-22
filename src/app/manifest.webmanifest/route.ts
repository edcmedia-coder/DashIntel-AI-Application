import { NextResponse } from "next/server";

const manifest = {
  name: "DashIntel AI",
  short_name: "DashIntel",
  description: "Delivery intelligence and profit optimization for drivers.",
  start_url: "/dashboard/command",
  display: "standalone",
  orientation: "portrait-primary",
  theme_color: "#05070B",
  background_color: "#05070B",
  icons: [
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
  ],
};

export function GET() {
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
