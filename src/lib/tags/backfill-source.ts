/**
 * One-shot / re-runnable heuristic backfill for item_tags.source.
 * Only upgrades rows still at source='manual'. Imperfect is OK.
 */

import type Database from "better-sqlite3";

/** Source-label tags applied by Acquire (see auto-tags.ts). */
export const ACQUIRE_TAG_NAMES = [
  "acquired",
  "youtube",
  "arxiv",
  "grok-image",
  "openalex",
  "clip",
  "grokipedia",
  "image-url",
] as const;

const ACQUIRE_TAG_IN_LIST = ACQUIRE_TAG_NAMES.map((n) => `'${n}'`).join(", ");

export function backfillItemTagSources(sqlite: Database.Database): {
  vision: number;
  acquire: number;
  leftManual: number;
} {
  // 1) Acquire labels
  const acq = sqlite
    .prepare(
      `
    UPDATE item_tags
    SET source = 'acquire'
    WHERE source = 'manual'
      AND tag_id IN (
        SELECT id FROM tags WHERE name IN (${ACQUIRE_TAG_IN_LIST})
      )
  `,
    )
    .run();

  // 2) Labels on items that carry vision-tagged → vision (do not demote acquire)
  const vis = sqlite
    .prepare(
      `
    UPDATE item_tags
    SET source = 'vision'
    WHERE source = 'manual'
      AND item_id IN (
        SELECT it.item_id
        FROM item_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE t.name = 'vision-tagged'
      )
      AND tag_id NOT IN (
        SELECT id FROM tags WHERE name IN ('acquired', 'youtube', 'arxiv', 'grok-image')
      )
  `,
    )
    .run();

  const left = sqlite
    .prepare(
      `SELECT count(*) AS c FROM item_tags WHERE source = 'manual'`,
    )
    .get() as { c: number };

  return {
    vision: Number(vis.changes ?? 0),
    acquire: Number(acq.changes ?? 0),
    leftManual: Number(left?.c ?? 0),
  };
}
