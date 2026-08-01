import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { localLibrarianReply } from "@/lib/agent/local";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("local librarian against fixtures", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv({ locationName: "Fixtures" });
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("answers empty prompt with a hint", () => {
    const reply = localLibrarianReply("   ");
    assert.match(reply, /find a file|locations|collections/i);
  });

  it("lists locations", () => {
    const reply = localLibrarianReply("What locations do I have?");
    assert.match(reply, /### Locations/);
    assert.match(reply, /Fixtures/);
  });

  it("finds a note by name fragment", () => {
    const reply = localLibrarianReply("Where is welcome?");
    assert.match(reply, /welcome\.txt/i);
    assert.match(reply, /\/catalog\/\d+/);
  });

  it("filters to images", () => {
    const reply = localLibrarianReply("Show me images");
    assert.match(reply, /image/i);
    assert.match(reply, /pixel\.png/i);
  });

  it("finds PDF content via body search", () => {
    const reply = localLibrarianReply("find golden age");
    assert.match(reply, /fixture-note\.pdf/i);
  });

  it("explains reindex help", () => {
    const reply = localLibrarianReply("How do I reindex?");
    assert.match(reply, /### Reindex/);
  });

  it("proposes reindex for approval instead of silent run", () => {
    const reply = localLibrarianReply("reindex now");
    assert.match(reply, /Proposed: Reindex/);
    assert.match(reply, /\[\[action:\{"type":"reindex"\}\]\]/);
  });

  it("returns item by catalog id", () => {
    // Discover an id from a search reply, then re-query
    const search = localLibrarianReply("find stem-lesson");
    const m = search.match(/\/catalog\/(\d+)/);
    assert.ok(m, "expected catalog link in search reply");
    const id = m![1];
    const reply = localLibrarianReply(`item ${id}`);
    assert.match(reply, new RegExp(`### Item #${id}`));
    assert.match(reply, /stem-lesson/i);
  });
});
