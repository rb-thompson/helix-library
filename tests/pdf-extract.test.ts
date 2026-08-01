import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { extractPdfText } from "@/lib/indexer/pdf";
import { isPdfDocument } from "@/lib/indexer/enrich";
import { fixtureRoot } from "./helpers/harness";

describe("extractPdfText", () => {
  const pdfPath = path.join(
    fixtureRoot(),
    "documents",
    "fixture-note.pdf",
  );

  it("extracts text from fixture PDF", async () => {
    const text = await extractPdfText(pdfPath);
    assert.ok(text !== null);
    assert.match(text!, /golden age|fixture PDF/i);
  });

  it("isPdfDocument detects PDFs", () => {
    assert.equal(
      isPdfDocument("document", "application/pdf", pdfPath),
      true,
    );
    assert.equal(isPdfDocument("document", null, pdfPath), true);
    assert.equal(isPdfDocument("document", null, "/x/a.docx"), false);
    assert.equal(isPdfDocument("text", null, "/x/a.txt"), false);
  });
});
