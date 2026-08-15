/**
 * Visual inputs for Deep Lens analysis.
 * Paths only via resolveMediaItem / thumbs jail — never invented.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { commandExists } from "@/lib/indexer/enrich";
import { readExif } from "@/lib/media/exif";
import { resolveMediaItem } from "@/lib/media/serve";
import { hasThumb, thumbPathForItem } from "@/lib/media/thumbs";

const MAX_LONG_EDGE = 1280;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_FRAMES = 3;

export type VisionFrame = {
  label: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
};

export type VisionLoadResult = {
  frames: VisionFrame[];
  caveats: string[];
};

export function isVisionKind(kind: string): boolean {
  return kind === "image" || kind === "video";
}

/** EXIF/camera facts from a jailed file — empty when unavailable. */
export function loadLensExifFacts(
  itemId: number,
): Array<{ label: string; value: string }> {
  const resolved = resolveMediaItem(itemId);
  if (!resolved) return [];
  if (resolved.item.kind !== "image" && resolved.item.kind !== "video") {
    return [];
  }
  const exif = readExif(resolved.absPath);
  if (!exif.available) return [];
  return exif.fields.slice(0, 12);
}

/**
 * Prepare stills for Grok vision.
 * Images: jailed original, downscaled JPEG.
 * Video: up to 3 ffmpeg stills (or catalog poster thumb).
 */
export async function loadLensVisionFrames(
  itemId: number,
): Promise<VisionLoadResult> {
  const caveats: string[] = [];
  const resolved = resolveMediaItem(itemId);
  if (!resolved) {
    // Location disabled / missing file — try catalog thumb only (under data/thumbs).
    const thumb = readThumbFrame(itemId);
    if (thumb) {
      caveats.push(
        "Media file not serveable; used catalog thumb only (location disabled or file missing).",
      );
      return { frames: [thumb], caveats };
    }
    caveats.push("No visual file or thumb available for this holding.");
    return { frames: [], caveats };
  }

  const { item, absPath } = resolved;

  if (item.kind === "image") {
    const prepared = await prepareImageFrame(absPath, "holding");
    if (prepared) return { frames: [prepared], caveats };
    const thumb = readThumbFrame(itemId);
    if (thumb) {
      caveats.push("Could not read original image; used catalog thumb.");
      return { frames: [thumb], caveats };
    }
    caveats.push("Could not read image bytes for vision.");
    return { frames: [], caveats };
  }

  if (item.kind === "video") {
    const frames = extractVideoStills(absPath, item.durationMs);
    if (frames.length > 0) {
      caveats.push(
        `Saw ${frames.length} still frame${frames.length === 1 ? "" : "s"} from the video — not the full playback.`,
      );
      return { frames, caveats };
    }
    const thumb = readThumbFrame(itemId);
    if (thumb) {
      caveats.push(
        "Could not extract video stills; used catalog poster thumb only.",
      );
      return { frames: [thumb], caveats };
    }
    caveats.push("No video stills or poster available for vision.");
    return { frames: [], caveats };
  }

  caveats.push("This kind is not a visual holding.");
  return { frames: [], caveats };
}

function readThumbFrame(itemId: number): VisionFrame | null {
  if (!hasThumb(itemId)) return null;
  const p = thumbPathForItem(itemId);
  if (!existsSync(p)) return null;
  try {
    const bytes = readFileSync(p);
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    return { label: "catalog-thumb", mediaType: "image/webp", bytes };
  } catch {
    return null;
  }
}

async function prepareImageFrame(
  absPath: string,
  label: string,
): Promise<VisionFrame | null> {
  try {
    const sharp = (await import("sharp")).default;
    const bytes = await sharp(absPath, { failOn: "none" })
      .rotate()
      .resize(MAX_LONG_EDGE, MAX_LONG_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    return { label, mediaType: "image/jpeg", bytes };
  } catch {
    return null;
  }
}

function extractVideoStills(
  absPath: string,
  durationMs: number | null,
): VisionFrame[] {
  if (!commandExists("ffmpeg")) return [];
  const secs =
    durationMs != null && durationMs > 0 ? durationMs / 1000 : 0;
  const seeks =
    secs >= 4
      ? [secs * 0.12, secs * 0.5, secs * 0.82]
      : secs > 0
        ? [Math.min(1, secs * 0.4)]
        : [0, 1];

  const frames: VisionFrame[] = [];
  for (const t of seeks.slice(0, MAX_FRAMES)) {
    const frame = grabJpegStill(absPath, t);
    if (frame) frames.push(frame);
  }
  return frames;
}

function grabJpegStill(absPath: string, seekSec: number): VisionFrame | null {
  const t = Math.max(0, Number.isFinite(seekSec) ? seekSec : 0);
  try {
    const bytes = execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        t.toFixed(2),
        "-i",
        absPath,
        "-frames:v",
        "1",
        "-vf",
        `scale=${MAX_LONG_EDGE}:-2:force_original_aspect_ratio=decrease`,
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-q:v",
        "4",
        "pipe:1",
      ],
      { timeout: 20_000, maxBuffer: MAX_IMAGE_BYTES, stdio: ["ignore", "pipe", "pipe"] },
    );
    if (!Buffer.isBuffer(bytes) || bytes.length < 32) return null;
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    return {
      label: `still-${t.toFixed(1)}s`,
      mediaType: "image/jpeg",
      bytes,
    };
  } catch {
    return null;
  }
}
