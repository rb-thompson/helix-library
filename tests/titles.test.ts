import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { displayTitle } from "@/lib/catalog/display";
import { setItemCatalogTitle } from "@/lib/catalog/query";
import { getDb } from "@/lib/db/client";
import { ensureColumn, migrate } from "@/lib/db/migrate";
import { items } from "@/lib/db/schema";
import { nextTitle, runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("displayTitle", () => {
  it("prefers non-filename titleSource", () => {
    assert.equal(
      displayTitle({
        name: "2604.01262.pdf",
        title: "Transforming OPACs",
        titleSource: "arxiv",
      }),
      "Transforming OPACs",
    );
  });

  it("falls back to title when it differs from name", () => {
    assert.equal(
      displayTitle({
        name: "file.pdf",
        title: "Human Title",
        titleSource: "filename",
      }),
      "Human Title",
    );
  });

  it("uses name when title matches basename", () => {
    assert.equal(
      displayTitle({
        name: "notes.txt",
        title: "notes.txt",
        titleSource: "filename",
      }),
      "notes.txt",
    );
  });
});

describe("nextTitle reindex policy", () => {
  it("preserves arxiv titles", () => {
    const r = nextTitle(
      {
        title: "Paper Title",
        titleSource: "arxiv",
        name: "1706.03762.pdf",
      },
      "1706.03762.pdf",
    );
    assert.equal(r.title, "Paper Title");
    assert.equal(r.titleSource, "arxiv");
  });

  it("promotes divergent title to manual when source was filename", () => {
    const r = nextTitle(
      {
        title: "Custom",
        titleSource: "filename",
        name: "a.pdf",
      },
      "a.pdf",
    );
    assert.equal(r.title, "Custom");
    assert.equal(r.titleSource, "manual");
  });

  it("uses basename for new items", () => {
    const r = nextTitle(undefined, "new.pdf");
    assert.equal(r.title, "new.pdf");
    assert.equal(r.titleSource, "filename");
  });
});

describe("title_source column + reindex preserve", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("ensureColumn is idempotent on title_source", () => {
    const sqlite = new Database(env.dbPath);
    migrate(sqlite);
    const added = ensureColumn(
      sqlite,
      "items",
      "title_source",
      "TEXT NOT NULL DEFAULT 'filename'",
    );
    assert.equal(added, false);
    sqlite.close();
  });

  it("reindex preserves arxiv title_source", async () => {
    const db = getDb();
    const item = db.select().from(items).get();
    assert.ok(item);
    setItemCatalogTitle(item!.id, "Preserved Title", "arxiv");

    await runReindex();

    const again = db
      .select()
      .from(items)
      .where(eq(items.id, item!.id))
      .get();
    assert.ok(again);
    assert.equal(again!.title, "Preserved Title");
    assert.equal(again!.titleSource, "arxiv");
  });
});

describe("migrate greenfield title_source", () => {
  it("creates items.title_source on fresh DB", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helix-migrate-"));
    const dbPath = path.join(dir, "t.db");
    try {
      const sqlite = new Database(dbPath);
      migrate(sqlite);
      const cols = sqlite.prepare(`PRAGMA table_info(items)`).all() as Array<{
        name: string;
      }>;
      assert.ok(cols.some((c) => c.name === "title_source"));
      sqlite.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("migrate legacy item_tags without source", () => {
  it("adds source column when upgrading a pre-season DB", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helix-legacy-"));
    const dbPath = path.join(dir, "legacy.db");
    try {
      const sqlite = new Database(dbPath);
      // Minimal pre-PR2 shape (no source / no title_source)
      sqlite.exec(`
        CREATE TABLE locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          root_path TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          location_id INTEGER NOT NULL REFERENCES locations(id),
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
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          indexed_at INTEGER NOT NULL,
          is_missing INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE item_tags (
          tag_id INTEGER NOT NULL REFERENCES tags(id),
          item_id INTEGER NOT NULL REFERENCES items(id),
          PRIMARY KEY (tag_id, item_id)
        );
      `);
      migrate(sqlite);
      const itemCols = sqlite
        .prepare(`PRAGMA table_info(items)`)
        .all() as Array<{ name: string }>;
      const tagCols = sqlite
        .prepare(`PRAGMA table_info(item_tags)`)
        .all() as Array<{ name: string }>;
      assert.ok(itemCols.some((c) => c.name === "title_source"));
      assert.ok(tagCols.some((c) => c.name === "source"));
      // Query must work (the original runtime failure mode)
      sqlite.prepare(`SELECT source FROM item_tags LIMIT 1`).all();
      sqlite.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
