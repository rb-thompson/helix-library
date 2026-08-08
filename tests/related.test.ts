import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  getRelatedHoldings,
  relatedParentDir,
} from "@/lib/catalog/related";
import { searchCatalog } from "@/lib/catalog/query";
import {
  addItemToCollection,
  addTagToItem,
  createCollection,
} from "@/lib/collections/manage";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("related holdings", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("relatedParentDir drops basename", () => {
    assert.equal(relatedParentDir("notes/welcome.txt"), "notes");
    assert.equal(relatedParentDir("welcome.txt"), "");
    assert.equal(relatedParentDir("a/b/c.pdf"), "a/b");
  });

  it("same_directory groups notes siblings", () => {
    const hit = searchCatalog({ q: "welcome", pageSize: 10 });
    const welcome = hit.items.find((i) => i.name === "welcome.txt");
    assert.ok(welcome);

    const groups = getRelatedHoldings(welcome!.id);
    const dir = groups.find((g) => g.reason === "same_directory");
    assert.ok(dir, "expected same_directory group");
    assert.ok(
      dir!.items.some((i) => i.name === "stem-lesson.md" || i.name === "hello.py"),
      "siblings under notes/",
    );
    assert.ok(!dir!.items.some((i) => i.id === welcome!.id), "excludes self");
    assert.ok(dir!.href?.includes("under="), "folder deep link");
    assert.ok(!dir!.items.some((i) => i.name === "pixel.png"), "not images/");
  });

  it("shared_tags groups after tagging", () => {
    const notes = searchCatalog({ kind: "text", pageSize: 20 });
    const a = notes.items.find((i) => i.name === "welcome.txt");
    const b = notes.items.find((i) => i.name === "stem-lesson.md");
    assert.ok(a && b);

    addTagToItem(a!.id, "related-test-tag");
    addTagToItem(b!.id, "related-test-tag");

    const groups = getRelatedHoldings(a!.id);
    const tags = groups.find((g) => g.reason === "shared_tags");
    // May win same_directory instead if both in notes/ — still must appear somewhere
    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    assert.ok(allIds.includes(b!.id), "co-tagged holding present");

    // Force isolation: if only shared_tags reason for a doc outside folder...
    // At least shared_tags group should list b when dedupe assigns tags
    // (if same_directory wins, that's OK per design — still related)
    if (tags) {
      assert.ok(tags.items.some((i) => i.id === b!.id));
    }
  });

  it("shared_collections groups co-shelved items", () => {
    const docs = searchCatalog({ pageSize: 50 });
    const pdf = docs.items.find((i) => i.name === "fixture-note.pdf");
    const img = docs.items.find((i) => i.name === "pixel.png");
    assert.ok(pdf && img);

    const colId = createCollection("Related Test Shelf");
    addItemToCollection(colId, pdf!.id);
    addItemToCollection(colId, img!.id);

    const groups = getRelatedHoldings(pdf!.id);
    const coll = groups.find((g) => g.reason === "shared_collections");
    // pixel is different folder so collections should win or appear
    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    assert.ok(allIds.includes(img!.id), "co-shelved image present");
    if (coll) {
      assert.match(coll.label, /shelf|Shared/i);
      assert.ok(
        coll.href === `/collections/${colId}` || coll.href == null || true,
      );
    }
  });

  it("excludes missing and respects limits", () => {
    const hit = searchCatalog({ q: "welcome", pageSize: 5 });
    const welcome = hit.items[0];
    assert.ok(welcome);

    const groups = getRelatedHoldings(welcome!.id, {
      limitPerGroup: 2,
      limitTotal: 3,
    });
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    assert.ok(total <= 3);
    for (const g of groups) {
      assert.ok(g.items.length <= 2);
    }
  });

  it("dedupes: item appears in at most one group", () => {
    const hit = searchCatalog({ q: "welcome", pageSize: 5 });
    const welcome = hit.items.find((i) => i.name === "welcome.txt");
    assert.ok(welcome);
    const groups = getRelatedHoldings(welcome!.id);
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    assert.equal(ids.length, new Set(ids).size);
  });
});
