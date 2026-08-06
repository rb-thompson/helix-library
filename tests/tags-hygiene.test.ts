import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { catalogFacets } from "@/lib/catalog/query";
import {
  addTagToItem,
  deleteTags,
  getOrCreateTag,
  listTags,
  mergeTags,
  renameTag,
} from "@/lib/collections/manage";
import { getDb, getSqlite } from "@/lib/db/client";
import { itemTags, items, tags } from "@/lib/db/schema";
import { runReindex } from "@/lib/indexer/run";
import { backfillItemTagSources } from "@/lib/tags/backfill-source";
import {
  filterVisibleTags,
  isHiddenFacetTag,
} from "@/lib/tags/hidden";
import {
  isBetterSource,
  upsertItemTag,
} from "@/lib/tags/source";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("tag hygiene", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("hides vision-tagged from facets", () => {
    assert.equal(isHiddenFacetTag("vision-tagged"), true);
    assert.equal(isHiddenFacetTag("stem"), false);

    const db = getDb();
    const item = db.select().from(items).get();
    assert.ok(item);
    addTagToItem(item!.id, "vision-tagged");
    addTagToItem(item!.id, "stem");

    const facets = catalogFacets();
    assert.ok(!facets.tags.some((t) => t.name === "vision-tagged"));
    assert.ok(facets.tags.some((t) => t.name === "stem"));

    const listed = listTags({ sortBy: "count" });
    assert.ok(listed.some((t) => t.name === "vision-tagged"));
    const visible = filterVisibleTags(listed);
    assert.ok(!visible.some((t) => t.name === "vision-tagged"));
  });

  it("deleteTags removes selected tags", () => {
    const listed = listTags({ sortBy: "count" });
    const stem = listed.find((t) => t.name === "stem");
    assert.ok(stem);
    const result = deleteTags([stem!.id]);
    assert.equal(result.deleted, 1);
    assert.equal(
      listTags().some((t) => t.name === "stem"),
      false,
    );
  });

  it("upsertItemTag upgrades vision to manual, not demote acquire", () => {
    assert.ok(isBetterSource("manual", "vision"));
    assert.ok(!isBetterSource("vision", "acquire"));

    const db = getDb();
    const item = db.select().from(items).get();
    assert.ok(item);
    const tagId = getOrCreateTag("upsert-test-label");
    upsertItemTag(item!.id, tagId, "vision");
    let row = db
      .select()
      .from(itemTags)
      .where(eq(itemTags.tagId, tagId))
      .get();
    assert.equal(row?.source, "vision");

    upsertItemTag(item!.id, tagId, "manual");
    row = db
      .select()
      .from(itemTags)
      .where(eq(itemTags.tagId, tagId))
      .get();
    assert.equal(row?.source, "manual");

    // Reset for acquire demotion check
    const tagId2 = getOrCreateTag("upsert-acquire-label");
    upsertItemTag(item!.id, tagId2, "acquire");
    upsertItemTag(item!.id, tagId2, "vision");
    row = db
      .select()
      .from(itemTags)
      .where(eq(itemTags.tagId, tagId2))
      .get();
    assert.equal(row?.source, "acquire");
  });

  it("backfill marks vision and acquire sources", () => {
    const db = getDb();
    const item = db.select().from(items).get();
    assert.ok(item);
    const sqlite = getSqlite();

    // Force manual then backfill
    const arxivId = getOrCreateTag("arxiv");
    const labId = getOrCreateTag("backfill-vision-lab");
    const vtId = getOrCreateTag("vision-tagged");
    sqlite
      .prepare(`DELETE FROM item_tags WHERE item_id = ?`)
      .run(item!.id);
    sqlite
      .prepare(
        `INSERT INTO item_tags(tag_id, item_id, source) VALUES (?, ?, 'manual')`,
      )
      .run(arxivId, item!.id);
    sqlite
      .prepare(
        `INSERT INTO item_tags(tag_id, item_id, source) VALUES (?, ?, 'manual')`,
      )
      .run(labId, item!.id);
    sqlite
      .prepare(
        `INSERT INTO item_tags(tag_id, item_id, source) VALUES (?, ?, 'manual')`,
      )
      .run(vtId, item!.id);

    backfillItemTagSources(sqlite);

    const arxiv = sqlite
      .prepare(
        `SELECT source FROM item_tags WHERE tag_id = ? AND item_id = ?`,
      )
      .get(arxivId, item!.id) as { source: string };
    const lab = sqlite
      .prepare(
        `SELECT source FROM item_tags WHERE tag_id = ? AND item_id = ?`,
      )
      .get(labId, item!.id) as { source: string };
    assert.equal(arxiv.source, "acquire");
    assert.equal(lab.source, "vision");
  });

  it("mergeTags re-links and deletes sources", () => {
    const db = getDb();
    const item = db.select().from(items).get();
    assert.ok(item);
    addTagToItem(item!.id, "merge-a", "manual");
    addTagToItem(item!.id, "merge-b", "vision");
    const a = listTags().find((t) => t.name === "merge-a")!;
    const b = listTags().find((t) => t.name === "merge-b")!;
    const result = mergeTags({
      sourceTagIds: [a.id, b.id],
      targetName: "merge-target",
    });
    assert.ok(result.targetId > 0);
    assert.equal(result.deletedSources, 2);
    assert.equal(
      listTags().some((t) => t.name === "merge-a"),
      false,
    );
    assert.ok(listTags().some((t) => t.name === "merge-target"));
    const link = db
      .select()
      .from(itemTags)
      .where(eq(itemTags.tagId, result.targetId))
      .get();
    assert.ok(link);
  });

  it("renameTag renames or merges", () => {
    const db = getDb();
    const item = db.select().from(items).get();
    assert.ok(item);
    addTagToItem(item!.id, "rename-me");
    const t = listTags().find((x) => x.name === "rename-me")!;
    const r = renameTag(t.id, "renamed-ok");
    assert.equal(r.merged, false);
    assert.ok(listTags().some((x) => x.name === "renamed-ok"));

    addTagToItem(item!.id, "rename-clash-a");
    addTagToItem(item!.id, "rename-clash-b");
    const a = listTags().find((x) => x.name === "rename-clash-a")!;
    const m = renameTag(a.id, "rename-clash-b", { mergeIfExists: true });
    assert.equal(m.merged, true);
    assert.equal(
      listTags().some((x) => x.name === "rename-clash-a"),
      false,
    );
  });

  it("listTags exposes hasVision / hasAcquire", () => {
    const listed = listTags({ sortBy: "count" });
    const arxiv = listed.find((t) => t.name === "arxiv");
    // may or may not exist depending on earlier tests
    if (arxiv) {
      assert.equal(typeof arxiv.hasAcquire, "boolean");
    }
    assert.ok(listed.every((t) => Array.isArray(t.sources)));
  });
});

