import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / heavy Node modules — keep external to the bundle
  serverExternalPackages: ["better-sqlite3", "sharp", "pdf-parse"],
  // three/* and force-graph packages use ESM + examples/jsm paths that need
  // transpilation for the App Router client bundle (otherwise graph stays blank).
  transpilePackages: [
    "three",
    "3d-force-graph",
    "three-forcegraph",
    "three-render-objects",
    "three-spritetext",
  ],
};

export default nextConfig;
