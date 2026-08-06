import { unlinkSync } from "node:fs";
import {
  extractVideoPoster,
  hasThumb,
  thumbPathForItem,
  writeThumbFromImageBuffer,
} from "@/lib/indexer/enrich";
import { resolveMediaItem } from "@/lib/media/serve";

export type SetThumbResult =
  | { ok: true; hasThumb: true; mode: "frame" | "upload" | "regenerate" }
  | { ok: false; error: string };

/**
 * Set video poster from a frame at seekSeconds (requires ffmpeg + file on disk).
 */
export function setThumbFromVideoFrame(
  itemId: number,
  seekSeconds?: number,
): SetThumbResult {
  const resolved = resolveMediaItem(itemId);
  if (!resolved) {
    return { ok: false, error: "Item not found or file missing on disk" };
  }
  if (resolved.item.kind !== "video" && resolved.item.kind !== "audio") {
    // Allow audio too for cover-like poster if ever used; primarily video
    if (resolved.item.kind !== "image") {
      return {
        ok: false,
        error: "Frame grab is only available for video holdings",
      };
    }
  }
  if (resolved.item.kind !== "video") {
    return {
      ok: false,
      error: "Frame grab is only available for video holdings",
    };
  }

  const ok = extractVideoPoster(
    resolved.absPath,
    itemId,
    seekSeconds,
  );
  if (!ok) {
    return {
      ok: false,
      error:
        "Could not grab a frame (is ffmpeg installed?). Try another time offset.",
    };
  }
  return { ok: true, hasThumb: true, mode: "frame" };
}

/**
 * Replace thumb with an uploaded image (any item kind that shows thumbs).
 */
export async function setThumbFromUpload(
  itemId: number,
  buffer: Buffer,
): Promise<SetThumbResult> {
  const resolved = resolveMediaItem(itemId);
  if (!resolved) {
    return { ok: false, error: "Item not found or file missing on disk" };
  }
  if (buffer.length < 32) {
    return { ok: false, error: "Image file is empty or too small" };
  }
  if (buffer.length > 12 * 1024 * 1024) {
    return { ok: false, error: "Image too large (max 12 MB)" };
  }

  const ok = await writeThumbFromImageBuffer(itemId, buffer);
  if (!ok) {
    return {
      ok: false,
      error: "Could not process image (need a valid JPEG/PNG/WebP/GIF)",
    };
  }
  return { ok: true, hasThumb: true, mode: "upload" };
}

/** Remove custom/generated thumb so next reindex may regenerate video poster. */
export function clearThumb(itemId: number): { ok: true } | { ok: false; error: string } {
  try {
    if (hasThumb(itemId)) {
      unlinkSync(thumbPathForItem(itemId));
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not remove thumb",
    };
  }
}
