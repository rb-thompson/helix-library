import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import {
  collectionItems,
  collections,
  itemTags,
  items,
  locations,
  tags,
} from "@/lib/db/schema";
import {
  type TagSource,
  upsertItemTag,
} from "@/lib/tags/source";
import type { CatalogItemRow, ItemKind } from "@/lib/types";

function mapItem(row: {
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
  return { ...row, kind: row.kind as ItemKind };
}

const itemSelect = {
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
};

export function listCollections() {
  const db = getDb();
  return db
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      createdAt: collections.createdAt,
      itemCount: sql<number>`(
        SELECT count(*) FROM collection_items
        WHERE collection_items.collection_id = ${collections.id}
      )`.as("itemCount"),
    })
    .from(collections)
    .orderBy(asc(collections.name))
    .all();
}

export function getCollection(id: number) {
  const db = getDb();
  return db.select().from(collections).where(eq(collections.id, id)).get() ?? null;
}

/**
 * Title-case shelf names for consistent desk presentation.
 * Preserves short ALL-CAPS tokens (STEM, PDF).
 */
export function formatCollectionName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (w.length >= 2 && w.length <= 5 && w === w.toUpperCase() && /[A-Z]/.test(w)) {
        return w;
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function createCollection(name: string, description?: string): number {
  const n = formatCollectionName(name);
  if (!n) throw new Error("Collection name is required");
  const db = getDb();
  const existing = db
    .select()
    .from(collections)
    .where(eq(collections.name, n))
    .get();
  if (existing) throw new Error(`Collection already exists: ${n}`);

  const result = db
    .insert(collections)
    .values({
      name: n,
      description: description?.trim() || null,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export function updateCollection(
  id: number,
  input: { name?: string; description?: string | null },
): void {
  const db = getDb();
  const row = db.select().from(collections).where(eq(collections.id, id)).get();
  if (!row) throw new Error("Collection not found");

  const patch: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const n = formatCollectionName(input.name);
    if (!n) throw new Error("Collection name is required");
    const clash = db
      .select()
      .from(collections)
      .where(eq(collections.name, n))
      .get();
    if (clash && clash.id !== id) {
      throw new Error(`Collection already exists: ${n}`);
    }
    patch.name = n;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (Object.keys(patch).length === 0) return;
  db.update(collections).set(patch).where(eq(collections.id, id)).run();
}

export function deleteCollection(id: number): void {
  const db = getDb();
  db.delete(collections).where(eq(collections.id, id)).run();
}

export function listCollectionItems(collectionId: number): CatalogItemRow[] {
  const db = getDb();
  const rows = db
    .select(itemSelect)
    .from(collectionItems)
    .innerJoin(items, eq(collectionItems.itemId, items.id))
    .innerJoin(locations, eq(items.locationId, locations.id))
    .where(eq(collectionItems.collectionId, collectionId))
    .orderBy(desc(collectionItems.addedAt))
    .all();
  return rows.map(mapItem);
}

export function addItemToCollection(collectionId: number, itemId: number): void {
  const db = getDb();
  const col = db
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .get();
  if (!col) throw new Error("Collection not found");
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item) throw new Error("Item not found");

  db.insert(collectionItems)
    .values({ collectionId, itemId })
    .onConflictDoNothing()
    .run();
}

/** Bulk-add items to a collection. Returns how many new links were created. */
export function addItemsToCollection(
  collectionId: number,
  itemIds: number[],
): { added: number; skipped: number } {
  const db = getDb();
  const col = db
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .get();
  if (!col) throw new Error("Collection not found");

  let added = 0;
  let skipped = 0;
  const unique = [...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0))];
  for (const itemId of unique) {
    const item = db.select().from(items).where(eq(items.id, itemId)).get();
    if (!item) {
      skipped += 1;
      continue;
    }
    const existing = db
      .select()
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.collectionId, collectionId),
          eq(collectionItems.itemId, itemId),
        ),
      )
      .get();
    if (existing) {
      skipped += 1;
      continue;
    }
    db.insert(collectionItems)
      .values({ collectionId, itemId })
      .run();
    added += 1;
  }
  return { added, skipped };
}

/** Bulk-apply a tag to items. */
export function addTagToItems(
  itemIds: number[],
  tagName: string,
  source: TagSource = "manual",
): { tagged: number; skipped: number } {
  const tagId = getOrCreateTag(tagName);
  const db = getDb();
  let tagged = 0;
  let skipped = 0;
  const unique = [...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0))];
  for (const itemId of unique) {
    const item = db.select().from(items).where(eq(items.id, itemId)).get();
    if (!item) {
      skipped += 1;
      continue;
    }
    const existing = db
      .select()
      .from(itemTags)
      .where(and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, tagId)))
      .get();
    if (existing) {
      // Still allow source upgrade
      upsertItemTag(itemId, tagId, source);
      skipped += 1;
      continue;
    }
    upsertItemTag(itemId, tagId, source);
    tagged += 1;
  }
  return { tagged, skipped };
}

