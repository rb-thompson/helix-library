import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { searchCatalog, searchTokens } from "@/lib/catalog/query";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

describe("searchTokens", () => {
  it("strips stopwords and keeps name fragments", () => {
    assert.deepEqual(searchTokens("Do I have any images of Finn or Phoebe?"), [
      "finn",
      "phoebe",
    ]);
  });
});

describe("hybrid catalog search", () => {
  let env: ReturnType<typeof createTestEnv>;
  let root: string;

  before(async () => {
    ensureThumbsParent();
    // temp root with a compound filename image
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    root = mkdtempSync(path.join(tmpdir(), "non-os-search-"));
    mkdirSync(path.join(root, "images"), { recursive: true });
    mkdirSync(path.join(root, "notes"), { recursive: true });
    // tiny 1x1 png bytes
    writeFileSync(
      path.join(root, "images", "finnandphoebe.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    writeFileSync(path.join(root, "notes", "welcome.txt"), "hello");

    env = createTestEnv({ root, locationName: "SearchFixtures" });
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("finds compound filename by either name fragment", () => {
    const byFinn = searchCatalog({ q: "finn", kind: "image" });
    assert.ok(
      byFinn.items.some((i) => i.name.includes("finnandphoebe")),
      "finn should match finnandphoebe",
    );

    const byPhoebe = searchCatalog({ q: "phoebe" });
    assert.ok(
      byPhoebe.items.some((i) => i.name.includes("finnandphoebe")),
      "phoebe should match finnandphoebe via substring",
    );

    const byOr = searchCatalog({
      q: "Do I have any images of Finn or Phoebe?",
    });
    assert.ok(
      byOr.items.some((i) => i.name.includes("finnandphoebe")),
      "natural-language query should still hit compound name",
    );
  });
});
