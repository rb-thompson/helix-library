import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { searchCatalog } from "@/lib/catalog/query";
import { purgeMissingItems } from "@/lib/catalog/weed";
import { getDb } from "@/lib/db/client";
import { items } from "@/lib/db/schema";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("weeding desk — purge missing holdings", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("missingOnly filter returns only is_missing rows", () => {
    const db = getDb();
    const row = db.select().from(items).where(eq(items.name, "welcome.txt")).get();
    assert.ok(row);

    db.update(items)
      .set({ isMissing: 1 })
      .where(eq(items.id, row!.id))
      .run();

    const missing = searchCatalog({ missingOnly: true, pageSize: 50 });
    assert.ok(missing.items.some((i) => i.id === row!.id));
    assert.ok(missing.items.every((i) => i.isMissing === 1));

    const present = searchCatalog({ pageSize: 50 });
    assert.ok(!present.items.some((i) => i.id === row!.id));
  });

  it("purgeMissingItems deletes only missing rows", () => {
    const db = getDb();
    const missingRow = db
      .select()
      .from(items)
      .where(eq(items.isMissing, 1))
      .get();
    assert.ok(missingRow, "need a missing row from previous test");

    const presentRow = db
      .select()
      .from(items)
      .where(eq(items.isMissing, 0))
      .get();
    assert.ok(presentRow);

    const result = purgeMissingItems([missingRow!.id, presentRow!.id]);
    assert.equal(result.purged, 1);
    assert.equal(result.skipped, 1);

    const gone = db
      .select()
      .from(items)
      .where(eq(items.id, missingRow!.id))
      .get();
    assert.equal(gone, undefined);

    const kept = db
      .select()
      .from(items)
      .where(eq(items.id, presentRow!.id))
      .get();
    assert.ok(kept);
  });
});
