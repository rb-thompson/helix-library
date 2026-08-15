import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { buildSearchSnippet } from "@/lib/catalog/snippet";
import { getDb, getSqlite } from "@/lib/db/client";
import { isHiddenFacetTag } from "@/lib/tags/hidden";
import {
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
  titleSource?: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  indexedAt: number;
  isMissing: number;
}): CatalogItemRow {
  return {
    ...row,
    kind: row.kind as ItemKind,
    titleSource: row.titleSource ?? "filename",
  };
}

const ITEM_SELECT = `
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
          coalesce(i.title_source, 'filename') as titleSource,
          i.width as width,
          i.height as height,
          i.duration_ms as durationMs,
          i.indexed_at as indexedAt,
          i.is_missing as isMissing
`;

/**
 * Hard cap for smart-shelf id expansion (catalog/graph filters).
 * Public searchCatalog pageSize remains ≤100.
 */
export const SMART_ID_HARD_CAP = 2000;

function itemIdsForFilters(params: CatalogSearchParams): number[] | null {
  const db = getDb();
  let ids: number[] | null = null;

  if (params.collectionId) {
    // Lazy import avoids circular init: manage → searchCatalogItemIds → manage
    const { resolveCollectionItemIds } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/lib/collections/manage") as typeof import("@/lib/collections/manage");
    const resolved = resolveCollectionItemIds(Number(params.collectionId));
    ids = resolved.ids;
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
  if (params.missingOnly) {
    filters.push("i.is_missing = 1");
  } else if (!(params.includeMissing ?? false)) {
    filters.push("i.is_missing = 0");
  }

  if (params.untaggedOnly) {
    filters.push(
      "NOT EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id)",
    );
  }

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

/** Drop filler so "images of Finn or Phoebe" → finn, phoebe */
const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "do",
  "does",
  "for",
  "from",
  "have",
  "i",
  "in",
  "is",
  "me",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "where",
  "what",
  "which",
  "show",
  "find",
  "list",
  "get",
  "there",
  "files",
  "file",
  "images",
  "image",
  "photos",
  "photo",
  "pictures",
  "picture",
  "docs",
  "documents",
  "holdings",
  "holding",
  "catalog",
]);

/**
 * Meaningful search tokens from a free-text query.
 * Splits on whitespace and explicit OR/| so compound names can hit via LIKE.
 */
export function searchTokens(q: string): string[] {
  const raw = q
    .replace(/["']/g, " ")
    .replace(/\bOR\b/gi, " ")
    .replace(/\|/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^\w.+-]/g, "").toLowerCase())
    .filter((t) => t.length >= 2 && !SEARCH_STOPWORDS.has(t));
  return [...new Set(raw)];
}

/**
 * Hybrid match: FTS prefix OR (any token) + substring on name/path/title.
 * Fixes compound filenames like finnandphoebe.jpeg matching "phoebe".
 */
function textMatchSql(tokens: string[]): {
  clause: string;
  args: unknown[];
} | null {
  if (!tokens.length) return null;

  // FTS: OR so "finn phoebe" can hit either prefix
  const ftsMatch = tokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");

  // Substring: %phoebe% inside finnandphoebe.jpeg
  const likeParts: string[] = [];
  const likeArgs: unknown[] = [];
  for (const t of tokens) {
    const pat = `%${t}%`;
    likeParts.push(
      `(i.name LIKE ? COLLATE NOCASE OR i.rel_path LIKE ? COLLATE NOCASE OR i.title LIKE ? COLLATE NOCASE)`,
    );
    likeArgs.push(pat, pat, pat);
  }

  const clause = `(
      i.id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)
      OR i.id IN (SELECT rowid FROM item_body_fts WHERE item_body_fts MATCH ?)
      OR (${likeParts.join(" OR ")})
    )`;

  return {
    clause,
    args: [ftsMatch, ftsMatch, ...likeArgs],
  };
}

/**
 * Internal id-only expand for smart shelves (and similar trusted callers).
 * Reuses the same WHERE builders as searchCatalog but LIMIT hardCap (≤2000).
 * Do **not** call with outer collectionId when expanding a smart query
 * (avoids recursive resolve).
 *
 * Not a public HTTP/catalog page API — keep public pageSize ≤ 100.
 */
