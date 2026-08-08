import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { searchCatalog } from "@/lib/catalog/query";
import {
  addItemToCollection,
  assertCollectionWritable,
  collectionItemCount,
  createCollection,
  listCollections,
  resolveCollectionItemIds,
  resolveCollectionItems,
  SMART_ID_HARD_CAP,
} from "@/lib/collections/manage";
import { ensureColumn, migrate } from "@/lib/db/migrate";
import { getSqlite, resetDbConnection } from "@/lib/db/client";
import { clearConfigCache } from "@/lib/config";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("smart shelves PR4", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    // Root with many text-ish files for >100 expand test
    env = createTestEnv();
    const root = path.join(env.dir, "holdings");
    mkdirSync(path.join(root, "notes"), { recursive: true });
    for (let i = 0; i < 120; i++) {
      writeFileSync(
        path.join(root, "notes", `note-${String(i).padStart(3, "0")}.txt`),
        `Note number ${i}\nsmart-shelf-marker\n`,
      );
    }
    writeFileSync(
      env.configPath,
      JSON.stringify(
        {
          bind: "127.0.0.1",
          port: 4747,
          dbPath: env.dbPath,
          locations: [{ name: "Holdings", root, enabled: true }],
          ignore: ["**/node_modules/**", "**/.git/**"],
          maxFileBytes: 64 * 1024 * 1024,
          hashFullUnderBytes: 8 * 1024 * 1024,
        },
        null,
        2,
      ),
    );
    clearConfigCache();
    resetDbConnection();
    process.env.NON_OS_CONFIG = env.configPath;
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("SMART_ID_HARD_CAP is 2000", () => {
    assert.equal(SMART_ID_HARD_CAP, 2000);
  });

  it("creates smart shelf and live count matches search", () => {
    const id = createCollection("Smart Notes", "all notes", {
      kind: "smart",
      query: { kind: "text", q: "smart-shelf-marker" },
    });
    const col = listCollections().find((c) => c.id === id);
    assert.ok(col);
    assert.equal(col!.kind, "smart");
    assert.ok(col!.itemCount >= 100);

    const catalog = searchCatalog({
      collectionId: id,
      page: 1,
      pageSize: 100,
    });
    assert.ok(catalog.total >= 100);
    // Beyond first 100: total must reflect full smart membership
    assert.ok(catalog.total > 100, "filter total exceeds public pageSize");
  });

  it("resolveCollectionItemIds returns >100 ids for large smart shelf", () => {
    const id = createCollection("Smart All Text", undefined, {
      kind: "smart",
      query: { kind: "text" },
    });
    const r = resolveCollectionItemIds(id);
    assert.ok(r.total >= 100);
    assert.ok(r.ids.length >= 100);
    assert.ok(r.ids.length <= SMART_ID_HARD_CAP);
  });

  it("hard-fails add to smart shelf", () => {
    const id = createCollection("Smart Locked", undefined, {
      kind: "smart",
      query: { kind: "text" },
    });
    assert.throws(() => assertCollectionWritable(id), /query-backed/i);
    const hit = searchCatalog({ kind: "text", pageSize: 1 });
    assert.ok(hit.items[0]);
    assert.throws(
      () => addItemToCollection(id, hit.items[0]!.id),
      /query-backed/i,
    );
  });

  it("manual shelf still accepts items", () => {
    const id = createCollection("Manual Cart");
    const hit = searchCatalog({ kind: "text", pageSize: 1 });
    assert.ok(hit.items[0]);
    addItemToCollection(id, hit.items[0]!.id);
    assert.equal(collectionItemCount(id), 1);
    const page = resolveCollectionItems(id, { page: 1, pageSize: 24 });
    assert.equal(page.kind, "manual");
    assert.equal(page.total, 1);
  });

  it("resolveCollectionItems paginates smart shelves", () => {
    const id = createCollection("Smart Paged", undefined, {
      kind: "smart",
      query: { kind: "text", q: "smart-shelf-marker" },
    });
    const p1 = resolveCollectionItems(id, { page: 1, pageSize: 24 });
    assert.equal(p1.kind, "smart");
    assert.equal(p1.items.length, 24);
    assert.ok(p1.total > 24);
    const p2 = resolveCollectionItems(id, { page: 2, pageSize: 24 });
    assert.equal(p2.items.length, 24);
    assert.notEqual(p1.items[0]!.id, p2.items[0]!.id);
  });

  it("rejects empty smart query", () => {
    assert.throws(
      () =>
        createCollection("Empty Smart", undefined, {
          kind: "smart",
          query: {},
        }),
      /filter/i,
    );
  });
});

describe("smart shelves migration", () => {
  it("ensureColumn adds kind/query_json on legacy collections table", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helix-smart-mig-"));
    const dbPath = path.join(dir, "legacy.db");
    const sqlite = new Database(dbPath);
    sqlite.exec(`
      CREATE TABLE collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO collections (name) VALUES ('Legacy Shelf');
    `);
    // Run only ensureColumn path like migrate does for legacy
    ensureColumn(
      sqlite,
      "collections",
      "kind",
      "TEXT NOT NULL DEFAULT 'manual'",
    );
    ensureColumn(sqlite, "collections", "query_json", "TEXT");
    const cols = sqlite.prepare(`PRAGMA table_info(collections)`).all() as Array<{
      name: string;
    }>;
    assert.ok(cols.some((c) => c.name === "kind"));
    assert.ok(cols.some((c) => c.name === "query_json"));
    const row = sqlite
      .prepare(`SELECT kind, query_json FROM collections WHERE name = ?`)
      .get("Legacy Shelf") as { kind: string; query_json: string | null };
    assert.equal(row.kind, "manual");
    assert.equal(row.query_json, null);
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("greenfield migrate CREATE includes kind", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helix-smart-green-"));
    const dbPath = path.join(dir, "fresh.db");
    const sqlite = new Database(dbPath);
    migrate(sqlite);
    const cols = sqlite.prepare(`PRAGMA table_info(collections)`).all() as Array<{
      name: string;
    }>;
    assert.ok(cols.some((c) => c.name === "kind"));
    assert.ok(cols.some((c) => c.name === "query_json"));
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
