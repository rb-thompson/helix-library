import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { catalogFacets } from "@/lib/catalog/query";
import {
  addTagToItem,
  deleteTags,
  listTags,
} from "@/lib/collections/manage";
import { getDb } from "@/lib/db/client";
import { items } from "@/lib/db/schema";
import { runReindex } from "@/lib/indexer/run";
import {
  filterVisibleTags,
  isHiddenFacetTag,
} from "@/lib/tags/hidden";
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
});