export function searchCatalogItemIds(
  params: CatalogSearchParams,
  opts: { hardCap: number },
): { ids: number[]; total: number; truncated: boolean } {
  const hardCap = Math.min(
    SMART_ID_HARD_CAP,
    Math.max(1, Math.floor(opts.hardCap) || SMART_ID_HARD_CAP),
  );
  // Never re-enter collection membership via the outer shelf id
  const safeParams: CatalogSearchParams = {
    ...params,
    collectionId: "",
    page: 1,
    pageSize: hardCap,
  };

  const q = safeParams.q?.trim() ?? "";
  const sort: CatalogSort = safeParams.sort ?? "mtime";
  const sortDir: CatalogSortDir =
    safeParams.sortDir ?? (sort === "name" ? "asc" : "desc");

  const filterIds = itemIdsForFilters(safeParams);
  if (filterIds && filterIds.length === 0) {
    return { ids: [], total: 0, truncated: false };
  }

  const sqlite = getSqlite();
  const { filters, args } = buildBaseFilters(safeParams);
  const where = filters.join(" AND ");
  const order = orderSql(sort, sortDir);

  if (q) {
    const tokens = searchTokens(q);
    const textMatch = textMatchSql(tokens);
    if (!textMatch) {
      return { ids: [], total: 0, truncated: false };
    }
    const matchArgs = textMatch.args;
    const matchClause = textMatch.clause;

    const totalRow = sqlite
      .prepare(
        `
        SELECT count(*) as c
        FROM items i
        JOIN locations l ON l.id = i.location_id
        WHERE ${matchClause} AND ${where}
      `,
      )
      .get(...matchArgs, ...args) as { c: number };

    const rows = sqlite
      .prepare(
        `
        SELECT i.id as id
        FROM items i
        JOIN locations l ON l.id = i.location_id
        WHERE ${matchClause} AND ${where}
        ORDER BY ${order}
        LIMIT ?
      `,
      )
      .all(...matchArgs, ...args, hardCap) as Array<{ id: number }>;

    const ids = rows.map((r) => r.id);
    const total = totalRow?.c ?? 0;
    return { ids, total, truncated: total > ids.length };
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
      SELECT i.id as id
      FROM items i
      JOIN locations l ON l.id = i.location_id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ?
    `,
    )
    .all(...args, hardCap) as Array<{ id: number }>;

  const ids = rows.map((r) => r.id);
  const total = totalRow?.c ?? 0;
  return { ids, total, truncated: total > ids.length };
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
    const tokens = searchTokens(q);
    const textMatch = textMatchSql(tokens);
    if (!textMatch) {
      return { items: [], total: 0, page, pageSize, sort, sortDir };
    }

    const matchArgs = textMatch.args;
    const matchClause = textMatch.clause;

    const totalRow = sqlite
      .prepare(
        `
        SELECT count(*) as c
        FROM items i
        JOIN locations l ON l.id = i.location_id
        WHERE ${matchClause} AND ${where}
      `,
      )
      .get(...matchArgs, ...args) as { c: number };

    const rows = sqlite
      .prepare(
        `
        SELECT
          ${ITEM_SELECT}
        FROM items i
        JOIN locations l ON l.id = i.location_id
        WHERE ${matchClause} AND ${where}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `,
      )
      .all(...matchArgs, ...args, pageSize, offset) as Array<
      Parameters<typeof mapRow>[0]
    >;

    const mapped = rows.map(mapRow);
    return {
      items: attachSearchSnippets(mapped, tokens),
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
        ${ITEM_SELECT}
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

/** Attach plain-text snippets for search hits (name/path/body). */
function attachSearchSnippets(
  rows: CatalogItemRow[],
  tokens: string[],
): CatalogItemRow[] {
  if (!rows.length || !tokens.length) return rows;
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const bodies = db
    .select({ itemId: itemText.itemId, body: itemText.body })
    .from(itemText)
    .where(inArray(itemText.itemId, ids))
    .all();
  const bodyById = new Map(bodies.map((b) => [b.itemId, b.body]));

  return rows.map((row) => {
    const snip = buildSearchSnippet(tokens, {
      name: row.name,
      title: row.title,
      relPath: row.relPath,
      body: bodyById.get(row.id) ?? null,
    });
    if (!snip) return row;
    return {
      ...row,
      snippet: snip.snippet,
      matchField: snip.matchField,
    };
  });
}

/**
 * Facet counts for the current query, omitting the facet dimension itself
 * so users can pivot (e.g. kind counts ignore selected kind).
 */
export function catalogFacets(params: CatalogSearchParams = {}): CatalogFacets {
  const sqlite = getSqlite();
  const q = params.q?.trim() ?? "";
  const textMatch = q ? textMatchSql(searchTokens(q)) : null;

  function run(
    omit: { omitKind?: boolean; omitLocation?: boolean; omitTag?: boolean },
    selectSql: string,
    groupBy: string,
  ): Array<Record<string, unknown>> {
    const { filters, args } = buildBaseFilters(params, omit);
    const where = filters.join(" AND ");
    const matchArgs = textMatch ? textMatch.args : [];
    const matchClause = textMatch ? `${textMatch.clause} AND ` : "";
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
  const matchArgs = textMatch ? textMatch.args : [];
  const matchClause = textMatch ? `${textMatch.clause} AND ` : "";
  const tagRows = sqlite
    .prepare(
      `
      SELECT t.id as id, t.name as name, coalesce(t.hidden, 0) as hidden, count(*) as c
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
    hidden: number;
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
    tags: tagRows
      .filter((r) => !isHiddenFacetTag(r.name, { hidden: r.hidden }))
      .map((r) => ({
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
      titleSource: items.titleSource,
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

export type TitleSource =
  | "filename"
  | "arxiv"
  | "manual"
  | "yt-dlp"
  | "pdf"
  | "openalex"
  | "clip"
  | "grokipedia";

/** Set catalog display title without renaming on-disk basename. */
export function setItemCatalogTitle(
  itemId: number,
  title: string,
  titleSource: TitleSource,
): void {
  const t = title.trim();
  if (!t) return;
  const db = getDb();
  db.update(items)
    .set({ title: t.slice(0, 500), titleSource })
    .where(eq(items.id, itemId))
    .run();
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
