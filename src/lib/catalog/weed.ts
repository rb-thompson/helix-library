import { inArray } from "drizzle-orm";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db/client";
import { items } from "@/lib/db/schema";

/**
 * Remove missing holdings from the catalog (DB rows only).
 * Never deletes files on disk — only rows with is_missing = 1.
 * Cascades: collection_items, item_tags, item_text (+ FTS triggers).
 */
export function purgeMissingItems(itemIds: number[]): {
  purged: number;
  skipped: number;
} {
  const ids = [
    ...new Set(
      itemIds.map(Number).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (ids.length === 0) return { purged: 0, skipped: 0 };

  const db = getDb();
  const rows = db
    .select({ id: items.id, isMissing: items.isMissing })
    .from(items)
    .where(inArray(items.id, ids))
    .all();

  const missingIds = rows.filter((r) => r.isMissing === 1).map((r) => r.id);
  const skipped = ids.length - missingIds.length;

  if (missingIds.length === 0) {
    return { purged: 0, skipped };
  }

  // Drop local thumbs if present (best-effort; not catalog-critical).
  for (const id of missingIds) {
    try {
      const thumb = path.join(process.cwd(), "data", "thumbs", `${id}.webp`);
      if (existsSync(thumb)) unlinkSync(thumb);
    } catch {
      // ignore thumb cleanup failures
    }
  }

  db.delete(items).where(inArray(items.id, missingIds)).run();

  return { purged: missingIds.length, skipped };
}
