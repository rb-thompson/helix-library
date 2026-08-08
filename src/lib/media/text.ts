import { readFile } from "node:fs/promises";
import { isTextReadableItem } from "@/lib/media/reading-room";
import { resolveMediaItem } from "@/lib/media/serve";

export { isTextReadableItem } from "@/lib/media/reading-room";

/** Default / hard cap for text reading room API (512 KiB). */
export const TEXT_API_MAX_DEFAULT = 512 * 1024;
/** Minimum allowed `max` query (1 KiB). */
export const TEXT_API_MAX_MIN = 1024;
/** Hard upper bound (same as default this season). */
export const TEXT_API_MAX_HARD = 512 * 1024;

export type ItemFileTextOk = {
  ok: true;
  text: string;
  truncated: boolean;
  byteLength: number;
  encoding: "utf-8";
};

export type ItemFileTextErr = {
  ok: false;
  status: 404 | 415;
  error: string;
};

export type ItemFileTextResult = ItemFileTextOk | ItemFileTextErr;

/**
 * Clamp `max` query to [1 KiB, 512 KiB]. Invalid / missing → default 512 KiB.
 */
export function clampTextMax(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return TEXT_API_MAX_DEFAULT;
  return Math.min(TEXT_API_MAX_HARD, Math.max(TEXT_API_MAX_MIN, Math.floor(n)));
}

/** Same null-byte heuristic as loadMediaPreview. */
export function bufferLooksBinary(sample: Buffer | Uint8Array): boolean {
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

/**
 * Load capped UTF-8 text for a holding. Jail via resolveMediaItem.
 * Does not use item_text (FTS sample) — reads the file on disk.
 */
export async function loadItemFileText(
  id: number,
  maxBytes: number = TEXT_API_MAX_DEFAULT,
): Promise<ItemFileTextResult> {
  const max = clampTextMax(maxBytes);
  const resolved = resolveMediaItem(id);
  if (!resolved) {
    return { ok: false, status: 404, error: "Item not found or not available" };
  }

  const { item, absPath, size } = resolved;
  if (!isTextReadableItem(item)) {
    return {
      ok: false,
      status: 415,
      error: "Item is not text/code (unsupported media type for text API)",
    };
  }

  try {
    const buf = await readFile(absPath);
    const sample = buf.subarray(0, Math.min(buf.length, max));
    if (bufferLooksBinary(sample)) {
      return {
        ok: false,
        status: 415,
        error: "Binary content — open on disk or download to view",
      };
    }
    const truncated = buf.length > max;
    const text = sample.toString("utf8");
    return {
      ok: true,
      text,
      truncated,
      byteLength: size,
      encoding: "utf-8",
    };
  } catch {
    return { ok: false, status: 404, error: "Could not read file" };
  }
}
