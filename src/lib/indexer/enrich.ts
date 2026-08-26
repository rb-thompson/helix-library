import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import type { ItemKind } from "@/lib/types";
import {
  hasThumb,
  thumbPathForItem,
  thumbsDir,
} from "@/lib/media/thumbs";

export { hasThumb, thumbPathForItem, thumbsDir };

const execFileAsync = promisify(execFile);

const TEXT_SAMPLE_BYTES = 48 * 1024;
const THUMB_SIZE = 320;

const commandCache = new Map<string, boolean>();

export interface EnrichmentResult {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  body: string | null;
  thumbWritten: boolean;
  posterPending: boolean;
}

export function commandExists(cmd: string): boolean {
  const hit = commandCache.get(cmd);
  if (hit !== undefined) return hit;
  let found = false;
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    found = true;
  } catch {
    found = false;
  }
  commandCache.set(cmd, found);
  return found;
}

/** Test hook — host tools may appear/disappear between suites. */
export function clearCommandCache(): void {
  commandCache.clear();
}

export async function extractImageMeta(
  filePath: string,
  itemId: number,
): Promise<Pick<EnrichmentResult, "width" | "height" | "thumbWritten">> {
  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(filePath, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const width = meta.width ?? null;
    const height = meta.height ?? null;

    let thumbWritten = false;
    try {
      const out = thumbPathForItem(itemId);
      await image
        .resize(THUMB_SIZE, THUMB_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 75 })
        .toFile(out);
      thumbWritten = true;
    } catch {
      // thumb optional
    }

    return { width, height, thumbWritten };
  } catch {
    return { width: null, height: null, thumbWritten: false };
  }
}

export function extractMediaDuration(filePath: string): number | null {
  if (!commandExists("ffprobe")) return null;
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf8", timeout: 15_000 },
    ).trim();
    const secs = Number(out);
    if (!Number.isFinite(secs) || secs < 0) return null;
    return Math.round(secs * 1000);
  } catch {
    return null;
  }
}

/** Video stream width/height via ffprobe. */
export function extractVideoDimensions(
  filePath: string,
): { width: number | null; height: number | null } {
  const meta = extractVideoMeta(filePath);
  return { width: meta.width, height: meta.height };
}

/** One ffprobe spawn for duration + video stream size. */
export function extractVideoMeta(filePath: string): {
  durationMs: number | null;
  width: number | null;
  height: number | null;
} {
  const empty = { durationMs: null, width: null, height: null };
  if (!commandExists("ffprobe")) return empty;
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "format=duration:stream=width,height",
        "-of",
        "json",
        filePath,
      ],
      { encoding: "utf8", timeout: 15_000 },
    );
    const parsed = JSON.parse(out) as {
      format?: { duration?: string };
      streams?: Array<{ width?: number; height?: number }>;
    };
    const secs = Number(parsed.format?.duration);
    const stream = parsed.streams?.[0];
    return {
      durationMs:
        Number.isFinite(secs) && secs >= 0 ? Math.round(secs * 1000) : null,
      width: Number.isFinite(stream?.width) ? Number(stream?.width) : null,
      height: Number.isFinite(stream?.height) ? Number(stream?.height) : null,
    };
  } catch {
    return empty;
  }
}

function posterSeeks(seekSeconds?: number): string[][] {
  if (seekSeconds != null && Number.isFinite(seekSeconds) && seekSeconds >= 0) {
    return [["-ss", String(seekSeconds)], ["-ss", "0"]];
  }
  return [
    ["-ss", "1"],
    ["-ss", "0"],
  ];
}

