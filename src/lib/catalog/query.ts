import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import {
  collectionItems,
  itemTags,
  itemText,
  items,
  locations,
} from "@/lib/db/schema";
import type {
  CatalogFacets,
  CatalogItemRow,
  CatalogSearchParams,
  CatalogSort,
  CatalogSortDir,
  ItemKind,
} from "@/lib/types";

function mapRow(row: {
  id: number;
  locationId: number;
  locationName: string;
  path: string;
  relPath: string;
  name: string;
  ext: string | null;
  kind: string;
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
}): CatalogItemRow {
  return {
    ...row,
    kind: row.kind as ItemKind,
  };
}

function itemIdsForFilters(params: CatalogSearchParams): number[] | null {
  const db = getDb();
  let ids: number[] | null = null;

  if (params.collectionId) {
    const rows = db
      .select({ itemId: collectionItems.itemId })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, Number(params.collectionId)))
      .all();
    ids = rows.map((r) => r.itemId);
    if (ids.length === 0) return [];
  }

  if (params.tagId) {
    const rows = db
      .select({ itemId: itemTags.itemId })
      .from(itemTags)
      .where(eq(itemTags.tagId, Number(params.tagId)))
      .all();
    const tagIds = rows.map((r) => r.itemId);
    if (ids === null) {
      ids = tagIds;
    } else {
      const set = new Set(tagIds);
      ids = ids.filter((id) => set.has(id));
    }
    if (ids.length === 0) return [];
  }

  return ids;
}

function normalizeUnder(under?: string): string {
  if (!under) return "";
  return under
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
}

function orderSql(
  sort: CatalogSort = "mtime",
  sortDir: CatalogSortDir = "desc",
): string {
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  switch (sort) {
    case "name":
      return `i.name COLLATE NOCASE ${dir}, i.id ${dir}`;
    case "size":
      return `i.size_bytes ${dir}, i.name COLLATE NOCASE ASC`;
    case "indexed":
      return `i.indexed_at ${dir}, i.name COLLATE NOCASE ASC`;
    case "mtime":
    default:
      return `i.mtime_ms ${dir}, i.name COLLATE NOCASE ASC`;
  }
}

function buildBaseFilters(
  params: CatalogSearchParams,
  opts?: { omitKind?: boolean; omitLocation?: boolean; omitTag?: boolean },
): { filters: string[]; args: unknown[] } {
  const filters: string[] = ["l.enabled = 1"];
  const args: unknown[] = [];
  const includeMissing = params.includeMissing ?? false;
  if (!includeMissing) filters.push("i.is_missing = 0");

  if (!opts?.omitKind && params.kind) {
    filters.push("i.kind = ?");
    args.push(params.kind);
  }
  if (!opts?.omitLocation && params.locationId) {
    filters.push("i.location_id = ?");
    args.push(Number(params.locationId));
  }

  const under = normalizeUnder(params.under);
  if (under) {
    filters.push("(i.rel_path = ? OR i.rel_path LIKE ?)");
    args.push(under, `${under}/%`);
  }

  const filterIds = itemIdsForFilters({
    ...params,
    tagId: opts?.omitTag ? "" : params.tagId,
    collectionId: params.collectionId,
  });
  if (filterIds) {
    if (filterIds.length === 0) {
      filters.push("1=0");
    } else {
      filters.push(`i.id IN (${filterIds.map(() => "?").join(",")})`);
      args.push(...filterIds);
    }
  }

  return { filters, args };
}

