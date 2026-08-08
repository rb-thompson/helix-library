import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPdfDocumentItem,
  isTextReadableItem,
  readingRoomMode,
  supportsReadingRoom,
} from "@/lib/media/reading-room";

describe("reading room mode helpers", () => {
  it("classifies text/code/pdf allowlists", () => {
    assert.equal(isTextReadableItem({ kind: "text", mime: null }), true);
    assert.equal(isTextReadableItem({ kind: "code", mime: null }), true);
    assert.equal(
      isTextReadableItem({ kind: "other", mime: "text/markdown" }),
      true,
    );
    assert.equal(
      isPdfDocumentItem({ kind: "document", mime: "application/pdf", ext: "pdf" }),
      true,
    );
    assert.equal(
      isPdfDocumentItem({ kind: "document", mime: null, ext: "PDF" }),
      true,
    );
    assert.equal(
      isPdfDocumentItem({ kind: "document", mime: "application/msword", ext: "doc" }),
      false,
    );
  });

  it("supportsReadingRoom for text and pdf preview", () => {
    const textItem = {
      kind: "text" as const,
      mime: "text/plain",
      ext: "txt",
      isMissing: 0,
    };
    const pdfItem = {
      kind: "document" as const,
      mime: "application/pdf",
      ext: "pdf",
      isMissing: 0,
    };
    assert.equal(
      supportsReadingRoom(textItem, { type: "text", text: "hi", truncated: false }),
      true,
    );
    assert.equal(
      supportsReadingRoom(pdfItem, { type: "pdf", src: "/api/media/1" }),
      true,
    );
    assert.equal(readingRoomMode(pdfItem, { type: "pdf", src: "/x" }), "pdf");
    assert.equal(
      readingRoomMode(textItem, { type: "text", text: "", truncated: false }),
      "text",
    );
    assert.equal(
      supportsReadingRoom(
        { ...pdfItem, isMissing: 1 },
        { type: "pdf", src: "/x" },
      ),
      false,
    );
    assert.equal(
      supportsReadingRoom(
        { kind: "image", mime: "image/png", ext: "png", isMissing: 0 },
        { type: "image", src: "/x" },
      ),
      false,
    );
  });
});
