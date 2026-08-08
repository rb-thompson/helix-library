import type { CatalogItemRow } from "@/lib/types";
import type { MediaPreview } from "@/lib/media/preview-types";

/**
 * Allowlist for the text reading-room API (not binary media).
 * kind ∈ {text, code} OR mime starts with text/
 * Client-safe — no fs / SQLite imports.
 */
export function isTextReadableItem(
  item: Pick<CatalogItemRow, "kind" | "mime">,
): boolean {
  if (item.kind === "text" || item.kind === "code") return true;
  if (item.mime?.startsWith("text/")) return true;
  return false;
}

/** PDF holdings for PDF.js reading room (PR1b). Client-safe. */
export function isPdfDocumentItem(
  item: Pick<CatalogItemRow, "kind" | "mime" | "ext">,
): boolean {
  if (item.mime === "application/pdf") return true;
  if ((item.ext ?? "").toLowerCase() === "pdf") return true;
  return false;
}

export type ReadingRoomMode = "text" | "pdf";

/** Which room path to use when supportsReadingRoom is true. */
export function readingRoomMode(
  item: Pick<CatalogItemRow, "kind" | "mime" | "ext">,
  preview?: MediaPreview,
): ReadingRoomMode {
  if (preview?.type === "pdf" || isPdfDocumentItem(item)) return "pdf";
  return "text";
}

/**
 * Whether this holding should use DocumentReadingRoom (text/code continuous
 * reader or PDF.js page mode). A/V stay on the media theater.
 * Client-safe.
 */
export function supportsReadingRoom(
  item: Pick<CatalogItemRow, "kind" | "mime" | "ext" | "isMissing">,
  preview?: MediaPreview,
): boolean {
  if (item.isMissing) return false;
  if (preview?.type === "none") return false;
  if (preview?.type === "text" || preview?.type === "pdf") return true;
  if (isTextReadableItem(item)) return true;
  if (isPdfDocumentItem(item)) return true;
  return false;
}
