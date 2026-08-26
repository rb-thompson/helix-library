import type Database from "better-sqlite3";
import { backfillItemTagSources } from "@/lib/tags/backfill-source";

function tableHasColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return cols.some((c) => c.name === column);
}

/** Add a column when missing (CREATE TABLE IF NOT EXISTS does not alter legacy DBs). */
export function ensureColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  ddlSuffix: string,
): boolean {
  if (tableHasColumn(sqlite, table, column)) return false;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlSuffix}`);
  return true;
}

/**
 * Idempotent schema bootstrap for local SQLite.
 * FTS5 virtual tables keep search in sync with items / item_text.
 */
export function migrate(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      rel_path TEXT NOT NULL,
      name TEXT NOT NULL,
      ext TEXT,
      kind TEXT NOT NULL,
      mime TEXT,
      size_bytes INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      ctime_ms INTEGER NOT NULL,
      content_hash TEXT,
      title TEXT NOT NULL,
      title_source TEXT NOT NULL DEFAULT 'filename',
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      indexed_at INTEGER NOT NULL,
      is_missing INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS items_location_idx ON items(location_id);
    CREATE INDEX IF NOT EXISTS items_kind_idx ON items(kind);
    CREATE INDEX IF NOT EXISTS items_name_idx ON items(name);
    CREATE INDEX IF NOT EXISTS items_mtime_idx ON items(mtime_ms);

    CREATE TABLE IF NOT EXISTS item_text (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      extracted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      finished_at INTEGER,
      stats_json TEXT,
      error TEXT,
      dismissed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
      kind TEXT NOT NULL DEFAULT 'reindex',
      label TEXT,
      progress_json TEXT,
      result_json TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
      kind TEXT NOT NULL DEFAULT 'manual',
      query_json TEXT
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
      PRIMARY KEY (collection_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS collection_items_item_idx ON collection_items(item_id);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
      hidden INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS item_tags (
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'manual',
      PRIMARY KEY (tag_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS item_tags_item_idx ON item_tags(item_id);
    -- item_tags_source_idx is created after ensureColumn (legacy DBs lack source).

    CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'New conversation',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages(thread_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      name,
      rel_path,
      title,
      ext,
      content='items',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, name, rel_path, title, ext)
      VALUES (new.id, new.name, new.rel_path, new.title, coalesce(new.ext, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name, rel_path, title, ext)
      VALUES ('delete', old.id, old.name, old.rel_path, old.title, coalesce(old.ext, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name, rel_path, title, ext)
      VALUES ('delete', old.id, old.name, old.rel_path, old.title, coalesce(old.ext, ''));
      INSERT INTO items_fts(rowid, name, rel_path, title, ext)
      VALUES (new.id, new.name, new.rel_path, new.title, coalesce(new.ext, ''));
    END;

    CREATE VIRTUAL TABLE IF NOT EXISTS item_body_fts USING fts5(
      body,
      content='item_text',
      content_rowid='item_id'
    );

    CREATE TRIGGER IF NOT EXISTS item_text_ai AFTER INSERT ON item_text BEGIN
      INSERT INTO item_body_fts(rowid, body) VALUES (new.item_id, new.body);
    END;

    CREATE TRIGGER IF NOT EXISTS item_text_ad AFTER DELETE ON item_text BEGIN
      INSERT INTO item_body_fts(item_body_fts, rowid, body)
      VALUES ('delete', old.item_id, old.body);
    END;

    CREATE TRIGGER IF NOT EXISTS item_text_au AFTER UPDATE ON item_text BEGIN
      INSERT INTO item_body_fts(item_body_fts, rowid, body)
      VALUES ('delete', old.item_id, old.body);
      INSERT INTO item_body_fts(rowid, body) VALUES (new.item_id, new.body);
    END;
  `);

  // Existing DBs created before these columns only get them via ALTER.
  // Must run *before* any index/query that references the new columns.
  ensureColumn(
    sqlite,
    "items",
    "title_source",
    "TEXT NOT NULL DEFAULT 'filename'",
  );
  ensureColumn(
    sqlite,
    "item_tags",
    "source",
    "TEXT NOT NULL DEFAULT 'manual'",
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS item_tags_source_idx ON item_tags(source)`,
  );

  // Safe to re-run: only upgrades residual source='manual' rows.
  backfillItemTagSources(sqlite);

  // Unified jobs columns (PR3) — after CREATE so legacy DBs get ALTERs first.
  ensureColumn(sqlite, "jobs", "kind", "TEXT NOT NULL DEFAULT 'reindex'");
  ensureColumn(sqlite, "jobs", "label", "TEXT");
  ensureColumn(sqlite, "jobs", "progress_json", "TEXT");
  ensureColumn(sqlite, "jobs", "result_json", "TEXT");
  ensureColumn(
    sqlite,
    "jobs",
    "cancel_requested",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    sqlite,
    "jobs",
    "dismissed",
    "INTEGER NOT NULL DEFAULT 0",
  );
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS jobs_kind_status_idx ON jobs(kind, status);
    CREATE INDEX IF NOT EXISTS jobs_created_idx ON jobs(created_at);
  `);

  // PR7: user-hide tags from facets/graph
  ensureColumn(sqlite, "tags", "hidden", "INTEGER NOT NULL DEFAULT 0");
  // Seed known meta noise as hidden (idempotent)
  sqlite
    .prepare(
      `UPDATE tags SET hidden = 1 WHERE name = 'vision-tagged' AND (hidden IS NULL OR hidden = 0)`,
    )
    .run();

  // Discovery PR4: smart shelves
  ensureColumn(
    sqlite,
    "collections",
    "kind",
    "TEXT NOT NULL DEFAULT 'manual'",
  );
  ensureColumn(sqlite, "collections", "query_json", "TEXT");

  // Deep Lens: durable insights bound to holdings
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      quote_text TEXT NOT NULL,
      body TEXT,
      source TEXT,
      start_offset INTEGER,
      end_offset INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS insights_item_idx ON insights(item_id);
  `);

  // Deep Lens S2: machine dossier analyses (separate from human insights)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS lens_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      content_hash TEXT,
      fingerprint TEXT NOT NULL,
      mode TEXT NOT NULL,
      model TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      payload_json TEXT,
      error TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS lens_analyses_item_uq ON lens_analyses(item_id);
    CREATE INDEX IF NOT EXISTS lens_analyses_fp_idx ON lens_analyses(fingerprint);
  `);

  // Discovery PR6: server open events (dual-write with helix-open-history)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS item_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      at INTEGER NOT NULL,
      meta_json TEXT
    );
    CREATE INDEX IF NOT EXISTS item_events_item_at_idx ON item_events(item_id, at);
    CREATE INDEX IF NOT EXISTS item_events_at_idx ON item_events(at);
  `);

  // Arcade: local high scores + meta unlocks (no holdings)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS arcade_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game TEXT NOT NULL,
      score INTEGER NOT NULL,
      night INTEGER NOT NULL,
      nectar INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      abilities_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS arcade_scores_game_score_idx
      ON arcade_scores(game, score DESC, created_at ASC);

    CREATE TABLE IF NOT EXISTS arcade_progress (
      game TEXT PRIMARY KEY,
      xp INTEGER NOT NULL DEFAULT 0,
      unlocked_json TEXT,
      tutorial_done INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  ensureColumn(sqlite, "arcade_scores", "initials", "TEXT");
}