export function removeItemFromCollection(
  collectionId: number,
  itemId: number,
): void {
  const db = getDb();
  db.delete(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.itemId, itemId),
      ),
    )
    .run();
}

export function getItemCollections(itemId: number) {
  const db = getDb();
  return db
    .select({
      id: collections.id,
      name: collections.name,
    })
    .from(collectionItems)
    .innerJoin(collections, eq(collectionItems.collectionId, collections.id))
    .where(eq(collectionItems.itemId, itemId))
    .orderBy(asc(collections.name))
    .all();
}

// --- Tags ---

export type ListedTag = {
  id: number;
  name: string;
  createdAt: number;
  itemCount: number;
  /** Distinct sources on this tag's applications */
  sources: TagSource[];
  hasVision: boolean;
  hasAcquire: boolean;
  /** Facet/graph hide flag (tags.hidden) */
  hidden: boolean;
};

export function listTags(opts?: {
  /** Prefer popular tags first (for dense vision-tag libraries). */
  sortBy?: "name" | "count";
  /** Only tags used on at least this many items. */
  minCount?: number;
  limit?: number;
}): ListedTag[] {
  const db = getDb();
  const sortBy = opts?.sortBy ?? "name";
  const minCount = opts?.minCount ?? 0;
  const limit = opts?.limit;

  const sqlite = getSqlite();
  // Use raw SQL so we tolerate missing hidden column only during mid-migrate races
  const rows = sqlite
    .prepare(
      `
    SELECT
      t.id AS id,
      t.name AS name,
      t.created_at AS createdAt,
      coalesce(t.hidden, 0) AS hidden,
      (SELECT count(*) FROM item_tags it WHERE it.tag_id = t.id) AS itemCount
    FROM tags t
    ORDER BY t.name COLLATE NOCASE ASC
  `,
    )
    .all() as Array<{
    id: number;
    name: string;
    createdAt: number;
    hidden: number;
    itemCount: number;
  }>;

  const sourceRows = sqlite
    .prepare(
      `
    SELECT tag_id AS tagId, source
    FROM item_tags
    GROUP BY tag_id, source
  `,
    )
    .all() as Array<{ tagId: number; source: string }>;
  const byTag = new Map<number, Set<TagSource>>();
  for (const r of sourceRows) {
    const src = r.source as TagSource;
    if (!byTag.has(r.tagId)) byTag.set(r.tagId, new Set());
    if (
      src === "manual" ||
      src === "vision" ||
      src === "exif" ||
      src === "acquire"
    ) {
      byTag.get(r.tagId)!.add(src);
    }
  }

  let out: ListedTag[] = rows.map((r) => {
    const sources = [...(byTag.get(r.id) ?? [])];
    return {
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      itemCount: Number(r.itemCount),
      sources,
      hasVision: sources.includes("vision"),
      hasAcquire: sources.includes("acquire"),
      hidden: Boolean(r.hidden),
    };
  });

  if (minCount > 0) {
    out = out.filter((r) => r.itemCount >= minCount);
  }
  if (sortBy === "count") {
    out = [...out].sort((a, b) => {
      const d = b.itemCount - a.itemCount;
      if (d !== 0) return d;
      return a.name.localeCompare(b.name);
    });
  }
  if (limit != null && limit > 0) {
    out = out.slice(0, limit);
  }
  return out;
}

export function getOrCreateTag(name: string): number {
  const n = name.trim().toLowerCase();
  if (!n) throw new Error("Tag name is required");
  if (n.length > 48) throw new Error("Tag name too long");

  const db = getDb();
  const existing = db.select().from(tags).where(eq(tags.name, n)).get();
  if (existing) return existing.id;

  const result = db.insert(tags).values({ name: n }).run();
  return Number(result.lastInsertRowid);
}

export function getItemTags(itemId: number) {
  const db = getDb();
  return db
    .select({ id: tags.id, name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(itemTags.tagId, tags.id))
    .where(eq(itemTags.itemId, itemId))
    .orderBy(asc(tags.name))
    .all();
}

export function addTagToItem(
  itemId: number,
  tagName: string,
  source: TagSource = "manual",
): void {
  const db = getDb();
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item) throw new Error("Item not found");
  const tagId = getOrCreateTag(tagName);
  upsertItemTag(itemId, tagId, source);
}

