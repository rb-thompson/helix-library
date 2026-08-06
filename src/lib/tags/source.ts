/**
 * Tag application provenance.
 *
 * Invariant: do not raw-INSERT into item_tags outside upsertItemTag
 * (or the approved vision Python path that sets source='vision').
 */

import { getSqlite } from "@/lib/db/client";

export type TagSource = "manual" | "vision" | "exif" | "acquire";

/** Higher rank wins on re-apply. manual > acquire > exif > vision */
export const SOURCE_RANK: Record<TagSource, number> = {
  manual: 40,
  acquire: 30,
  exif: 20,
  vision: 10,
};

export const TAG_SOURCES = [
  "manual",
  "vision",
  "exif",
  "acquire",
] as const satisfies readonly TagSource[];

export function isTagSource(v: string): v is TagSource {
  return (TAG_SOURCES as readonly string[]).includes(v);
}

export function isBetterSource(next: TagSource, current: TagSource): boolean {
  return SOURCE_RANK[next] > SOURCE_RANK[current];
}

/**
 * Insert item_tags or upgrade source if better. Never demotes.
 */
export function upsertItemTag(
  itemId: number,
  tagId: number,
  source: TagSource,
): void {
  const sqlite = getSqlite();
  const existing = sqlite
    .prepare(
      `SELECT source FROM item_tags WHERE tag_id = ? AND item_id = ?`,
    )
    .get(tagId, itemId) as { source: string } | undefined;

  if (!existing) {
    sqlite
      .prepare(
        `INSERT INTO item_tags(tag_id, item_id, source) VALUES (?, ?, ?)`,
      )
      .run(tagId, itemId, source);
    return;
  }

  const current = isTagSource(existing.source) ? existing.source : "manual";
  if (isBetterSource(source, current)) {
    sqlite
      .prepare(
        `UPDATE item_tags SET source = ? WHERE tag_id = ? AND item_id = ?`,
      )
      .run(source, tagId, itemId);
  }
}
