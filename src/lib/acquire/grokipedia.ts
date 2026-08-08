/**
 * Grokipedia reference holdings — public HTML primary path.
 * URL pattern: https://grokipedia.com/page/{Slug}
 *
 * Language: prefer English. Search often returns non-canonical slugs
 * (e.g. Artificial_Intelligence) that are wiki redirects or non-English
 * mirrors; we follow #REDIRECT and fall back to MediaWiki-style slug casing.
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

/** Prefer English article body over locale mirrors. */
const GP_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  "Accept-Language": "en-US,en;q=0.9",
};

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

  const urlMatch = raw.match(/grokipedia\.com\/page\/([^/?#]+)/i);
  if (urlMatch) {
    try {
      return decodeURIComponent(urlMatch[1]);
    } catch {
      return urlMatch[1];
    }
  }

  let s = raw.replace(/^\/?page\//i, "").trim();
  if (!s || /[\s]{0,}https?:/i.test(s)) return null;
  s = s.replace(/\s+/g, "_");
  if (s.includes("..") || s.includes("/") || s.includes("\\")) return null;
  if (s.length < 1 || s.length > 200) return null;
  return s;
}

export function grokipediaPageUrl(slug: string): string {
  return `${GP_ORIGIN}/page/${slug
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function titleFromSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).replace(/_/g, " ");
  } catch {
    return slug.replace(/_/g, " ");
  }
}

/**
 * MediaWiki-style primary title: first character upper, remainder lower.
 * Artificial_Intelligence → Artificial_intelligence (English canonical often).
 */
export function mediaWikiPrimarySlug(slug: string): string {
  let s: string;
  try {
    s = decodeURIComponent(slug);
  } catch {
    s = slug;
  }
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Parse wiki #REDIRECT targets from Grokipedia HTML or extracted markdown.
 * Returns destination slug or null.
 */
export function extractGrokipediaRedirect(htmlOrMd: string): string | null {
  // [title](https://grokipedia.com/page/Slug) after REDIRECT
  const mdUrl = htmlOrMd.match(
    /#\s*REDIRECT\b[^\n]{0,200}?grokipedia\.com\/page\/([^)\s"'<>]+)/i,
  );
  if (mdUrl) {
    try {
      return decodeURIComponent(mdUrl[1].replace(/\/$/, ""));
    } catch {
      return mdUrl[1].replace(/\/$/, "");
    }
  }

  // href="/page/Slug" near REDIRECT
  const href = htmlOrMd.match(
    /#\s*REDIRECT\b[\s\S]{0,400}?href=["']\/page\/([^"'#?]+)/i,
  );
  if (href) {
    try {
      return decodeURIComponent(href[1]);
    } catch {
      return href[1];
    }
  }

  // [[Artificial intelligence]] after REDIRECT
  const wiki = htmlOrMd.match(/#\s*REDIRECT\s*\[\[([^\]]+)\]\]/i);
  if (wiki) {
    const title = wiki[1].split("|")[0]?.trim() ?? "";
    if (title) return title.replace(/\s+/g, "_");
  }

  // Bare REDIRECT Title
  const bare = htmlOrMd.match(
    /#\s*REDIRECT\s+\[?\[?([A-Za-z0-9][A-Za-z0-9 _()-]{1,120})\]?\]?/i,
  );
  if (bare) {
    const t = bare[1].trim();
    if (t && !/^https?:/i.test(t)) return t.replace(/\s+/g, "_");
  }

  return null;
}

/**
 * Heuristic: body reads more like French (or other Romance) than English.
 * Used to reject wrong-language mirrors after a bad slug.
 */
export function looksNonEnglishBody(text: string): boolean {
  const sample = text.slice(0, 12_000).toLowerCase();
  const fr = (
    sample.match(
      /\b(les|des|une|est|dans|pour|avec|sur|histoire|origines|selon|ainsi|cette|être|aussi|mais)\b/g,
    ) ?? []
  ).length;
  const en = (
    sample.match(
      /\b(the|and|of|to|in|is|for|that|with|history|from|are|was|as|by)\b/g,
    ) ?? []
  ).length;
  if (fr + en < 12) return false;
  return fr >= 8 && fr > en * 0.45;
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
      url: grokipediaPageUrl(slug),
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
    headers: GP_HEADERS,
  });
  const html = fetched.buf.toString("utf8");
  const hits = parseGrokipediaSearchHtml(html).slice(0, max);
  return { query: q, hits };
}

async function fetchGrokipediaHtml(slug: string): Promise<{
  slug: string;
  html: string;
  finalUrl: string;
}> {
  const pageUrl = grokipediaPageUrl(slug);
  const fetched = await fetchSafeOutbound(pageUrl, {
    httpsOnly: true,
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_HTML,
    headers: GP_HEADERS,
  });
  return {
    slug,
    html: fetched.buf.toString("utf8"),
    finalUrl: fetched.finalUrl,
  };
}

/**
 * Resolve page HTML preferring English: follow #REDIRECT, then MediaWiki slug.
 */
export async function resolveGrokipediaPageHtml(
  initialSlug: string,
  onProgress?: ProgressCb,
): Promise<{
  slug: string;
  html: string;
  finalUrl: string;
  title: string;
  markdown: string;
  bodyChars: number;
}> {
  // Grokipedia paths are case-sensitive (Artificial_Intelligence ≠ Artificial_intelligence).
  // Track exact slugs tried — do not fold case.
  const tried = new Set<string>();
  let slug = initialSlug;
  let hops = 0;
  const maxHops = 4;

  while (hops < maxHops) {
    hops += 1;
    if (tried.has(slug)) break;
    tried.add(slug);

    onProgress?.({
      stage: "fetching",
      percent: 8 + hops * 12,
      detail: `Fetching Grokipedia ${slug}…`,
    });

    const page = await fetchGrokipediaHtml(slug);

    // Wiki soft-redirect (often non-English body still present on the stub)
    const redir = extractGrokipediaRedirect(page.html);
    if (redir && redir !== slug && !tried.has(redir)) {
      onProgress?.({
        stage: "resolving",
        percent: 20 + hops * 10,
        detail: `Following redirect → ${redir}`,
      });
      slug = redir;
      continue;
    }

    onProgress?.({
      stage: "extracting",
      percent: 45,
      detail: "Extracting article…",
    });

    const extracted = htmlToMarkdownArticle(page.html, page.finalUrl);
    if (extracted.bodyChars < MIN_BODY) {
      const alt = mediaWikiPrimarySlug(initialSlug);
      if (alt !== slug && !tried.has(alt)) {
        slug = alt;
        continue;
      }
      throw new Error(
        `Could not extract Grokipedia article for "${initialSlug}" (page missing or JS-only shell).`,
      );
    }

    if (looksNonEnglishBody(extracted.markdown)) {
      const alt = mediaWikiPrimarySlug(slug);
      if (alt !== slug && !tried.has(alt)) {
        onProgress?.({
          stage: "resolving",
          percent: 50,
          detail: "Non-English body detected; trying English slug…",
        });
        slug = alt;
        continue;
      }
      const alt0 = mediaWikiPrimarySlug(initialSlug);
      if (alt0 !== slug && !tried.has(alt0)) {
        slug = alt0;
        continue;
      }
      throw new Error(
        `Grokipedia page "${slug}" is not in English (locale mirror or redirect stub). Try the English slug, e.g. Artificial_intelligence.`,
      );
    }

    const displayTitle =
      extracted.title.replace(/\s*[—–-]\s*Grokipedia\s*$/i, "").trim() ||
      titleFromSlug(slug);

    // Clean underscore titles from bad stubs
    const cleanTitle = displayTitle.includes("_")
      ? titleFromSlug(displayTitle.replace(/\s+/g, "_"))
      : displayTitle;

    return {
      slug,
      html: page.html,
      finalUrl: page.finalUrl,
      title: cleanTitle,
      markdown: extracted.markdown,
      bodyChars: extracted.bodyChars,
    };
  }

  throw new Error(
    `Could not resolve an English Grokipedia page for "${initialSlug}".`,
  );
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

  const slugIn = parseGrokipediaSlug(titleOrSlugOrUrl);
  if (!slugIn) {
    throw new Error(
      "Could not parse Grokipedia page. Try a title, slug, or grokipedia.com/page/… URL.",
    );
  }

  checkCancel();
  const resolved = await resolveGrokipediaPageHtml(slugIn, onProgress);
  checkCancel();

  const acquiredAt = new Date().toISOString();
  const fileBody = buildClipMarkdownFile({
    title: resolved.title,
    sourceUrl: resolved.finalUrl,
    acquiredAt,
    body: resolved.markdown,
  });

  const stamp = acquiredAt.replace(/[:.]/g, "-").slice(0, 19);
  const fileSlug =
    slugify(resolved.title) || slugify(resolved.slug) || "article";
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
      setItemCatalogTitle(indexed.itemId, resolved.title, "grokipedia");
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
    slug: resolved.slug,
    title: resolved.title,
    sourceUrl: resolved.finalUrl,
    path: dest,
    relPath: `notes/${filename}`,
    bytes: Buffer.byteLength(fileBody, "utf8"),
    itemId: indexed.itemId,
    tags: indexed.tags,
  };
}
