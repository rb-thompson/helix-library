import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  describeAction,
  extractActionsFromText,
  formatActionToken,
  isConfirmUtterance,
  isCancelUtterance,
  executeLibrarianAction,
  executeLibrarianActions,
  parseLegacyPropose,
} from "@/lib/agent/actions";
import { localLibrarianReply } from "@/lib/agent/local";
import { searchCatalog } from "@/lib/catalog/query";
import { getJob } from "@/lib/jobs/store";
import { runReindex } from "@/lib/indexer/run";
import { listCollections } from "@/lib/collections/manage";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("agent actions", () => {
  let env: ReturnType<typeof createTestEnv>;
  let threadId: number;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
    const { createThread, appendMessage } = await import(
      "@/lib/agent/threads"
    );
    threadId = createThread("action-test");
    // seed a pending create_collection proposal (sync — safe in tests)
    appendMessage({
      threadId,
      role: "assistant",
      content: formatActionToken({
        type: "create_collection",
        name: "Pending Approve Shelf",
      }),
    });
  });

  after(() => {
    env.cleanup();
  });

  it("parses action tokens and legacy propose", () => {
    const token = formatActionToken({
      type: "tag",
      itemId: 3,
      tagName: "stem",
    });
    const actions = extractActionsFromText(`Hello ${token} world`);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, "tag");

    const legacy = parseLegacyPropose("tag item=9 name=career");
    assert.deepEqual(legacy, {
      type: "tag",
      itemId: 9,
      tagName: "career",
    });
  });

  it("detects confirm and cancel utterances", () => {
    assert.equal(isConfirmUtterance("yes"), true);
    assert.equal(isConfirmUtterance("approve"), true);
    assert.equal(isConfirmUtterance("do it"), true);
    assert.equal(isConfirmUtterance("where is resume"), false);
    assert.equal(isCancelUtterance("cancel"), true);
    assert.equal(isCancelUtterance("no"), true);
  });

  it("proposes create collection without executing", () => {
    const reply = localLibrarianReply("create collection Career Docs");
    assert.match(reply, /Proposed: Create collection/);
    assert.match(reply, /\[\[action:/);
    assert.ok(
      !listCollections().some((c) => c.name === "Career Docs"),
      "must not create before approve",
    );
  });

  it("executes create_collection when confirmed via API path", () => {
    const result = executeLibrarianAction({
      type: "create_collection",
      name: "Fixture Shelf",
    });
    assert.equal(result.ok, true);
    assert.ok(listCollections().some((c) => c.name === "Fixture Shelf"));
  });

  it("approve utterance runs pending actions from last assistant message", () => {
    const reply = localLibrarianReply("approve", { threadId });
    assert.match(reply, /Done|Created collection/i);
    assert.ok(
      listCollections().some((c) => c.name === "Pending Approve Shelf"),
    );
  });

  it("create+place proposes create_collection and collect_by_name without writing", () => {
    const reply = localLibrarianReply(
      "Create a collection titled Outer Space and place pixel.png inside of it",
    );
    assert.match(reply, /Create collection & shelve|Proposed/i);
    assert.match(reply, /create_collection/);
    assert.match(reply, /collect_by_name/);
    assert.ok(
      !listCollections().some((c) => c.name === "Outer Space"),
      "must not create before approve",
    );
  });

  it("approve with no action tokens does not invent success", async () => {
    const { createThread, appendMessage } = await import(
      "@/lib/agent/threads"
    );
    const tid = createThread("hallucination-guard");
    appendMessage({
      threadId: tid,
      role: "assistant",
      content:
        "Collection Outer Space created (id 3). Ready to add the image. Reply approve.",
    });
    const reply = localLibrarianReply("yes", { threadId: tid });
    assert.match(reply, /no pending action tokens/i);
    assert.ok(
      !listCollections().some((c) => c.name === "Outer Space"),
      "must not create when tokens missing",
    );
  });

  it("create then collect_by_name in one batch executes both", () => {
    const hits = searchCatalog({ q: "pixel", pageSize: 1 });
    assert.ok(hits.items[0], "fixture pixel.png should be indexed");
    const itemId = hits.items[0].id;
    const results = executeLibrarianActions([
      { type: "create_collection", name: "Outer Space Batch" },
      {
        type: "collect_by_name",
        itemId,
        collectionName: "Outer Space Batch",
      },
    ]);
    assert.equal(results.every((r) => r.ok), true);
    const col = listCollections().find((c) => c.name === "Outer Space Batch");
    assert.ok(col);
    assert.ok((col.itemCount ?? 0) >= 1);
  });

  it("describeAction surfaces full acquire targets", () => {
    assert.match(
      describeAction({
        type: "acquire_arxiv",
        idOrUrl: "https://arxiv.org/abs/1706.03762",
      }),
      /1706\.03762/,
    );
    assert.match(
      describeAction({
        type: "acquire_youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        mode: "video",
      }),
      /youtube\.com\/watch\?v=dQw4w9WgXcQ/,
    );
    const long = "x".repeat(200);
    const img = describeAction({ type: "acquire_image", prompt: long });
    assert.match(img, /…/);
    assert.ok(img.length < 250);
  });

  it("local proposes arxiv acquire without downloading", () => {
    const reply = localLibrarianReply("fetch arxiv 1706.03762");
    assert.match(reply, /acquire_arxiv/);
    assert.match(reply, /1706\.03762/);
    assert.match(reply, /\[\[action:/);
  });

  it("acquire actions parse from tokens and reject bad ids sync", () => {
    const token = formatActionToken({
      type: "acquire_arxiv",
      idOrUrl: "1706.03762",
    });
    const actions = extractActionsFromText(`Please ${token}`);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, "acquire_arxiv");

    const t0 = Date.now();
    const bad = executeLibrarianAction({
      type: "acquire_arxiv",
      idOrUrl: "not-an-id",
    });
    assert.ok(Date.now() - t0 < 100);
    assert.equal(bad.ok, false);
    assert.match(bad.message, /parse|arxiv/i);
  });

  it("acquire_youtube respects busy lock without starting a second job", async () => {
    const { createAcquireJob, runAcquireJob, isAcquireBusy } = await import(
      "@/lib/acquire/jobs"
    );
    const blocker = createAcquireJob("youtube", "blocker");
    // Keep youtube busy without network: hang work until we finish assert
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    void runAcquireJob(blocker, async () => {
      await gate;
      return { ok: true };
    });
    // brief spin until running/pending
    assert.equal(isAcquireBusy("youtube"), true);

    const t0 = Date.now();
    const result = executeLibrarianAction({
      type: "acquire_youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    assert.ok(Date.now() - t0 < 100);
    assert.equal(result.ok, false);
    assert.match(result.message, /already running/i);
    release();
    await new Promise((r) => setTimeout(r, 20));
  });

  it("void runAcquireJob pattern returns before delayed work (PR4 timing)", async () => {
    const { createAcquireJob, runAcquireJob } = await import(
      "@/lib/acquire/jobs"
    );
    const job = createAcquireJob("arxiv", "timing-test");
    const t0 = Date.now();
    // Same pattern as executeLibrarianAction — never await runAcquireJob
    void runAcquireJob(job, async () => {
      await new Promise((r) => setTimeout(r, 2000));
      return { itemId: 1 };
    });
    const elapsed = Date.now() - t0;
    assert.ok(
      elapsed < 100,
      `void start took ${elapsed}ms — must not await work`,
    );
    assert.ok(getJob(job.id));
  });
});
