import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  extractActionsFromText,
  formatActionToken,
  isConfirmUtterance,
  isCancelUtterance,
  executeLibrarianAction,
  parseLegacyPropose,
} from "@/lib/agent/actions";
import { localLibrarianReply } from "@/lib/agent/local";
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
});
