import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / heavy Node modules — keep external to the bundle
  serverExternalPackages: ["better-sqlite3", "sharp", "pdf-parse"],
};

export default nextConfig;
