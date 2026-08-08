import { getItemById } from "@/lib/catalog/query";
import { displayTitle } from "@/lib/catalog/display";
import { getSqlite } from "@/lib/db/client";
import { isHiddenFacetTag } from "@/lib/tags/hidden";
import type { ItemKind } from "@/lib/types";

export type RelatedItem = {
  id: number;
  name: string;
  kind: ItemKind;
  /** Prefer displayTitle(item) in UI */
  label: string;
  score: number;
  mtimeMs: number;
};

export type RelatedReason =
  | "same_directory"
  | "shared_tags"
  | "shared_collections";

export type RelatedGroup = {
  reason: RelatedReason;
  label: string;
  /** Optional catalog deep link (e.g. same folder → under=) */
  href?: string;
  items: RelatedItem[];
};

const REASON_PRIORITY: Record<RelatedReason, number> = {
  same_directory: 3,
  shared_tags: 2,
  shared_collections: 1,
};

type Cand = RelatedItem & { reason: RelatedReason };

type ItemRow = {
  id: number;
  name: string;
  kind: string;
  title: string;
  titleSource: string | null;
  mtimeMs: number;
  relPath: string;
};

function parentDir(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = normalized.lastIndexOf("/");
  if (i <= 0) return "";
  return normalized.slice(0, i);
}

function labelOf(row: {
  name: string;
  title: string;
  titleSource: string | null;
}): string {
  return displayTitle({
    name: row.name,
    title: row.title,
    titleSource: row.titleSource,
  });
}

function sortItems(a: RelatedItem, b: RelatedItem): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
  return b.id - a.id;
}

/**
 * Structural neighbors for a holding (no embeddings).
 * Dedupe: each item appears in at most one group (best score, then dir > tags > collections).
 */
