import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  collectionItems,
  collections,
  itemTags,
  items,
  locations,
  tags,
} from "@/lib/db/schema";
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
      skipped += 1;
      continue;
    }
    db.insert(itemTags).values({ tagId, itemId }).run();
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

export function listTags(opts?: {
  /** Prefer popular tags first (for dense vision-tag libraries). */
  sortBy?: "name" | "count";
  /** Only tags used on at least this many items. */
  minCount?: number;
  limit?: number;
}) {
  const db = getDb();
  const sortBy = opts?.sortBy ?? "name";
  const minCount = opts?.minCount ?? 0;
  const limit = opts?.limit;

  let rows = db
    .select({
      id: tags.id,
      name: tags.name,
      createdAt: tags.createdAt,
      itemCount: sql<number>`(
        SELECT count(*) FROM item_tags WHERE item_tags.tag_id = ${tags.id}
      )`.as("itemCount"),
    })
    .from(tags)
    .orderBy(asc(tags.name))
    .all();

  if (minCount > 0) {
    rows = rows.filter((r) => Number(r.itemCount) >= minCount);
  }
  if (sortBy === "count") {
    rows = [...rows].sort((a, b) => {
      const d = Number(b.itemCount) - Number(a.itemCount);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name);
    });
  }
  if (limit != null && limit > 0) {
    rows = rows.slice(0, limit);
  }
  return rows;
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

export function addTagToItem(itemId: number, tagName: string): void {
  const db = getDb();
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item) throw new Error("Item not found");
  const tagId = getOrCreateTag(tagName);
  db.insert(itemTags)
    .values({ tagId, itemId })
    .onConflictDoNothing()
    .run();
}

export function removeTagFromItem(itemId: number, tagId: number): void {
  const db = getDb();
  db.delete(itemTags)
    .where(and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, tagId)))
    .run();
}

export function deleteTag(tagId: number): void {
  const db = getDb();
  db.delete(tags).where(eq(tags.id, tagId)).run();
}

export function collectionCount(): number {
  const db = getDb();
  return db.select({ c: count() }).from(collections).get()?.c ?? 0;
}
