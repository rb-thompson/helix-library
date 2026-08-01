import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const PDF_TEXT_MAX = 40_000;
const PDF_PARSE_MAX_BYTES = 32 * 1024 * 1024; // 32 MiB soft cap for in-process parse

function hasCommand(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function normalizePdfText(raw: string): string {
  let text = raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > PDF_TEXT_MAX) text = text.slice(0, PDF_TEXT_MAX);
  return text;
}

/**
 * Prefer system `pdftotext` (poppler) when present — fast, no large buffer in Node.
 * Fall back to `pdf-parse` (npm). Returns empty string when extraction yields no text,
 * or null when the file could not be processed (caller may skip upsert).
 */
export async function extractPdfText(filePath: string): Promise<string | null> {
  const viaCli = extractWithPdftotext(filePath);
  if (viaCli !== null) return viaCli;

  return extractWithPdfParse(filePath);
}

function extractWithPdftotext(filePath: string): string | null {
  if (!hasCommand("pdftotext")) return null;
  try {
    const out = execFileSync(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", "-q", filePath, "-"],
      {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    return normalizePdfText(out);
  } catch {
    return null;
  }
}

async function extractWithPdfParse(filePath: string): Promise<string | null> {
  try {
    const buf = await readFile(filePath);
    if (buf.length === 0) return "";
    if (buf.length > PDF_PARSE_MAX_BYTES) {
      // Too large for comfortable in-process parse without CLI
      return null;
    }

    const mod = await import("pdf-parse");
    const PDFParse =
      (mod as { PDFParse?: new (opts: { data: Buffer }) => PdfParseInstance })
        .PDFParse ??
      (
        mod as {
          default?: {
            PDFParse?: new (opts: { data: Buffer }) => PdfParseInstance;
          };
        }
      ).default?.PDFParse;

    if (!PDFParse) return null;

    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      const raw =
        typeof result?.text === "string"
          ? result.text
          : Array.isArray(result?.pages)
            ? result.pages.map((p) => p.text ?? "").join("\n")
            : "";
      return normalizePdfText(raw);
    } finally {
      try {
        await parser.destroy?.();
      } catch {
        // ignore cleanup errors
      }
    }
  } catch {
    return null;
  }
}

type PdfParseInstance = {
  getText: () => Promise<{
    text?: string;
    pages?: Array<{ text?: string }>;
  }>;
  destroy?: () => Promise<void>;
};
