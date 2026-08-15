/**
 * Lightweight thumb path helpers for RSC pages.
 * Kept out of indexer/enrich so catalog/collections pages do not pull
 * sharp/ffmpeg enrichment into the server compile graph.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDbPath } from "@/lib/config";

export function thumbsDir(): string {
  // Sibling of the catalog (same as exportsRoot) so harness DBs stay isolated.
  const dir = path.join(path.dirname(getDbPath()), "thumbs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function thumbPathForItem(itemId: number): string {
  return path.join(thumbsDir(), `${itemId}.webp`);
}

export function hasThumb(itemId: number): boolean {
  return existsSync(thumbPathForItem(itemId));
}
