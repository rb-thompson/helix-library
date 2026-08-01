import { readFile } from "node:fs/promises";
import type { CatalogItemRow } from "@/lib/types";
import { resolveMediaItem } from "@/lib/media/serve";

const TEXT_PREVIEW_MAX = 64 * 1024;

export type MediaPreview =
  | { type: "image"; src: string }
  | { type: "video"; src: string; mime: string | null }
  | { type: "audio"; src: string; mime: string | null }
  | { type: "pdf"; src: string }
  | { type: "text"; text: string; truncated: boolean }
  | { type: "none"; reason: string };

export async function loadMediaPreview(
  item: CatalogItemRow,
): Promise<MediaPreview> {
  if (item.isMissing) {
    return { type: "none", reason: "File is missing on disk." };
  }

  const resolved = resolveMediaItem(item.id);
  if (!resolved) {
    return {
      type: "none",
      reason: "File is not available for preview (disabled location or missing).",
    };
  }

  const src = `/api/media/${item.id}`;
  const mime = item.mime;

  if (item.kind === "image" || mime?.startsWith("image/")) {
    return { type: "image", src };
  }
  if (item.kind === "video" || mime?.startsWith("video/")) {
    return { type: "video", src, mime };
  }
  if (item.kind === "audio" || mime?.startsWith("audio/")) {
    return { type: "audio", src, mime };
  }
  if (
    item.kind === "document" &&
    (mime === "application/pdf" || item.ext?.toLowerCase() === "pdf")
  ) {
    return { type: "pdf", src };
  }

  if (item.kind === "text" || item.kind === "code" || mime?.startsWith("text/")) {
    try {
      const buf = await readFile(resolved.absPath);
      const sample = buf.subarray(0, TEXT_PREVIEW_MAX);
      const nulls = sample.filter((b) => b === 0).length;
      if (nulls > 0) {
        return { type: "none", reason: "Binary content — open on disk to view." };
      }
      const text = sample.toString("utf8");
      return {
        type: "text",
        text,
        truncated: buf.length > TEXT_PREVIEW_MAX,
      };
    } catch {
      return { type: "none", reason: "Could not read text preview." };
    }
  }

  return {
    type: "none",
    reason:
      "No in-browser preview for this format yet. Use the path or download.",
  };
}