/**
 * Merge source tags into a target (by id or new/existing name).
 * Re-links item_tags then deletes source tag rows. Never touches files.
 */
export function mergeTags(opts: {
  sourceTagIds: number[];
  targetTagId?: number;
  targetName?: string;
}): { targetId: number; moved: number; deletedSources: number } {
  const sourceIds = [
    ...new Set(
      opts.sourceTagIds.map(Number).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (!sourceIds.length) throw new Error("sourceTagIds required");
  if (sourceIds.length > 50) throw new Error("At most 50 source tags per merge");

  const db = getDb();
  let targetId = opts.targetTagId;
  if (targetId != null) {
    const t = db.select().from(tags).where(eq(tags.id, targetId)).get();
    if (!t) throw new Error("Target tag not found");
  } else if (opts.targetName?.trim()) {
    targetId = getOrCreateTag(opts.targetName);
  } else {
    throw new Error("targetTagId or targetName required");
  }

  const sources = sourceIds.filter((id) => id !== targetId);
  if (!sources.length) {
    return { targetId: targetId!, moved: 0, deletedSources: 0 };
  }

  const sqlite = getSqlite();
  let moved = 0;
  const tx = sqlite.transaction(() => {
    for (const sid of sources) {
      const links = sqlite
        .prepare(
          `SELECT item_id AS itemId, source FROM item_tags WHERE tag_id = ?`,
        )
        .all(sid) as Array<{ itemId: number; source: string }>;
      for (const link of links) {
        const src =
          link.source === "manual" ||
          link.source === "vision" ||
          link.source === "exif" ||
          link.source === "acquire"
            ? link.source
            : "manual";
        upsertItemTag(link.itemId, targetId!, src);
        moved += 1;
      }
      sqlite.prepare(`DELETE FROM tags WHERE id = ?`).run(sid);
    }
  });
  tx();

  return {
    targetId: targetId!,
    moved,
    deletedSources: sources.length,
  };
}

/**
 * Rename a tag. If the name exists and mergeIfExists, merge into existing.
 */
/** Hide/show a tag on facets and the knowledge graph (does not delete). */
export function setTagHidden(
  tagId: number,
  hidden: boolean,
): { id: number; hidden: boolean } {
  const db = getDb();
  const row = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!row) throw new Error("Tag not found");
  db.update(tags)
    .set({ hidden: hidden ? 1 : 0 })
    .where(eq(tags.id, tagId))
    .run();
  return { id: tagId, hidden };
}

export function renameTag(
  tagId: number,
  newName: string,
  opts?: { mergeIfExists?: boolean },
): { id: number; merged: boolean } {
  const n = newName.trim().toLowerCase();
  if (!n) throw new Error("Tag name is required");
  if (n.length > 48) throw new Error("Tag name too long");

  const db = getDb();
  const row = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!row) throw new Error("Tag not found");
  if (row.name === n) return { id: tagId, merged: false };

  const clash = db.select().from(tags).where(eq(tags.name, n)).get();
  if (clash) {
    if (!opts?.mergeIfExists) {
      throw new Error(`Tag “${n}” already exists`);
    }
    const result = mergeTags({
      sourceTagIds: [tagId],
      targetTagId: clash.id,
    });
    return { id: result.targetId, merged: true };
  }

  db.update(tags).set({ name: n }).where(eq(tags.id, tagId)).run();
  return { id: tagId, merged: false };
}

export function removeTagFromItem(itemId: number, tagId: number): void {
  const db = getDb();
  db.delete(itemTags)
    .where(and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, tagId)))
    .run();
}

export function deleteTag(tagId: number): void {
  const db = getDb();
  const row = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!row) throw new Error("Tag not found");
  db.delete(tags).where(eq(tags.id, tagId)).run();
}

/** Delete many tags by id (cascade item_tags). Returns how many removed. */
export function deleteTags(tagIds: number[]): { deleted: number } {
  const ids = [
    ...new Set(
      tagIds.map(Number).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (!ids.length) return { deleted: 0 };
  const db = getDb();
  let deleted = 0;
  for (const id of ids) {
    const row = db.select().from(tags).where(eq(tags.id, id)).get();
    if (!row) continue;
    db.delete(tags).where(eq(tags.id, id)).run();
    deleted += 1;
  }
  return { deleted };
}

export function collectionCount(): number {
  const db = getDb();
  return db.select({ c: count() }).from(collections).get()?.c ?? 0;
}
