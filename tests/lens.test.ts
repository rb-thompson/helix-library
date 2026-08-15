import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { searchCatalog } from "@/lib/catalog/query";
import { getDb, getSqlite } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";
import { getRelatedHoldings } from "@/lib/catalog/related";
import {
  createInsight,
  listInsightsByItem,
  getInsight,
  deleteInsight,
  resolveLensFocus,
} from "@/lib/lens";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("Deep Lens focus + insights", () => {
  let env: ReturnType<typeof createTestEnv>;
  let welcomeId: number;
  let locationId: number;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
    const hit = searchCatalog({ q: "welcome", pageSize: 10 });
    const welcome = hit.items.find((i) => i.name === "welcome.txt");
    assert.ok(welcome, "fixture welcome.txt must be indexed");
    welcomeId = welcome!.id;
    locationId = welcome!.locationId;
  });

  after(() => {
    env.cleanup();
  });

  it("resolveLensFocus: invalid id", () => {
    for (const bad of [0, -1, 1.5, "nope", null, undefined, ""]) {
      const f = resolveLensFocus(bad as never);
      assert.equal(f.status, "invalid_id");
      assert.equal(f.item, null);
    }
  });

  it("resolveLensFocus: not found", () => {
    const f = resolveLensFocus(9_999_999);
    assert.equal(f.status, "not_found");
    assert.equal(f.itemId, 9_999_999);
    assert.equal(f.item, null);
  });

  it("resolveLensFocus: valid holding is ok", () => {
    const f = resolveLensFocus(welcomeId);
    assert.equal(f.status, "ok");
    if (f.status !== "ok") return;
    assert.equal(f.item.id, welcomeId);
    assert.ok(f.title.length > 0);
    assert.equal(f.canServeMedia, true);
  });

  it("resolveLensFocus: disabled location", () => {
    const db = getDb();
    db.update(locations)
      .set({ enabled: 0 })
      .where(eq(locations.id, locationId))
      .run();

    try {
      const f = resolveLensFocus(welcomeId);
      assert.equal(f.status, "disabled_location");
      assert.ok(f.item);
      assert.equal(f.item!.id, welcomeId);
      assert.match(f.message, /disabled/i);

      // Deep Lens still composes structural related when media is gated.
      const related = getRelatedHoldings(welcomeId);
      const dir = related.find((g) => g.reason === "same_directory");
      assert.ok(dir, "same_directory related available under disabled location");
      assert.ok(
        dir!.items.some(
          (i) => i.name === "stem-lesson.md" || i.name === "hello.py",
        ),
        "notes siblings present while location disabled",
      );
    } finally {
      db.update(locations)
        .set({ enabled: 1 })
        .where(eq(locations.id, locationId))
        .run();
    }

    const restored = resolveLensFocus(welcomeId);
    assert.equal(restored.status, "ok");
  });

  it("resolveLensFocus: missing on disk", () => {
    getSqlite()
      .prepare(`UPDATE items SET is_missing = 1 WHERE id = ?`)
      .run(welcomeId);

    try {
      const f = resolveLensFocus(welcomeId);
      assert.equal(f.status, "missing");
      assert.ok(f.item);
      assert.match(f.message, /missing/i);
    } finally {
      getSqlite()
        .prepare(`UPDATE items SET is_missing = 0 WHERE id = ?`)
        .run(welcomeId);
    }

    assert.equal(resolveLensFocus(welcomeId).status, "ok");
  });

  it("createInsight rejects unknown item id", () => {
    assert.throws(
      () =>
        createInsight({
          itemId: 9_999_999,
          quoteText: "orphan quote",
        }),
      /No holding/,
    );
  });

  it("createInsight rejects empty quote", () => {
    assert.throws(
      () => createInsight({ itemId: welcomeId, quoteText: "   " }),
      /quoteText/,
    );
  });

  it("insight create-then-list round-trip", () => {
    const before = listInsightsByItem(welcomeId);
    const created = createInsight({
      itemId: welcomeId,
      quoteText: "  Helix deep lens quote  ",
      body: "Note about the passage",
      source: "selection",
    });

    assert.ok(created.id > 0);
    assert.equal(created.itemId, welcomeId);
    assert.equal(created.quoteText, "Helix deep lens quote");
    assert.equal(created.body, "Note about the passage");
    assert.equal(created.source, "selection");

    const listed = listInsightsByItem(welcomeId);
    assert.ok(listed.length >= before.length + 1);
    const found = listed.find((i) => i.id === created.id);
    assert.ok(found, "create-then-list returns the insight");
    assert.equal(found!.quoteText, "Helix deep lens quote");

    const got = getInsight(created.id);
    assert.ok(got);
    assert.equal(got!.id, created.id);

    assert.equal(deleteInsight(created.id), true);
    assert.equal(getInsight(created.id), null);
    assert.ok(!listInsightsByItem(welcomeId).some((i) => i.id === created.id));
  });

  it("listInsightsByItem empty for other id", () => {
    createInsight({
      itemId: welcomeId,
      quoteText: "bound only to welcome",
    });
    assert.deepEqual(listInsightsByItem(1_000_001), []);
  });
});
