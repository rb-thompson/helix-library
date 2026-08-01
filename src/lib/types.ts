export const ITEM_KINDS = [
  "text",
  "image",
  "video",
  "audio",
  "archive",
  "code",
  "document",
  "other",
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface IndexJobStats {
  seen: number;
  added: number;
  updated: number;
  unchanged: number;
  missing: number;
  skipped: number;
  errors: number;
  locations: number;
}

export const CATALOG_SORTS = ["mtime", "name", "size", "indexed"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogSortDir = "asc" | "desc";

export interface CatalogSearchParams {
  q?: string;
  kind?: ItemKind | "";
  locationId?: number | "";
  collectionId?: number | "";
  tagId?: number | "";
  /** Prefix match on rel_path (folder path within a location) */
  under?: string;
  sort?: CatalogSort;
  sortDir?: CatalogSortDir;
  page?: number;
  pageSize?: number;
  includeMissing?: boolean;
}

export interface CatalogFacets {
  kinds: Array<{ kind: string; c: number }>;
  locations: Array<{ id: number; name: string; c: number }>;
  tags: Array<{ id: number; name: string; c: number }>;
}

export interface CatalogItemRow {
  id: number;
  locationId: number;
  locationName: string;
  path: string;
  relPath: string;
  name: string;
  ext: string | null;
  kind: ItemKind;
  mime: string | null;
  sizeBytes: number;
  mtimeMs: number;
  ctimeMs: number;
  contentHash: string | null;
  title: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  indexedAt: number;
  isMissing: number;
}
