import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyKind, extensionOf } from "@/lib/indexer/classify";

describe("classifyKind", () => {
  it("classifies common extensions", () => {
    assert.equal(classifyKind("/x/a.png", "image/png"), "image");
    assert.equal(classifyKind("/x/a.mp4", "video/mp4"), "video");
    assert.equal(classifyKind("/x/a.mp3", "audio/mpeg"), "audio");
    assert.equal(classifyKind("/x/a.pdf", "application/pdf"), "document");
    assert.equal(classifyKind("/x/a.md", "text/markdown"), "text");
    assert.equal(classifyKind("/x/a.py", "text/x-python"), "code");
    assert.equal(classifyKind("/x/a.zip", null), "archive");
  });

  it("prefers mime when extension is odd", () => {
    assert.equal(classifyKind("/x/blob", "image/jpeg"), "image");
    assert.equal(classifyKind("/x/blob", "application/pdf"), "document");
  });

  it("handles special basenames", () => {
    assert.equal(classifyKind("/x/Makefile", null), "code");
    assert.equal(classifyKind("/x/Dockerfile", null), "code");
    assert.equal(classifyKind("/x/LICENSE", null), "text");
    assert.equal(classifyKind("/x/README", null), "text");
  });
});

describe("extensionOf", () => {
  it("returns lowercase ext without dot", () => {
    assert.equal(extensionOf("/a/b/C.PDF"), "pdf");
    assert.equal(extensionOf("/a/b/noext"), null);
  });
});
