/**
 * Application tables copied live ← snapshot. DELETE is reverse order.
 * Keep in sync with migrate() user tables (see restore-copy registry test).
 */
export const RESTORE_TABLES = [
  "locations",
  "items",
  "item_text",
  "collections",
  "collection_items",
  "tags",
  "item_tags",
  "chat_threads",
  "chat_messages",
  "insights",
  "lens_analyses",
  "item_events",
  "jobs",
] as const;

export type RestoreTable = (typeof RESTORE_TABLES)[number];

/** Content-sync FTS — never copied; rebuilt after INSERT. */
export const RESTORE_FTS = ["items_fts", "item_body_fts"] as const;
