import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { getItemById } from "@/lib/catalog/query";
import { getDb } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";
import type { CatalogItemRow } from "@/lib/types";

const PREVIEWABLE_KINDS = new Set([
  "image",
  "video",
  "audio",
  "text",
  "code",
  "document",
]);

export function isPreviewableKind(kind: string): boolean {
  return PREVIEWABLE_KINDS.has(kind);
}

/**
 * Resolve a catalog item for media serving. Ensures:
 * - item exists and is not missing
 * - location is enabled
 * - file still exists on disk
 * - real path stays under the location root (no traversal)
 */
export function resolveMediaItem(id: number): {
  item: CatalogItemRow;
  absPath: string;
  size: number;
} | null {
  const item = getItemById(id);
  if (!item || item.isMissing) return null;

  const db = getDb();
  const loc = db
    .select()
    .from(locations)
    .where(eq(locations.id, item.locationId))
    .get();
  if (!loc || loc.enabled !== 1) return null;

  const root = path.resolve(loc.rootPath);
  const abs = path.resolve(item.path);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

  if (!existsSync(abs)) return null;
  let st;
  try {
    st = statSync(abs);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;

  return { item, absPath: abs, size: st.size };
}

export function contentTypeFor(item: CatalogItemRow): string {
  if (item.mime) return item.mime;
  const ext = (item.ext ?? "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    pdf: "application/pdf",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    json: "application/json; charset=utf-8",
    css: "text/css; charset=utf-8",
    html: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    ts: "text/plain; charset=utf-8",
    py: "text/plain; charset=utf-8",
  };
  return map[ext] ?? "application/octet-stream";
}

export function openFileStream(absPath: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(absPath);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

/** Parse Range header for video seeking. */
export function parseRange(
  rangeHeader: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!m) return null;
  let start = m[1] ? Number(m[1]) : 0;
  let end = m[2] ? Number(m[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (m[1] === "" && m[2] !== "") {
    // suffix form: bytes=-500
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (start < 0 || end >= size || start > end) return null;
  return { start, end };
}

export function openFileRangeStream(
  absPath: string,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(absPath, { start, end });
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}
