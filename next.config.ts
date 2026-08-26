import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Native / heavy Node modules — keep external to the bundle
  serverExternalPackages: ["better-sqlite3", "sharp", "pdf-parse"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // three/* and force-graph packages use ESM + examples/jsm paths that need
  // transpilation for the App Router client bundle (otherwise graph stays blank).
  transpilePackages: [
    "three",
    "3d-force-graph",
    "force-graph",
    "three-forcegraph",
    "three-render-objects",
    "three-spritetext",
  ],
};

export default nextConfig;