function ftsMatchClause(q: string): { clause: string; match: string } | null {
  const sanitized = q
    .replace(/["']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"*`)
    .join(" ");
  if (!sanitized) return null;
  return {
    match: sanitized,
    clause: `(
      i.id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)
      OR i.id IN (SELECT rowid FROM item_body_fts WHERE item_body_fts MATCH ?)
    )`,
  };
}

export function searchCatalog(params: CatalogSearchParams = {}): {
  items: CatalogItemRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: CatalogSort;
  sortDir: CatalogSortDir;
} {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const q = params.q?.trim() ?? "";
  const sort: CatalogSort = params.sort ?? "mtime";
  const sortDir: CatalogSortDir =
    params.sortDir ?? (sort === "name" ? "asc" : "desc");

  const filterIds = itemIdsForFilters(params);
  if (filterIds && filterIds.length === 0) {
    return { items: [], total: 0, page, pageSize, sort, sortDir };
  }

  const sqlite = getSqlite();
  const { filters, args } = buildBaseFilters(params);
  const where = filters.join(" AND ");
  const order = orderSql(sort, sortDir);

  if (q) {
    const fts = ftsMatchClause(q);
    if (!fts) {
      return { items: [], total: 0, page, pageSize, sort, sortDir };
    }

    const totalRow = sqlite
      .prepare(
        `
        SELECT count(*) as c
        FROM items i
        JOIN locations l ON l.id = i.location_id
        WHERE ${fts.clause} AND ${where}
      `,
      )
      .get(fts.match, fts.match, ...args) as { c: number };

    const rows = sqlite
      .prepare(
        `
        SELECT
          i.id as id,
          i.location_id as locationId,
          l.name as locationName,
          i.path as path,
          i.rel_path as relPath,
          i.name as name,
          i.ext as ext,
          i.kind as kind,
          i.mime as mime,
          i.size_bytes as sizeBytes,
          i.mtime_ms as mtimeMs,
          i.ctime_ms as ctimeMs,
          i.content_hash as contentHash,
          i.title as title,
          i.width as width,
          i.height as height,
          i.duration_ms as durationMs,
          i.indexed_at as indexedAt,
          i.is_missing as isMissing
        FROM items i
        JOIN locations l ON l.id = i.location_id
        WHERE ${fts.clause} AND ${where}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `,
      )
      .all(fts.match, fts.match, ...args, pageSize, offset) as Array<
      Parameters<typeof mapRow>[0]
    >;

    return {
      items: rows.map(mapRow),
      total: totalRow.c,
      page,
      pageSize,
      sort,
      sortDir,
    };
  }

  const totalRow = sqlite
    .prepare(
      `
      SELECT count(*) as c
      FROM items i
      JOIN locations l ON l.id = i.location_id
      WHERE ${where}
    `,
    )
    .get(...args) as { c: number };

  const rows = sqlite
    .prepare(
      `
      SELECT
        i.id as id,
        i.location_id as locationId,
        l.name as locationName,
        i.path as path,
        i.rel_path as relPath,
        i.name as name,
        i.ext as ext,
        i.kind as kind,
        i.mime as mime,
        i.size_bytes as sizeBytes,
        i.mtime_ms as mtimeMs,
        i.ctime_ms as ctimeMs,
        i.content_hash as contentHash,
        i.title as title,
        i.width as width,
        i.height as height,
        i.duration_ms as durationMs,
        i.indexed_at as indexedAt,
        i.is_missing as isMissing
      FROM items i
      JOIN locations l ON l.id = i.location_id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `,
    )
    .all(...args, pageSize, offset) as Array<Parameters<typeof mapRow>[0]>;

  return {
    items: rows.map(mapRow),
    total: totalRow?.c ?? 0,
    page,
    pageSize,
    sort,
    sortDir,
  };
}

/**
 * Facet counts for the current query, omitting the facet dimension itself
 * so users can pivot (e.g. kind counts ignore selected kind).
 */
export function catalogFacets(params: CatalogSearchParams = {}): CatalogFacets {
  const sqlite = getSqlite();
  const q = params.q?.trim() ?? "";
  const fts = q ? ftsMatchClause(q) : null;

  function run(
    omit: { omitKind?: boolean; omitLocation?: boolean; omitTag?: boolean },
    selectSql: string,
    groupBy: string,
  ): Array<Record<string, unknown>> {
    const { filters, args } = buildBaseFilters(params, omit);
    // When omitting tag filter, rebuild without tagId for collection-only
    const where = filters.join(" AND ");
    const matchArgs = fts ? [fts.match, fts.match] : [];
    const matchClause = fts ? `${fts.clause} AND ` : "";
    return sqlite
      .prepare(
        `
        SELECT ${selectSql}
        FROM items i
        JOIN locations l ON l.id = i.location_id
        WHERE ${matchClause}${where}
        GROUP BY ${groupBy}
        ORDER BY c DESC, ${groupBy}
      `,
      )
      .all(...matchArgs, ...args) as Array<Record<string, unknown>>;
  }

  // kinds: omit kind filter
  const kindRows = run(
    { omitKind: true },
    "i.kind as kind, count(*) as c",
    "i.kind",
  );

  // locations: omit location filter
  const locRows = run(
    { omitLocation: true },
    "l.id as id, l.name as name, count(*) as c",
    "l.id",
  );

  // tags: counts of tags among matching items (omit tag filter)
  const { filters, args } = buildBaseFilters(params, { omitTag: true });
  const where = filters.join(" AND ");
  const matchArgs = fts ? [fts.match, fts.match] : [];
  const matchClause = fts ? `${fts.clause} AND ` : "";
  const tagRows = sqlite
    .prepare(
      `
      SELECT t.id as id, t.name as name, count(*) as c
      FROM items i
      JOIN locations l ON l.id = i.location_id
      JOIN item_tags it ON it.item_id = i.id
      JOIN tags t ON t.id = it.tag_id
      WHERE ${matchClause}${where}
      GROUP BY t.id
      ORDER BY c DESC, t.name
    `,
    )
    .all(...matchArgs, ...args) as Array<{
    id: number;
    name: string;
    c: number;
  }>;

  return {
    kinds: kindRows.map((r) => ({
      kind: String(r.kind),
      c: Number(r.c),
    })),
    locations: locRows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      c: Number(r.c),
    })),
    tags: tagRows.map((r) => ({
      id: r.id,
      name: r.name,
      c: r.c,
    })),
  };
}

export function getItemById(id: number): CatalogItemRow | null {
  const db = getDb();
  const row = db
    .select({
      id: items.id,
      locationId: items.locationId,
      locationName: locations.name,
      path: items.path,
      relPath: items.relPath,
      name: items.name,
      ext: items.ext,
      kind: items.kind,
      mime: items.mime,
      sizeBytes: items.sizeBytes,
      mtimeMs: items.mtimeMs,
      ctimeMs: items.ctimeMs,
      contentHash: items.contentHash,
      title: items.title,
      width: items.width,
      height: items.height,
      durationMs: items.durationMs,
      indexedAt: items.indexedAt,
      isMissing: items.isMissing,
    })
    .from(items)
    .innerJoin(locations, eq(items.locationId, locations.id))
    .where(eq(items.id, id))
    .get();

  return row ? mapRow(row) : null;
}

/** Extracted body sample used for FTS (text, code, PDF). */
export function getItemText(itemId: number): {
  body: string;
  extractedAt: number;
} | null {
  const db = getDb();
  const row = db
    .select({
      body: itemText.body,
      extractedAt: itemText.extractedAt,
    })
    .from(itemText)
    .where(eq(itemText.itemId, itemId))
    .get();
  return row ?? null;
}

export function listLocationsWithCounts() {
  const db = getDb();
  return db
    .select({
      id: locations.id,
      name: locations.name,
      rootPath: locations.rootPath,
      enabled: locations.enabled,
      createdAt: locations.createdAt,
      itemCount: sql<number>`(
        SELECT count(*) FROM items
        WHERE items.location_id = ${locations.id} AND items.is_missing = 0
      )`.as("itemCount"),
    })
    .from(locations)
    .orderBy(asc(locations.name))
    .all();
}

export function catalogStats() {
  const db = getDb();
  const enabledJoin = and(eq(items.isMissing, 0), eq(locations.enabled, 1));

  const total =
    db
      .select({ c: count() })
      .from(items)
      .innerJoin(locations, eq(items.locationId, locations.id))
      .where(enabledJoin)
      .get()?.c ?? 0;

  const byKind = db
    .select({
      kind: items.kind,
      c: count(),
    })
    .from(items)
    .innerJoin(locations, eq(items.locationId, locations.id))
    .where(enabledJoin)
    .groupBy(items.kind)
    .all();

  const locationCount =
    db
      .select({ c: count() })
      .from(locations)
      .where(eq(locations.enabled, 1))
      .get()?.c ?? 0;

  const missing =
    db
      .select({ c: count() })
      .from(items)
      .innerJoin(locations, eq(items.locationId, locations.id))
      .where(and(eq(items.isMissing, 1), eq(locations.enabled, 1)))
      .get()?.c ?? 0;

  return { total, byKind, locationCount, missing };
}

export function recentItems(limit = 8): CatalogItemRow[] {
  const result = searchCatalog({ page: 1, pageSize: limit, sort: "indexed" });
  return result.items;
}
