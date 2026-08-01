import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { itemText, items } from "@/lib/db/schema";
import { runReindex } from "@/lib/indexer/run";
import { searchCatalog } from "@/lib/catalog/query";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("indexer against fixtures/sample-root", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    const { stats } = await runReindex();
    assert.ok(stats.seen >= 4, `expected several files, seen=${stats.seen}`);
    assert.ok(stats.added >= 4, `expected adds, added=${stats.added}`);
    assert.equal(stats.errors, 0);
  });

  after(() => {
    env.cleanup();
  });

  it("indexes notes, image, code, and PDF under fixtures", () => {
    const db = getDb();
    const rows = db.select().from(items).all();
    const names = rows.map((r) => r.name).sort();
    assert.ok(names.includes("welcome.txt"));
    assert.ok(names.includes("stem-lesson.md"));
    assert.ok(names.includes("hello.py"));
    assert.ok(names.includes("pixel.png"));
    assert.ok(names.includes("fixture-note.pdf"));

    const kinds = Object.fromEntries(rows.map((r) => [r.name, r.kind]));
    assert.equal(kinds["welcome.txt"], "text");
    assert.equal(kinds["hello.py"], "code");
    assert.equal(kinds["pixel.png"], "image");
    assert.equal(kinds["fixture-note.pdf"], "document");
  });

  it("extracts text bodies for notes and PDF into item_text", () => {
    const db = getDb();
    const welcome = db
      .select()
      .from(items)
      .where(eq(items.name, "welcome.txt"))
      .get();
    assert.ok(welcome);
    const welcomeBody = db
      .select()
      .from(itemText)
      .where(eq(itemText.itemId, welcome!.id))
      .get();
    assert.ok(welcomeBody?.body.includes("sample catalog item"));

    const pdf = db
      .select()
      .from(items)
      .where(eq(items.name, "fixture-note.pdf"))
      .get();
    assert.ok(pdf);
    const pdfBody = db
      .select()
      .from(itemText)
      .where(eq(itemText.itemId, pdf!.id))
      .get();
    assert.ok(pdfBody, "PDF should have item_text row");
    assert.match(pdfBody!.body, /fixture PDF|golden age/i);
  });

  it("makes PDF body searchable via FTS", () => {
    const byBody = searchCatalog({ q: "golden", pageSize: 10 });
    assert.ok(
      byBody.total >= 1,
      `expected FTS hit for golden, got ${byBody.total}`,
    );
    assert.ok(
      byBody.items.some((i) => i.name === "fixture-note.pdf"),
      "fixture PDF should match body search",
    );

    const byName = searchCatalog({ q: "welcome", pageSize: 10 });
    assert.ok(byName.items.some((i) => i.name === "welcome.txt"));
  });

  it("second reindex is mostly unchanged", async () => {
    const { stats } = await runReindex();
    assert.ok(stats.unchanged >= 3, JSON.stringify(stats));
    assert.equal(stats.errors, 0);
  });
});
