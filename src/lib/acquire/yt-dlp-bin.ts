/**
 * Lightweight yt-dlp presence/version probe for desk capabilities.
 * Kept separate from youtube.ts so /acquire status does not pull the full
 * download pipeline (spawn + index-after + indexer) into the page graph.
 */

import { execFileSync } from "node:child_process";

let cached:
  | { at: number; available: boolean; version: string | null }
  | null = null;
const CACHE_MS = 60_000;

function probe(): { available: boolean; version: string | null } {
  try {
    const out = execFileSync("yt-dlp", ["--version"], {
      encoding: "utf8",
      timeout: 4000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const version = out.trim().split("\n")[0] ?? null;
    return { available: true, version };
  } catch {
    try {
      execFileSync("which", ["yt-dlp"], {
        stdio: "ignore",
        timeout: 2000,
      });
      return { available: true, version: null };
    } catch {
      return { available: false, version: null };
    }
  }
}

function getCached(): { available: boolean; version: string | null } {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return { available: cached.available, version: cached.version };
  }
  const result = probe();
  cached = { at: now, ...result };
  return result;
}

export function ytDlpAvailable(): boolean {
  return getCached().available;
}

export function ytDlpVersion(): string | null {
  return getCached().version;
}

/** Test helper / force refresh after install */
export function clearYtDlpProbeCache(): void {
  cached = null;
}
