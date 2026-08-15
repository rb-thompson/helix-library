import { eq } from "drizzle-orm";
import { displayTitle } from "@/lib/catalog/display";
import { getItemById } from "@/lib/catalog/query";
import { getDb } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";
import type { CatalogItemRow } from "@/lib/types";

/** Why a Deep Lens focus could not be opened fully. */
export type LensFocusStatus =
  | "ok"
  | "invalid_id"
  | "not_found"
  | "disabled_location"
  | "missing";

export type LensFocusOk = {
  status: "ok";
  item: CatalogItemRow;
  title: string;
  /** Location is enabled and item is present on disk (media may still fail). */
  canServeMedia: boolean;
};

export type LensFocusProblem = {
  status: Exclude<LensFocusStatus, "ok">;
  itemId: number | null;
  item: CatalogItemRow | null;
  title: string | null;
  message: string;
};

export type LensFocus = LensFocusOk | LensFocusProblem;

/**
 * Resolve a catalog item id for Deep Lens.
 * Pure lib (no React) so unit tests drive the real entry point.
 *
 * - invalid_id: non-finite / non-positive id
 * - not_found: no catalog row
 * - disabled_location: holding exists but its scan root is disabled
 * - missing: holding marked missing on disk (still openable for metadata/insights)
 * - ok: present holding under an enabled location
 */
export function resolveLensFocus(rawId: unknown): LensFocus {
  const n =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string"
        ? Number(rawId.trim())
        : NaN;

  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    return {
      status: "invalid_id",
      itemId: null,
      item: null,
      title: null,
      message: "Deep Lens needs a valid holding id (positive integer).",
    };
  }

  const itemId = n;
  const item = getItemById(itemId);
  if (!item) {
    return {
      status: "not_found",
      itemId,
      item: null,
      title: null,
      message: `No holding with id ${itemId} in the catalog.`,
    };
  }

  const title = displayTitle(item);

  const db = getDb();
  const loc = db
    .select({
      id: locations.id,
      enabled: locations.enabled,
      name: locations.name,
    })
    .from(locations)
    .where(eq(locations.id, item.locationId))
    .get();

  if (!loc || loc.enabled !== 1) {
    return {
      status: "disabled_location",
      itemId,
      item,
      title,
      message: `Location “${loc?.name ?? item.locationName}” is disabled — enable it under Locations to open media in Deep Lens.`,
    };
  }

  if (item.isMissing) {
    return {
      status: "missing",
      itemId,
      item,
      title,
      message:
        "This holding is missing on disk. Insights and metadata remain available; media cannot be served.",
    };
  }

  return {
    status: "ok",
    item,
    title,
    canServeMedia: true,
  };
}

/** True when the focus has a catalog item (ok | missing | disabled_location). */
export function lensFocusHasItem(
  focus: LensFocus,
): focus is LensFocusOk | (LensFocusProblem & { item: CatalogItemRow }) {
  return focus.item != null;
}
