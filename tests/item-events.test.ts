import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  countItemEvents,
  ITEM_EVENTS_RETAIN,
  listRecentOpens,
  OPEN_DEDUPE_MS,
  recordItemEvent,
} from "@/lib/catalog/events";
import { mergeRecentOpens } from "@/lib/catalog/open-merge";
import { searchCatalog } from "@/lib/catalog/query";
import { migrate } from "@/lib/db/migrate";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("mergeRecentOpens", () => {
  it("unions by item id and keeps the later timestamp", () => {
    const merged = mergeRecentOpens(
      [
        { id: 1, name: "Server Title", kind: "document", openedAt: 100 },
        { id: 2, name: "Only server", kind: "image", openedAt: 50 },
      ],
      [
        { id: 1, name: "Local name", kind: "document", openedAt: 200 },
        { id: 3, name: "Only local", kind: "text", openedAt: 150 },
      ],
      40,
    );
    assert.equal(merged.length, 3);
    assert.equal(merged[0].id, 1);
    assert.equal(merged[0].openedAt, 200);
    assert.equal(merged[0].name, "Local name");
    assert.equal(merged[1].id, 3);
    assert.equal(merged[2].id, 2);
  });

  it("caps and drops invalid ids", () => {
    const merged = mergeRecentOpens(
      [
        { id: 0, name: "bad", kind: "text", openedAt: 9 },
        { id: 1, name: "a", kind: "text", openedAt: 3 },
        { id: 2, name: "b", kind: "text", openedAt: 2 },
      ],
      [{ id: 3, name: "c", kind: "text", openedAt: 1 }],
      2,
    );
    assert.deepEqual(
      merged.map((e) => e.id),
      [1, 2],
    );
  });
});

describe("item_events write path", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("records an open, 60s-dedupes, and lists DISTINCT max(at)", () => {
    const hit = searchCatalog({ q: "welcome", pageSize: 10 });
    const welcome = hit.items.find((i) => i.name === "welcome.txt");
    assert.ok(welcome);

    const first = recordItemEvent(welcome!.id, "open", { source: "detail" }, 1_000);
    assert.equal(first.status, "recorded");

    const dup = recordItemEvent(welcome!.id, "open", { source: "room" }, 1_000 + 10_000);
    assert.equal(dup.status, "ignored");

    const again = recordItemEvent(
      welcome!.id,
      "open",
      { source: "detail" },
      1_000 + OPEN_DEDUPE_MS,
    );
    assert.equal(again.status, "recorded");

    const recent = listRecentOpens(40);
    const row = recent.find((e) => e.id === welcome!.id);
    assert.ok(row);
    assert.equal(row!.openedAt, 1_000 + OPEN_DEDUPE_MS);
  });

  it("returns not_found for unknown ids", () => {
    assert.equal(recordItemEvent(9_999_999, "open").status, "not_found");
    assert.equal(recordItemEvent(-1, "open").status, "not_found");
  });

  it("prunes to 500 events globally in the same write", () => {
    const page = searchCatalog({ pageSize: 20 });
    const seed = page.items[0];
    assert.ok(seed);

    for (let i = 0; i < ITEM_EVENTS_RETAIN + 25; i++) {
      const result = recordItemEvent(
        seed.id,
        "open",
        undefined,
        10_000_000 + i * OPEN_DEDUPE_MS,
      );
      assert.equal(result.status, "recorded");
    }
    assert.equal(countItemEvents(), ITEM_EVENTS_RETAIN);
  });
});

describe("item_events migration", () => {
  it("greenfield migrate creates item_events + indexes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helix-events-green-"));
    const sqlite = new Database(path.join(dir, "fresh.db"));
    migrate(sqlite);
    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'item_events'`,
      )
      .all() as Array<{ name: string }>;
    assert.equal(tables.length, 1);
    const idx = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'item_events'`,
      )
      .all() as Array<{ name: string }>;
    assert.ok(idx.some((i) => i.name === "item_events_item_at_idx"));
    assert.ok(idx.some((i) => i.name === "item_events_at_idx"));
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
