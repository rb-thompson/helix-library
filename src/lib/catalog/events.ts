/**
 * Server open events (Discovery PR6).
 * Dual-write with client helix-open-history — do not remove localStorage.
 */

import { getSqlite } from "@/lib/db/client";
import { getItemById } from "@/lib/catalog/query";
import { displayTitle } from "@/lib/catalog/display";
import {
  RECENT_OPENS_CAP,
  type RecentOpen,
} from "@/lib/catalog/open-merge";

export const ITEM_EVENT_OPEN = "open" as const;
export const ITEM_EVENT_KINDS = [ITEM_EVENT_OPEN] as const;
export type ItemEventKind = (typeof ITEM_EVENT_KINDS)[number];

export const OPEN_DEDUPE_MS = 60_000;
export const ITEM_EVENTS_RETAIN = 500;

export function isItemEventKind(value: unknown): value is ItemEventKind {
  return value === ITEM_EVENT_OPEN;
}

export type RecordItemEventResult =
  | { status: "not_found" }
  | { status: "ignored" }
  | { status: "recorded"; id: number };

export function recordItemEvent(
  itemId: number,
  kind: ItemEventKind,
  meta?: { source?: "detail" | "room" },
  now = Date.now(),
): RecordItemEventResult {
  if (!Number.isFinite(itemId) || itemId <= 0) return { status: "not_found" };
  const item = getItemById(itemId);
  if (!item) return { status: "not_found" };

  const sqlite = getSqlite();
  const record = sqlite.transaction(() => {
    const last = sqlite
      .prepare(
        `SELECT at FROM item_events
         WHERE item_id = ? AND kind = ?
         ORDER BY at DESC
         LIMIT 1`,
      )
      .get(itemId, kind) as { at: number } | undefined;
    if (last && now - last.at < OPEN_DEDUPE_MS) {
      return { status: "ignored" } as const;
    }

    const metaJson = meta?.source
      ? JSON.stringify({ source: meta.source })
      : null;
    const info = sqlite
      .prepare(
        `INSERT INTO item_events (item_id, kind, at, meta_json) VALUES (?, ?, ?, ?)`,
      )
      .run(itemId, kind, now, metaJson);

    sqlite
      .prepare(
        `DELETE FROM item_events
         WHERE id NOT IN (
           SELECT id FROM item_events ORDER BY at DESC LIMIT ?
         )`,
      )
      .run(ITEM_EVENTS_RETAIN);

    return { status: "recorded", id: Number(info.lastInsertRowid) } as const;
  });

  return record();
}

export function listRecentOpens(limit = RECENT_OPENS_CAP): RecentOpen[] {
  const cap = Math.max(1, Math.min(limit, RECENT_OPENS_CAP));
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      `SELECT e.item_id AS id,
              i.name AS name,
              i.kind AS kind,
              i.title AS title,
              i.title_source AS titleSource,
              MAX(e.at) AS openedAt
       FROM item_events e
       JOIN items i ON i.id = e.item_id
       WHERE e.kind = ?
       GROUP BY e.item_id
       ORDER BY openedAt DESC
       LIMIT ?`,
    )
    .all(ITEM_EVENT_OPEN, cap) as Array<{
    id: number;
    name: string;
    kind: string;
    title: string;
    titleSource: string;
    openedAt: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: displayTitle({
      name: row.name,
      title: row.title,
      titleSource: row.titleSource,
    }),
    kind: row.kind,
    openedAt: row.openedAt,
  }));
}

export function countItemEvents(): number {
  const row = getSqlite()
    .prepare(`SELECT count(*) AS c FROM item_events`)
    .get() as { c: number };
  return row.c;
}
