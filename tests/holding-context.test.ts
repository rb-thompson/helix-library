import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  holdingSystemAppendix,
  isGenericHoldingQuery,
  localHoldingReadReply,
  stripUntrustedQuote,
} from "@/lib/agent/holding-context";
import { localLibrarianReply } from "@/lib/agent/local";
import { normalizeTagName, tagExistsByName } from "@/lib/collections/manage";
import { runReindex } from "@/lib/indexer/run";
import { searchCatalog } from "@/lib/catalog/query";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("holding context + tag normalize (PR2)", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("normalizeTagName trims, collapses, lowercases, caps", () => {
    assert.equal(normalizeTagName("  Foo   BAR  "), "foo bar");
    assert.equal(normalizeTagName(""), null);
    assert.equal(normalizeTagName("   "), null);
    const long = "a".repeat(100);
    assert.equal(normalizeTagName(long)?.length, 64);
  });

  it("tagExistsByName after create", () => {
    assert.equal(tagExistsByName("pr2-unique-tag-xyz"), false);
  });

  it("stripUntrustedQuote strips controls and caps", () => {
    assert.equal(stripUntrustedQuote("  hi\x00there  "), "hi there");
    assert.equal(stripUntrustedQuote("x".repeat(600))?.length, 500);
    assert.equal(stripUntrustedQuote(null), null);
  });

  it("isGenericHoldingQuery matches summarize-ish prompts", () => {
    assert.equal(isGenericHoldingQuery(""), true);
    assert.equal(isGenericHoldingQuery("summarize"), true);
    assert.equal(isGenericHoldingQuery("What is this?"), true);
    assert.equal(isGenericHoldingQuery("where is my resume"), false);
  });

  it("holdingSystemAppendix requires catalog_read and never embeds client body claim", () => {
    const a = holdingSystemAppendix({
      itemId: 42,
      title: "Paper.pdf",
      quote: "selected phrase",
    });
    assert.match(a, /Active holding id=42/);
    assert.match(a, /catalog_read/);
    assert.match(a, /untrusted user selection/i);
    assert.match(a, /selected phrase/);
    assert.doesNotMatch(a, /bodyText/);
  });

  it("localHoldingReadReply uses indexed body for fixture note", () => {
    const hit = searchCatalog({ q: "welcome", pageSize: 10 });
    const item = hit.items.find((i) => i.name === "welcome.txt");
    assert.ok(item);
    const reply = localHoldingReadReply(item!.id, "summarize");
    assert.ok(reply);
    assert.match(reply!, /catalog\/\d+/);
    assert.match(reply!, /Hello from non-os|welcome|sample/i);
  });

  it("localLibrarianReply with holdingItemId short-circuits summarize", () => {
    const hit = searchCatalog({ q: "welcome", pageSize: 10 });
    const item = hit.items.find((i) => i.name === "welcome.txt");
    assert.ok(item);
    const reply = localLibrarianReply("summarize this", {
      holdingItemId: item!.id,
    });
    assert.match(reply, /Indexed sample|Summary|catalog/i);
    // Must not invent paths outside catalog
    assert.doesNotMatch(reply, /\/home\/fake/);
  });
});