function posterArgs(filePath: string, out: string, seek: string[]): string[] {
  return [
    "-y",
    ...seek,
    "-i",
    filePath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${THUMB_SIZE}:-2:force_original_aspect_ratio=decrease`,
    "-an",
    out,
  ];
}

/**
 * Grab a poster frame at seekSeconds (fallback 1s then 0s) as WebP thumb.
 * Sync path for the item thumb editor (one file).
 */
export function extractVideoPoster(
  filePath: string,
  itemId: number,
  seekSeconds?: number,
): boolean {
  if (!commandExists("ffmpeg")) return false;
  const out = thumbPathForItem(itemId);
  mkdirSync(path.dirname(out), { recursive: true });

  for (const seek of posterSeeks(seekSeconds)) {
    try {
      execFileSync("ffmpeg", posterArgs(filePath, out, seek), {
        encoding: "utf8",
        timeout: 45_000,
        stdio: "pipe",
      });
      if (existsSync(out)) return true;
    } catch {
      // try next seek
    }
  }
  return false;
}

/** Async poster for the indexer pool (does not block the event loop). */
export async function extractVideoPosterAsync(
  filePath: string,
  itemId: number,
  seekSeconds?: number,
): Promise<boolean> {
  if (!commandExists("ffmpeg")) return false;
  const out = thumbPathForItem(itemId);
  mkdirSync(path.dirname(out), { recursive: true });

  for (const seek of posterSeeks(seekSeconds)) {
    try {
      await execFileAsync("ffmpeg", posterArgs(filePath, out, seek), {
        timeout: 45_000,
      });
      if (existsSync(out)) return true;
    } catch {
      // try next seek
    }
  }
  return false;
}

/**
 * Replace catalog thumb with a user-supplied image buffer (jpeg/png/webp/…).
 */
export async function writeThumbFromImageBuffer(
  itemId: number,
  input: Buffer,
): Promise<boolean> {
  try {
    const sharp = (await import("sharp")).default;
    const out = thumbPathForItem(itemId);
    mkdirSync(path.dirname(out), { recursive: true });
    await sharp(input, { failOn: "none" })
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(out);
    return existsSync(out);
  } catch {
    return false;
  }
}

export function isPdfDocument(
  kind: ItemKind,
  mime: string | null,
  filePath?: string,
): boolean {
  if (mime === "application/pdf") return true;
  if (kind === "document" && filePath) {
    return filePath.toLowerCase().endsWith(".pdf");
  }
  return false;
}

/**
 * Sample plain-text body for FTS. Returns:
 * - string (possibly empty) when extraction was attempted
 * - null when this kind is not text-extractable
 */
export async function extractTextBody(
  filePath: string,
  kind: ItemKind,
  mime: string | null,
): Promise<string | null> {
  if (isPdfDocument(kind, mime, filePath)) {
    const { extractPdfText } = await import("@/lib/indexer/pdf");
    // null from pdf = hard failure; treat as "" so we do not re-extract forever
    const pdf = await extractPdfText(filePath);
    return pdf ?? "";
  }

  const textish =
    kind === "text" ||
    kind === "code" ||
    mime?.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml";

  if (!textish) return null;

  try {
    const buf = await readFile(filePath);
    const sample = buf.subarray(0, TEXT_SAMPLE_BYTES);
    const nulls = sample.filter((b) => b === 0).length;
    if (nulls > 0) return "";

    let text = sample.toString("utf8");
    text = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
    text = text.trim();
    if (text.length > 40_000) text = text.slice(0, 40_000);
    return text;
  } catch {
    return "";
  }
}

export async function enrichFile(input: {
  filePath: string;
  itemId: number;
  kind: ItemKind;
  mime: string | null;
  existingWidth?: number | null;
  existingHeight?: number | null;
  existingDurationMs?: number | null;
  force?: boolean;
  /** Leave ffmpeg posters for the indexer pool. */
  deferPoster?: boolean;
}): Promise<EnrichmentResult> {
  const {
    filePath,
    itemId,
    kind,
    mime,
    existingWidth,
    existingHeight,
    existingDurationMs,
    force,
    deferPoster,
  } = input;

  let width = existingWidth ?? null;
  let height = existingHeight ?? null;
  let durationMs = existingDurationMs ?? null;
  let body: string | null = null;
  let thumbWritten = false;
  let posterPending = false;

  if (kind === "image" && (force || width == null || !hasThumb(itemId))) {
    const img = await extractImageMeta(filePath, itemId);
    width = img.width ?? width;
    height = img.height ?? height;
    thumbWritten = img.thumbWritten;
  }

  if (kind === "video") {
    if (force || durationMs == null || width == null) {
      const meta = extractVideoMeta(filePath);
      if (force || durationMs == null) durationMs = meta.durationMs;
      if (force || width == null) {
        width = meta.width ?? width;
        height = meta.height ?? height;
      }
    }
    if (force || !hasThumb(itemId)) {
      if (deferPoster) {
        posterPending = true;
      } else {
        thumbWritten = extractVideoPoster(filePath, itemId);
      }
    }
  }

  if (kind === "audio" && (force || durationMs == null)) {
    durationMs = extractMediaDuration(filePath);
  }

  if (
    kind === "text" ||
    kind === "code" ||
    isPdfDocument(kind, mime, filePath)
  ) {
    body = await extractTextBody(filePath, kind, mime);
  }

  return { width, height, durationMs, body, thumbWritten, posterPending };
}

export function ensureThumbsDir(): void {
  thumbsDir();
}
