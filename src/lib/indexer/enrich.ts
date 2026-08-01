import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "@/lib/config";
import type { ItemKind } from "@/lib/types";

const TEXT_SAMPLE_BYTES = 48 * 1024;
const THUMB_SIZE = 320;

export function thumbsDir(): string {
  const dir = path.join(projectRoot(), "data", "thumbs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function thumbPathForItem(itemId: number): string {
  return path.join(thumbsDir(), `${itemId}.webp`);
}

export function hasThumb(itemId: number): boolean {
  return existsSync(thumbPathForItem(itemId));
}

export interface EnrichmentResult {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  body: string | null;
  thumbWritten: boolean;
}

export function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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
  if (!commandExists("ffprobe")) return { width: null, height: null };
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        filePath,
      ],
      { encoding: "utf8", timeout: 15_000 },
    ).trim();
    const [w, h] = out.split("x").map((n) => Number(n));
    return {
      width: Number.isFinite(w) ? w : null,
      height: Number.isFinite(h) ? h : null,
    };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * Grab a poster frame ~1s in (or 0s for short clips) as WebP thumb.
 */
export function extractVideoPoster(filePath: string, itemId: number): boolean {
  if (!commandExists("ffmpeg")) return false;
  const out = thumbPathForItem(itemId);
  mkdirSync(path.dirname(out), { recursive: true });

  const attempts = [
    ["-ss", "1"],
    ["-ss", "0"],
  ];

  for (const seek of attempts) {
    try {
      execFileSync(
        "ffmpeg",
        [
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
        ],
        { encoding: "utf8", timeout: 45_000, stdio: "pipe" },
      );
      if (existsSync(out)) return true;
    } catch {
      // try next seek
    }
  }
  return false;
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
  } = input;

  let width = existingWidth ?? null;
  let height = existingHeight ?? null;
  let durationMs = existingDurationMs ?? null;
  let body: string | null = null;
  let thumbWritten = false;

  if (kind === "image" && (force || width == null || !hasThumb(itemId))) {
    const img = await extractImageMeta(filePath, itemId);
    width = img.width ?? width;
    height = img.height ?? height;
    thumbWritten = img.thumbWritten;
  }

  if (kind === "video") {
    if (force || durationMs == null) {
      durationMs = extractMediaDuration(filePath);
    }
    if (force || width == null) {
      const dims = extractVideoDimensions(filePath);
      width = dims.width ?? width;
      height = dims.height ?? height;
    }
    if (force || !hasThumb(itemId)) {
      thumbWritten = extractVideoPoster(filePath, itemId);
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

  return { width, height, durationMs, body, thumbWritten };
}

export function ensureThumbsDir(): void {
  thumbsDir();
}
