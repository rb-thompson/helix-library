import { writeFile } from "node:fs/promises";
import { loadConfig } from "@/lib/config";
import { safeArchivePath } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";

const UA = "HelixLibrary/0.1 (personal OPAC; localhost)";

export type ArxivSearchHit = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  categories: string[];
  absUrl: string;
};

export type ArxivSearchResult = {
  total: number;
  hits: ArxivSearchHit[];
  query: string;
};

/** Parse arXiv id from bare id or common URL forms. */
export function parseArxivId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // https://arxiv.org/abs/1706.03762 or /pdf/1706.03762.pdf
  const urlMatch = raw.match(
    /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i,
  );
  if (urlMatch) return stripVersion(urlMatch[1]);

  // arxiv:1706.03762
  const prefix = raw.match(
    /^arxiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)$/i,
  );
  if (prefix) return stripVersion(prefix[1]);

  // bare modern id
  if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(raw)) return stripVersion(raw);

  // bare legacy id hep-th/9901001
  if (/^[a-z-]+\/\d{7}(v\d+)?$/i.test(raw)) return stripVersion(raw);

  return null;
}

function stripVersion(id: string): string {
  return id.replace(/v\d+$/i, "");
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagText(block: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  const m = block.match(re);
  return m ? decodeXml(m[1]) : "";
}

function allTagTexts(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push(decodeXml(m[1]));
  }
  return out;
}

/**
 * Build arXiv API search_query from free text.
 * Multi-word → all:term1 AND all:term2 (topic/keyword style).
 */
export function buildArxivSearchQuery(raw: string): string {
  const q = raw.trim();
  if (!q) throw new Error("Search query is required");
  // Bare id / id-like string → exact id search
  if (!/\s/.test(q)) {
    const asId = parseArxivId(q);
    if (asId) return `id:${asId}`;
  }
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\w.+-]/g, ""))
    .filter((t) => t.length >= 2);
  if (!terms.length) throw new Error("Enter a keyword or topic (min 2 chars)");
  return terms.map((t) => `all:${t}`).join("+AND+");
}

/**
 * Search arXiv Atom API for keyword/topic hits.
 */
export async function searchArxiv(
  rawQuery: string,
  opts?: { max?: number; start?: number },
): Promise<ArxivSearchResult> {
  const max = Math.min(25, Math.max(1, opts?.max ?? 10));
  const start = Math.max(0, opts?.start ?? 0);
  const searchQuery = buildArxivSearchQuery(rawQuery);
  const url =
    `https://export.arxiv.org/api/query?search_query=${searchQuery}` +
    `&start=${start}&max_results=${max}&sortBy=relevance&sortOrder=descending`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let xml: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
    });
    if (!res.ok) {
      throw new Error(`arXiv search failed (${res.status})`);
    }
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const totalMatch = xml.match(
    /<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/i,
  );
  const total = totalMatch ? Number(totalMatch[1]) : 0;

  const hits: ArxivSearchHit[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let em: RegExpExecArray | null;
  while ((em = entryRe.exec(xml)) !== null) {
    const block = em[1];
    const idRaw = tagText(block, "id");
    const id =
      parseArxivId(idRaw) ||
      parseArxivId(idRaw.replace(/^https?:\/\/arxiv\.org\/abs\//i, ""));
    if (!id) continue;
    const authors = allTagTexts(block, "name");
    const categories = [
      ...block.matchAll(/term="([^"]+)"/g),
    ].map((m) => m[1]);
    const uniqueCats = [...new Set(categories)].slice(0, 6);
    hits.push({
      id,
      title: tagText(block, "title") || id,
      summary: tagText(block, "summary").slice(0, 480),
      authors: authors.slice(0, 8),
      published: tagText(block, "published").slice(0, 10),
      categories: uniqueCats,
      absUrl: `https://arxiv.org/abs/${id}`,
    });
  }

  return { total, hits, query: rawQuery.trim() };
}

export type ArxivAcquireResult = {
  arxivId: string;
  path: string;
  relPath: string;
  bytes: number;
  itemId: number | null;
  tags?: string[];
};

type ProgressCb = (p: {
  stage: string;
  percent: number | null;
  detail?: string;
}) => void;

/**
 * Download arXiv PDF into archive/documents and reindex.
 */
export async function acquireArxivPdf(
  idOrUrl: string,
  onProgress?: ProgressCb,
): Promise<ArxivAcquireResult> {
  const arxivId = parseArxivId(idOrUrl);
  if (!arxivId) {
    throw new Error(
      "Could not parse arXiv id. Try 1706.03762 or an arxiv.org abs/pdf URL.",
    );
  }

  const config = loadConfig();
  const filename = `${arxivId.replace(/\//g, "_")}.pdf`;
  const dest = safeArchivePath("documents", filename);

  onProgress?.({
    stage: "connecting",
    percent: 5,
    detail: `Connecting to arXiv for ${arxivId}…`,
  });

  // Prefer export.arxiv.org (stable CDN-ish)
  const url = `https://export.arxiv.org/pdf/${arxivId}.pdf`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`arXiv download failed (${res.status}) for ${arxivId}`);
  }

  const total = Number(res.headers.get("content-length") || 0);
  onProgress?.({
    stage: "downloading",
    percent: 10,
    detail:
      total > 0
        ? `Downloading PDF (${Math.round(total / 1024)} KB)…`
        : "Downloading PDF…",
  });

  const reader = res.body?.getReader();
  let buf: Buffer;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          const pct = 10 + Math.round((received / total) * 70);
          onProgress?.({
            stage: "downloading",
            percent: Math.min(80, pct),
            detail: `${Math.round(received / 1024)} / ${Math.round(total / 1024)} KB`,
          });
        } else if (received % (256 * 1024) < value.length) {
          onProgress?.({
            stage: "downloading",
            percent: null,
            detail: `${Math.round(received / 1024)} KB received…`,
          });
        }
      }
    }
    buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  } else {
    buf = Buffer.from(await res.arrayBuffer());
    onProgress?.({ stage: "downloading", percent: 80, detail: "Download complete" });
  }

  if (buf.length === 0) throw new Error("Empty PDF from arXiv");
  if (buf.length > config.maxFileBytes) {
    throw new Error(
      `PDF larger than maxFileBytes (${config.maxFileBytes} bytes)`,
    );
  }
  if (buf.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("Download did not look like a PDF");
  }

  onProgress?.({
    stage: "writing",
    percent: 85,
    detail: "Writing to archive…",
  });
  await writeFile(dest, buf);

  onProgress?.({
    stage: "reindexing",
    percent: 92,
    detail: "Indexing & applying tags…",
  });
  const indexed = await indexAfterAcquire(dest, { source: "arxiv" });
  return {
    arxivId,
    path: dest,
    relPath: `documents/${filename}`,
    bytes: buf.length,
    itemId: indexed.itemId,
    tags: indexed.tags,
  };
}
