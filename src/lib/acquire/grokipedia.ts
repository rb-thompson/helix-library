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
 * True only for inputs that clearly name a page path — not free-text titles.
 * Bare words like "Palantir" must go through search (real page is often
 * Palantir_Technologies); treating them as slugs causes 404s.
 */
export function looksLikeExactGrokipediaSlug(input: string): boolean {
  const raw = input.trim();
  if (!raw) return false;
  if (/grokipedia\.com\/page\//i.test(raw)) return true;
  if (/^\/?page\//i.test(raw)) return true;
  // Underscore / wiki disambiguation → already a slug form
  if (/[_(]/.test(raw) && !/\s/.test(raw)) return true;
  return false;
}

function decodeHrefSlug(raw: string): string {
  let s = raw.replace(/&amp;/g, "&").replace(/&#38;/g, "&");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  return s;
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
    const slug = decodeHrefSlug(m[2]);
    if (!slug || seen.has(slug.toLowerCase())) continue;
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

/** Rank search hits so "Palantir" prefers Palantir_Technologies over weak matches. */
export function rankGrokipediaHits(
  hits: GrokipediaSearchHit[],
  query: string,
): GrokipediaSearchHit[] {
  const q = query.trim().toLowerCase();
  const qSlug = q.replace(/\s+/g, "_");
  const score = (h: GrokipediaSearchHit): number => {
    const s = h.slug.toLowerCase();
    const t = h.title.toLowerCase();
    let sc = 0;
    if (s === qSlug || t === q) sc = 100;
    else if (t.startsWith(`${q} `) || t.startsWith(`${q},`)) sc = 88;
    else if (s.startsWith(`${qSlug}_`)) sc = 72;
    else if (s.includes(qSlug) || t.includes(q)) sc = 40;
    else sc = 10;

    // Comparison / list pages are rarely what "Fetch" means
    if (/^comparison_of_|^companies_similar_to_/i.test(s)) sc -= 35;
    // Hyphenated partials (Tar-Palantir) below primary Query_* pages
    if (s.includes("-") && !s.startsWith(`${qSlug}_`)) sc -= 15;
    // Prefer fewer extra slug segments: Technologies (1) > RSU_sales (2)
    if (s.startsWith(`${qSlug}_`)) {
      const rest = s.slice(qSlug.length + 1);
      sc -= Math.min(18, rest.split("_").filter(Boolean).length * 4);
    }
    // Entity-ish disambiguators
    if (
      /\b(technologies|technology|company|inc\.?|corp\.?|corporation|organization|group)\b/i.test(
        t,
      )
    ) {
      sc += 14;
    }
    return sc;
  };
  return hits
    .map((h, index) => ({ h, index, sc: score(h) }))
    .sort((a, b) => b.sc - a.sc || a.index - b.index)
    .map((x) => x.h);
}

export async function searchGrokipedia(
  query: string,
  opts?: { max?: number },
): Promise<{ query: string; hits: GrokipediaSearchHit[] }> {
  const q = query.trim();
  if (!q) throw new Error("Search query is required");
  const max = Math.min(25, Math.max(1, opts?.max ?? 12));

  // Exact URL / explicit wiki slug only — never skip search for bare titles
  if (looksLikeExactGrokipediaSlug(q)) {
    const asSlug = parseGrokipediaSlug(q);
    if (asSlug) {
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
  }

  const url = `${GP_ORIGIN}/search?q=${encodeURIComponent(q)}`;
  const fetched = await fetchSafeOutbound(url, {
    httpsOnly: true,
    timeoutMs: 30_000,
    maxBytes: MAX_HTML,
    headers: GP_HEADERS,
  });
  const html = fetched.buf.toString("utf8");
  const hits = rankGrokipediaHits(parseGrokipediaSearchHtml(html), q).slice(
    0,
    max,
  );
  return { query: q, hits };
}

export class GrokipediaNotFoundError extends Error {
  constructor(slug: string) {
    super(`Grokipedia page not found: ${slug}`);
    this.name = "GrokipediaNotFoundError";
  }
}

async function fetchGrokipediaHtml(slug: string): Promise<{
  slug: string;
  html: string;
  finalUrl: string;
}> {
  const pageUrl = grokipediaPageUrl(slug);
  try {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/\(404\)/.test(msg) || /\b404\b/.test(msg)) {
      throw new GrokipediaNotFoundError(slug);
    }
    throw e;
  }
}

type ResolvedPage = {
  slug: string;
  html: string;
  finalUrl: string;
  title: string;
  markdown: string;
  bodyChars: number;
};

/**
 * Resolve page HTML preferring English: follow #REDIRECT, then MediaWiki slug.
 */
export async function resolveGrokipediaPageHtml(
  initialSlug: string,
  onProgress?: ProgressCb,
  opts?: { searchFallbackQuery?: string },
): Promise<ResolvedPage> {
  // Grokipedia paths are case-sensitive (Artificial_Intelligence ≠ Artificial_intelligence).
  // Track exact slugs tried — do not fold case.
  const tried = new Set<string>();
  const queue: string[] = [initialSlug];
  let hops = 0;
  const maxHops = 8;
  let last404: string | null = null;

  while (queue.length > 0 && hops < maxHops) {
    hops += 1;
    const slug = queue.shift()!;
    if (tried.has(slug)) continue;
    tried.add(slug);

    onProgress?.({
      stage: "fetching",
      percent: 8 + hops * 8,
      detail: `Fetching Grokipedia ${slug}…`,
    });

    let page: { slug: string; html: string; finalUrl: string };
    try {
      page = await fetchGrokipediaHtml(slug);
    } catch (e) {
      if (e instanceof GrokipediaNotFoundError) {
        last404 = slug;
        // MediaWiki casing before search fallback
        const alt = mediaWikiPrimarySlug(slug);
        if (alt !== slug && !tried.has(alt)) queue.push(alt);
        continue;
      }
      throw e;
    }

    // Wiki soft-redirect (often non-English body still present on the stub)
    const redir = extractGrokipediaRedirect(page.html);
    if (redir && redir !== slug && !tried.has(redir)) {
      onProgress?.({
        stage: "resolving",
        percent: 20 + hops * 6,
        detail: `Following redirect → ${redir}`,
      });
      queue.unshift(redir);
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
      if (alt !== slug && !tried.has(alt)) queue.push(alt);
      continue;
    }

    if (looksNonEnglishBody(extracted.markdown)) {
      const alt = mediaWikiPrimarySlug(slug);
      if (alt !== slug && !tried.has(alt)) {
        onProgress?.({
          stage: "resolving",
          percent: 50,
          detail: "Non-English body detected; trying English slug…",
        });
        queue.unshift(alt);
        continue;
      }
      const alt0 = mediaWikiPrimarySlug(initialSlug);
      if (alt0 !== slug && !tried.has(alt0)) {
        queue.push(alt0);
        continue;
      }
      // fall through to search fallback below
      last404 = slug;
      break;
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

  // Search fallback: bare titles (Palantir) and missing slugs
  const q = (opts?.searchFallbackQuery ?? initialSlug.replace(/_/g, " ")).trim();
  if (q) {
    onProgress?.({
      stage: "searching",
      percent: 55,
      detail: `Page missing; searching Grokipedia for “${q}”…`,
    });
    const { hits } = await searchGrokipedia(q, { max: 8 });
    for (const hit of hits) {
      if (tried.has(hit.slug)) continue;
      try {
        return await resolveGrokipediaPageHtml(hit.slug, onProgress, {
          // prevent infinite search loops
          searchFallbackQuery: "",
        });
      } catch {
        tried.add(hit.slug);
        continue;
      }
    }
  }

  throw new Error(
    last404
      ? `Grokipedia page not found for “${initialSlug}” (404 on ${last404}). Search returned no fetchable English article.`
      : `Could not resolve an English Grokipedia page for "${initialSlug}".`,
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

  const raw = titleOrSlugOrUrl.trim();
  if (!raw) {
    throw new Error(
      "Could not parse Grokipedia page. Try a title, slug, or grokipedia.com/page/… URL.",
    );
  }

  // Free-text titles: resolve via search first (avoid treating "Palantir" as a slug)
  let slugIn: string;
  let searchFallback = raw;
  if (looksLikeExactGrokipediaSlug(raw)) {
    const parsed = parseGrokipediaSlug(raw);
    if (!parsed) {
      throw new Error(
        "Could not parse Grokipedia page. Try a title, slug, or grokipedia.com/page/… URL.",
      );
    }
    slugIn = parsed;
    searchFallback = titleFromSlug(parsed);
  } else {
    onProgress?.({
      stage: "searching",
      percent: 5,
      detail: `Searching Grokipedia for “${raw}”…`,
    });
    checkCancel();
    const { hits } = await searchGrokipedia(raw, { max: 8 });
    if (!hits.length) {
      throw new Error(
        `No Grokipedia pages matched “${raw}”. Try a more specific title.`,
      );
    }
    slugIn = hits[0]!.slug;
    searchFallback = raw;
    onProgress?.({
      stage: "resolving",
      percent: 12,
      detail: `Best match: ${hits[0]!.title} (${slugIn})`,
    });
  }

  checkCancel();
  const resolved = await resolveGrokipediaPageHtml(slugIn, onProgress, {
    searchFallbackQuery: searchFallback,
  });
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
