/**
 * Grokipedia reference holdings — public HTML primary path.
 * URL pattern: https://grokipedia.com/page/{Slug}
 */

import { writeFile } from "node:fs/promises";
import {
  buildClipMarkdownFile,
  htmlToMarkdownArticle,
} from "@/lib/acquire/clip";
import { fetchSafeOutbound } from "@/lib/acquire/outbound";
import { safeArchivePath, slugify } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";
import { setItemCatalogTitle } from "@/lib/catalog/query";
import { addTagToItem } from "@/lib/collections/manage";
import { isCancelRequested } from "@/lib/jobs/store";

const GP_ORIGIN = "https://grokipedia.com";
const MAX_HTML = 2 * 1024 * 1024;
const TIMEOUT_MS = 45_000;
const MIN_BODY = 80;
const UA = "HelixLibrary/0.1 (personal OPAC; localhost; Grokipedia clip)";

export type GrokipediaSearchHit = {
  slug: string;
  title: string;
  url: string;
};

export type GrokipediaAcquireResult = {
  slug: string;
  title: string;
  sourceUrl: string;
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

/** Title or URL → Grokipedia page slug (path segment after /page/). */
export function parseGrokipediaSlug(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const urlMatch = raw.match(
    /grokipedia\.com\/page\/([^/?#]+)/i,
  );
  if (urlMatch) {
    try {
      return decodeURIComponent(urlMatch[1]);
    } catch {
      return urlMatch[1];
    }
  }

  // Bare slug-ish or title
  let s = raw.replace(/^\/?page\//i, "").trim();
  if (!s || /[\s]{0,}https?:/i.test(s)) return null;
  // Titles: spaces → underscores (Grokipedia convention)
  s = s.replace(/\s+/g, "_");
  // Reject path traversal
  if (s.includes("..") || s.includes("/") || s.includes("\\")) return null;
  if (s.length < 1 || s.length > 200) return null;
  return s;
}

export function grokipediaPageUrl(slug: string): string {
  return `${GP_ORIGIN}/page/${slug.split("/").map(encodeURIComponent).join("/")}`;
}

export function titleFromSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).replace(/_/g, " ");
  } catch {
    return slug.replace(/_/g, " ");
  }
}

/**
 * Parse Grokipedia search HTML for /page/ hits.
 */
export function parseGrokipediaSearchHtml(html: string): GrokipediaSearchHit[] {
  const seen = new Set<string>();
  const hits: GrokipediaSearchHit[] = [];
  const re = /href="(\/page\/([^"#?]+))"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let slug: string;
    try {
      slug = decodeURIComponent(m[2]);
    } catch {
      slug = m[2];
    }
    if (seen.has(slug.toLowerCase())) continue;
    seen.add(slug.toLowerCase());
    hits.push({
      slug,
      title: titleFromSlug(slug),
      url: `${GP_ORIGIN}/page/${slug.split("/").map(encodeURIComponent).join("/")}`,
    });
    if (hits.length >= 25) break;
  }
  return hits;
}

export async function searchGrokipedia(
  query: string,
  opts?: { max?: number },
): Promise<{ query: string; hits: GrokipediaSearchHit[] }> {
  const q = query.trim();
  if (!q) throw new Error("Search query is required");
  const max = Math.min(25, Math.max(1, opts?.max ?? 12));

  // If paste is already a page URL / slug, return as single hit
  const asSlug = parseGrokipediaSlug(q);
  if (asSlug && (!/\s/.test(q) || /grokipedia\.com\/page\//i.test(q))) {
    return {
      query: q,
      hits: [
        {
          slug: asSlug,
          title: titleFromSlug(asSlug),
          url: grokipediaPageUrl(asSlug),
        },
      ],
    };
  }

  const url = `${GP_ORIGIN}/search?q=${encodeURIComponent(q)}`;
  const fetched = await fetchSafeOutbound(url, {
    httpsOnly: true,
    timeoutMs: 30_000,
    maxBytes: MAX_HTML,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    },
  });
  const html = fetched.buf.toString("utf8");
  const hits = parseGrokipediaSearchHtml(html).slice(0, max);
  return { query: q, hits };
}

export async function acquireGrokipedia(
  titleOrSlugOrUrl: string,
  onProgress?: ProgressCb,
  opts?: { jobId?: number },
): Promise<GrokipediaAcquireResult> {
  const checkCancel = () => {
    if (opts?.jobId != null && isCancelRequested(opts.jobId)) {
      throw new Error("Cancelled");
    }
  };

  const slug = parseGrokipediaSlug(titleOrSlugOrUrl);
  if (!slug) {
    throw new Error(
      "Could not parse Grokipedia page. Try a title, slug, or grokipedia.com/page/… URL.",
    );
  }
  const pageUrl = grokipediaPageUrl(slug);

  onProgress?.({
    stage: "fetching",
    percent: 10,
    detail: `Fetching Grokipedia ${slug}…`,
  });
  checkCancel();

  const fetched = await fetchSafeOutbound(pageUrl, {
    httpsOnly: true,
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_HTML,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    },
  });

  // Soft 404 pages still return 200 HTML — quality gate catches thin shells
  onProgress?.({
    stage: "extracting",
    percent: 45,
    detail: "Extracting article…",
  });
  checkCancel();

  const html = fetched.buf.toString("utf8");
  if (/page not found|404/i.test(html.slice(0, 2000)) && html.length < 50_000) {
    // still try extract; thin gate below
  }

  const { title, markdown, bodyChars } = htmlToMarkdownArticle(
    html,
    fetched.finalUrl,
  );
  if (bodyChars < MIN_BODY) {
    throw new Error(
      `Could not extract Grokipedia article for "${slug}" (page missing or JS-only shell).`,
    );
  }

  const displayTitle =
    title.replace(/\s*[—–-]\s*Grokipedia\s*$/i, "").trim() ||
    titleFromSlug(slug);

  const acquiredAt = new Date().toISOString();
  const fileBody = buildClipMarkdownFile({
    title: displayTitle,
    sourceUrl: fetched.finalUrl,
    acquiredAt,
    body: markdown,
  });

  const stamp = acquiredAt.replace(/[:.]/g, "-").slice(0, 19);
  const fileSlug = slugify(displayTitle) || slugify(slug) || "article";
  const filename = `grokipedia-${stamp}-${fileSlug}.md`;
  const dest = safeArchivePath("notes", filename);

  onProgress?.({
    stage: "writing",
    percent: 80,
    detail: "Writing note…",
  });
  await writeFile(dest, fileBody, "utf8");

  onProgress?.({
    stage: "reindexing",
    percent: 92,
    detail: "Indexing & applying tags…",
  });
  checkCancel();

  const indexed = await indexAfterAcquire(dest, { source: "grokipedia" });
  if (indexed.itemId != null) {
    try {
      setItemCatalogTitle(indexed.itemId, displayTitle, "grokipedia");
    } catch {
      /* non-fatal */
    }
    try {
      addTagToItem(indexed.itemId, "grokipedia", "acquire");
    } catch {
      /* ignore */
    }
  }

  return {
    slug,
    title: displayTitle,
    sourceUrl: fetched.finalUrl,
    path: dest,
    relPath: `notes/${filename}`,
    bytes: Buffer.byteLength(fileBody, "utf8"),
    itemId: indexed.itemId,
    tags: indexed.tags,
  };
}
