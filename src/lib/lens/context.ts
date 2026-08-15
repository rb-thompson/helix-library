import { CATALOG_READ_BODY_MAX } from "@/lib/agent/tools";
import { displayTitle } from "@/lib/catalog/display";
import { getItemById, getItemText } from "@/lib/catalog/query";
import {
  getItemCollections,
  getItemTags,
} from "@/lib/collections/manage";
import { lensFingerprint } from "@/lib/lens/dossier";
import { hasThumb } from "@/lib/media/thumbs";
import type { CatalogItemRow } from "@/lib/types";

export type LensContext = {
  item: CatalogItemRow;
  title: string;
  contentHash: string | null;
  fingerprint: string;
  body: string | null;
  bodyTruncated: boolean;
  tags: string[];
  collectionNames: string[];
  hasThumb: boolean;
  /** Client-safe thumb URL path only — never absolute FS path to model. */
  thumbUrl: string | null;
};

/**
 * Gather analysis inputs from catalog only (no invented paths).
 */
export function gatherLensContext(itemId: number): LensContext | null {
  const id = Math.floor(Number(itemId));
  if (!Number.isFinite(id) || id <= 0) return null;
  const item = getItemById(id);
  if (!item) return null;

  const text = getItemText(id);
  const rawBody = text?.body?.trim() ?? "";
  let body: string | null = null;
  let bodyTruncated = false;
  if (rawBody) {
    if (rawBody.length > CATALOG_READ_BODY_MAX) {
      body = rawBody.slice(0, CATALOG_READ_BODY_MAX);
      bodyTruncated = true;
    } else {
      body = rawBody;
    }
  }

  const tags = getItemTags(id)
    .map((t) => t.name)
    .filter(Boolean);
  const collectionNames = getItemCollections(id)
    .map((c) => c.name)
    .filter(Boolean);

  const thumb = hasThumb(id);

  return {
    item,
    title: displayTitle(item),
    contentHash: item.contentHash,
    fingerprint: lensFingerprint({
      contentHash: item.contentHash,
      mtimeMs: item.mtimeMs,
      sizeBytes: item.sizeBytes,
    }),
    body,
    bodyTruncated,
    tags,
    collectionNames,
    hasThumb: thumb,
    thumbUrl: thumb ? `/api/thumbs/${id}` : null,
  };
}
