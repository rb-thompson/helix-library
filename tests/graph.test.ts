import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  addItemToCollection,
  addTagToItem,
  createCollection,
  listTags,
} from "@/lib/collections/manage";
import {
  buildKnowledgeGraph,
  graphHrefFromFilters,
} from "@/lib/graph/build";
import { getDb } from "@/lib/db/client";
import { items } from "@/lib/db/schema";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("knowledge graph filters", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("kind filter only returns that kind of item nodes", () => {
    const graph = buildKnowledgeGraph({ kind: "image" });
    const itemNodes = graph.nodes.filter((n) => n.type === "item");
    assert.ok(itemNodes.length >= 1);
    assert.ok(itemNodes.every((n) => n.kind === "image"));
    assert.equal(graph.meta.filters.kind, "image");
  });

  it("empty q match yields empty graph", () => {
    const graph = buildKnowledgeGraph({
      q: "zzznomatch_unlikely_token_xyz",
    });
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.links.length, 0);
    assert.equal(graph.meta.itemCount, 0);
    assert.equal(graph.meta.totalItems, 0);
    assert.equal(graph.meta.truncated, false);
    assert.equal(graph.meta.filters.q, "zzznomatch_unlikely_token_xyz");
  });

  it("respects hard maxItems cap and exposes totalItems", () => {
    const graph = buildKnowledgeGraph({ maxItems: 2 });
    const itemNodes = graph.nodes.filter((n) => n.type === "item");
    assert.ok(itemNodes.length <= 2);
    assert.equal(graph.meta.maxItems, 2);
    assert.ok(graph.meta.totalItems >= graph.meta.itemCount);
    if (graph.meta.truncated) {
      assert.ok(itemNodes.length === 2);
      assert.ok(graph.meta.totalItems > graph.meta.itemCount);
    }
  });

  it("collection filter restricts to shelved items", () => {
    const db = getDb();
    const row = db.select().from(items).get();
    assert.ok(row);
    const colId = createCollection("Graph Filter Shelf");
    addItemToCollection(colId, row!.id);
    const graph = buildKnowledgeGraph({ collectionId: colId });
    const itemNodes = graph.nodes.filter((n) => n.type === "item");
    assert.ok(itemNodes.some((n) => n.itemId === row!.id));
    assert.ok(itemNodes.every((n) => n.itemId != null));
    assert.equal(graph.meta.filters.collectionId, colId);
  });

  it("tag filter restricts to tagged items", () => {
    const db = getDb();
    const row = db.select().from(items).get();
    assert.ok(row);
    addTagToItem(row!.id, "graph-filter-tag");
    const tag = listTags().find((t) => t.name === "graph-filter-tag");
    assert.ok(tag);
    const graph = buildKnowledgeGraph({ tagId: tag!.id });
    const itemNodes = graph.nodes.filter((n) => n.type === "item");
    assert.ok(itemNodes.some((n) => n.itemId === row!.id));
  });

  it("graphHrefFromFilters builds catalog-aligned URL", () => {
    assert.equal(graphHrefFromFilters({}), "/graph");
    assert.equal(
      graphHrefFromFilters({ kind: "document", q: "opac" }),
      "/graph?kind=document&q=opac",
    );
    assert.equal(
      graphHrefFromFilters({
        locationId: 2,
        tagId: 5,
        collectionId: 9,
        singletons: true,
      }),
      "/graph?locationId=2&tagId=5&collectionId=9&singletons=1",
    );
  });
});