export function getRelatedHoldings(
  itemId: number,
  opts?: { limitPerGroup?: number; limitTotal?: number },
): RelatedGroup[] {
  const limitPerGroup = Math.max(1, opts?.limitPerGroup ?? 8);
  const limitTotal = Math.max(1, opts?.limitTotal ?? 24);

  const seed = getItemById(itemId);
  if (!seed) return [];

  const sqlite = getSqlite();
  const cands: Cand[] = [];

  // ── 1. Same directory (direct siblings only) ──
  const parent = parentDir(seed.relPath);
  let siblingSql: string;
  const siblingParams: unknown[] = [seed.locationId, seed.id];
  if (parent === "") {
    // Root of location: no slash in rel_path
    siblingSql = `
      SELECT id, name, kind, title, title_source AS titleSource, mtime_ms AS mtimeMs, rel_path AS relPath
      FROM items
      WHERE location_id = ?
        AND id != ?
        AND is_missing = 0
        AND instr(rel_path, '/') = 0
    `;
  } else {
    siblingSql = `
      SELECT id, name, kind, title, title_source AS titleSource, mtime_ms AS mtimeMs, rel_path AS relPath
      FROM items
      WHERE location_id = ?
        AND id != ?
        AND is_missing = 0
        AND rel_path LIKE ? || '/%'
        AND instr(substr(rel_path, length(?) + 2), '/') = 0
    `;
    siblingParams.push(parent, parent);
  }

  const siblings = sqlite.prepare(siblingSql).all(...siblingParams) as ItemRow[];
  for (const row of siblings) {
    const sameKind = row.kind === seed.kind ? 5 : 0;
    cands.push({
      id: row.id,
      name: row.name,
      kind: row.kind as ItemKind,
      label: labelOf(row),
      score: 30 + sameKind,
      mtimeMs: row.mtimeMs,
      reason: "same_directory",
    });
  }

  // ── 2. Shared non-hidden tags (one row per other-item × shared tag) ──
  const tagRows = sqlite
    .prepare(
      `
      SELECT
        i.id,
        i.name,
        i.kind,
        i.title,
        i.title_source AS titleSource,
        i.mtime_ms AS mtimeMs,
        t.id AS tagId,
        t.name AS tagName,
        t.hidden AS tagHidden
      FROM item_tags me
      INNER JOIN item_tags other
        ON other.tag_id = me.tag_id AND other.item_id != me.item_id
      INNER JOIN tags t ON t.id = me.tag_id
      INNER JOIN items i ON i.id = other.item_id
      WHERE me.item_id = ?
        AND i.is_missing = 0
        AND COALESCE(t.hidden, 0) = 0
    `,
    )
    .all(itemId) as Array<
    ItemRow & { tagId: number; tagName: string; tagHidden: number }
  >;

  // Distinct shared tags per item; exclude built-in hidden facet names
  const tagScore = new Map<
    number,
    { row: ItemRow; tagIds: Set<number> }
  >();
  for (const r of tagRows) {
    if (isHiddenFacetTag(r.tagName, { hidden: r.tagHidden })) continue;
    let entry = tagScore.get(r.id);
    if (!entry) {
      entry = {
        row: {
          id: r.id,
          name: r.name,
          kind: r.kind,
          title: r.title,
          titleSource: r.titleSource,
          mtimeMs: r.mtimeMs,
          relPath: "",
        },
        tagIds: new Set(),
      };
      tagScore.set(r.id, entry);
    }
    entry.tagIds.add(r.tagId);
  }
  for (const { row, tagIds } of tagScore.values()) {
    const shared = tagIds.size;
    if (shared < 1) continue;
    cands.push({
      id: row.id,
      name: row.name,
      kind: row.kind as ItemKind,
      label: labelOf(row),
      score: 10 * shared,
      mtimeMs: row.mtimeMs,
      reason: "shared_tags",
    });
  }

  // ── 3. Shared collections (manual collection_items only) ──
  const collRows = sqlite
    .prepare(
      `
      SELECT
        i.id,
        i.name,
        i.kind,
        i.title,
        i.title_source AS titleSource,
        i.mtime_ms AS mtimeMs,
        c.id AS collectionId,
        c.name AS collectionName,
        COUNT(*) AS shared
      FROM collection_items me
      INNER JOIN collection_items other
        ON other.collection_id = me.collection_id
        AND other.item_id != me.item_id
      INNER JOIN collections c ON c.id = me.collection_id
      INNER JOIN items i ON i.id = other.item_id
      WHERE me.item_id = ?
        AND i.is_missing = 0
      GROUP BY i.id, c.id
    `,
    )
    .all(itemId) as Array<
    ItemRow & {
      collectionId: number;
      collectionName: string;
      shared: number;
    }
  >;

  const collScore = new Map<
    number,
    { row: ItemRow; shared: number; collectionNames: string[] }
  >();
  for (const r of collRows) {
    const prev = collScore.get(r.id);
    const add = Number(r.shared) || 1;
    if (!prev) {
      collScore.set(r.id, {
        row: {
          id: r.id,
          name: r.name,
          kind: r.kind,
          title: r.title,
          titleSource: r.titleSource,
          mtimeMs: r.mtimeMs,
          relPath: "",
        },
        shared: add,
        collectionNames: [r.collectionName],
      });
    } else {
      prev.shared += add;
      if (!prev.collectionNames.includes(r.collectionName)) {
        prev.collectionNames.push(r.collectionName);
      }
    }
  }
  for (const { row, shared } of collScore.values()) {
    cands.push({
      id: row.id,
      name: row.name,
      kind: row.kind as ItemKind,
      label: labelOf(row),
      score: 5 * shared,
      mtimeMs: row.mtimeMs,
      reason: "shared_collections",
    });
  }

  // ── Dedupe: best score wins; tie → dir > tags > collections ──
  const best = new Map<number, Cand>();
  for (const c of cands) {
    const prev = best.get(c.id);
    if (!prev) {
      best.set(c.id, c);
      continue;
    }
    if (c.score > prev.score) {
      best.set(c.id, c);
      continue;
    }
    if (
      c.score === prev.score &&
      REASON_PRIORITY[c.reason] > REASON_PRIORITY[prev.reason]
    ) {
      best.set(c.id, c);
    }
  }

  const byReason: Record<RelatedReason, RelatedItem[]> = {
    same_directory: [],
    shared_tags: [],
    shared_collections: [],
  };
  for (const c of best.values()) {
    byReason[c.reason].push({
      id: c.id,
      name: c.name,
      kind: c.kind,
      label: c.label,
      score: c.score,
      mtimeMs: c.mtimeMs,
    });
  }

  const groups: RelatedGroup[] = [];
  let remaining = limitTotal;

  const dirItems = byReason.same_directory.sort(sortItems).slice(0, limitPerGroup);
  if (dirItems.length && remaining > 0) {
    const take = dirItems.slice(0, remaining);
    remaining -= take.length;
    const underHref =
      parent === ""
        ? `/catalog?locationId=${seed.locationId}`
        : `/catalog?locationId=${seed.locationId}&under=${encodeURIComponent(parent)}`;
    groups.push({
      reason: "same_directory",
      label: parent ? `Same folder · ${parent}` : "Same folder",
      href: underHref,
      items: take,
    });
  }

  const tagItems = byReason.shared_tags.sort(sortItems).slice(0, limitPerGroup);
  if (tagItems.length && remaining > 0) {
    const take = tagItems.slice(0, remaining);
    remaining -= take.length;
    groups.push({
      reason: "shared_tags",
      label: "Shared tags",
      items: take,
    });
  }

  // Collection label: single shared shelf name if unique among seed's shelves co-members
  const collItems = byReason.shared_collections
    .sort(sortItems)
    .slice(0, limitPerGroup);
  if (collItems.length && remaining > 0) {
    const take = collItems.slice(0, remaining);
    const seedColls = sqlite
      .prepare(
        `
        SELECT c.name AS name
        FROM collection_items ci
        INNER JOIN collections c ON c.id = ci.collection_id
        WHERE ci.item_id = ?
        ORDER BY c.name
      `,
      )
      .all(itemId) as Array<{ name: string }>;
    const label =
      seedColls.length === 1
        ? `On shelf · ${seedColls[0]!.name}`
        : seedColls.length > 1
          ? "Shared shelves"
          : "Shared collections";
    groups.push({
      reason: "shared_collections",
      label,
      href:
        seedColls.length === 1
          ? undefined // collection detail needs id — look up
          : undefined,
      items: take,
    });

    // Attach collection href when single shelf
    if (seedColls.length === 1) {
      const col = sqlite
        .prepare(
          `SELECT c.id AS id FROM collection_items ci
           INNER JOIN collections c ON c.id = ci.collection_id
           WHERE ci.item_id = ? LIMIT 1`,
        )
        .get(itemId) as { id: number } | undefined;
      if (col) {
        groups[groups.length - 1]!.href = `/collections/${col.id}`;
      }
    }
  }

  return groups;
}

/** Parent directory of a rel_path (empty string = location root). Exported for tests. */
export function relatedParentDir(relPath: string): string {
  return parentDir(relPath);
}
