import { writeFile } from "node:fs/promises";
import { loadConfig } from "@/lib/config";
import { fetchSafeOutbound } from "@/lib/acquire/outbound";
import { safeArchivePath, sanitizeFilename } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";
import { setItemCatalogTitle } from "@/lib/catalog/query";
import { addTagToItem } from "@/lib/collections/manage";
import { valueToTagName } from "@/lib/acquire/auto-tags";
import { isCancelRequested } from "@/lib/jobs/store";

const OPENALEX_BASE = "https://api.openalex.org";
const OA_PDF_CAP = 100 * 1024 * 1024;
const SETTINGS_HINT =
  "Free OpenAlex API key recommended — https://openalex.org/settings/api";

export type OpenAlexHit = {
  id: string;
  doi: string | null;
  title: string;
  abstract: string;
  authors: string[];
  year: number | null;
  citedBy: number;
  oaStatus: string | null;
  isOa: boolean;
  pdfUrl: string | null;
  landingUrl: string | null;
  concepts: string[];
  openAlexUrl: string;
};

export type OpenAlexSearchResult = {
  total: number;
  hits: OpenAlexHit[];
  query: string;
};

export type OpenAlexAcquireResult = {
  openAlexId: string;
  doi: string | null;
  path: string;
  relPath: string;
  bytes: number;
  itemId: number | null;
  tags?: string[];
  title: string;
};

type ProgressCb = (p: {
  stage: string;
  percent: number | null;
  detail?: string;
}) => void;

/** OpenAlex work JSON (partial). */
export type OpenAlexWorkJson = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number;
  is_oa?: boolean;
  open_access?: { is_oa?: boolean; oa_status?: string | null };
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  oa_locations?: OpenAlexLocation[] | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  concepts?: Array<{ display_name?: string; score?: number }>;
};

type OpenAlexLocation = {
  is_oa?: boolean;
  pdf_url?: string | null;
  landing_page_url?: string | null;
};

export function openAlexApiKey(): string | undefined {
  // Env-only — keep free of side effects so callers can stay lightweight
  return (
    process.env.NON_OS_OPENALEX_API_KEY?.trim() ||
    process.env.OPENALEX_API_KEY?.trim() ||
    undefined
  );
}

function openAlexHeaders(): HeadersInit {
  const mailto = process.env.NON_OS_OPENALEX_MAILTO?.trim();
  const ua = mailto
    ? `HelixLibrary/0.1 (personal OPAC; mailto:${mailto})`
    : `HelixLibrary/0.1 (personal OPAC; localhost)`;
  return { "User-Agent": ua, Accept: "application/json" };
}

function withApiKey(url: URL): URL {
  const key = openAlexApiKey();
  if (key) url.searchParams.set("api_key", key);
  return url;
}

function mapOpenAlexHttpError(status: number, body: string): Error {
  const slice = body.slice(0, 400);
  if ([401, 402, 403, 409, 429].includes(status)) {
    return new Error(
      `OpenAlex API ${status}: ${slice || "rate/credit limit"}. ${SETTINGS_HINT}`,
    );
  }
  return new Error(
    `OpenAlex API failed (${status}): ${slice || "unknown error"}`,
  );
}

/** Pure — unit-test with small fixture */
export function reconstructAbstract(
  inverted: Record<string, number[]> | null | undefined,
  maxChars = 480,
): string {
  if (!inverted) return "";
  const positions: { pos: number; word: string }[] = [];
  for (const [word, idxs] of Object.entries(inverted)) {
    if (!Array.isArray(idxs)) continue;
    for (const i of idxs) {
      if (typeof i === "number") positions.push({ pos: i, word });
    }
  }
  positions.sort((a, b) => a.pos - b.pos);
  const text = positions.map((p) => p.word).join(" ");
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

/**
 * Prefer best_oa_location.pdf_url, then primary_location.pdf_url,
 * then first oa_locations[].pdf_url. Only https URLs.
 */
export function resolveOaPdfUrl(work: OpenAlexWorkJson): string | null {
  const candidates: (string | null | undefined)[] = [
    work.best_oa_location?.pdf_url,
    work.primary_location?.pdf_url,
    ...(work.oa_locations ?? []).map((l) => l?.pdf_url),
  ];
  for (const u of candidates) {
    if (!u || typeof u !== "string") continue;
    const t = u.trim();
    if (!t) continue;
    try {
      const parsed = new URL(t);
      if (parsed.protocol === "https:") return t;
    } catch {
      continue;
    }
  }
  return null;
}

export function shortOpenAlexId(raw: string): string {
  const s = raw.trim();
  const m = s.match(/(W\d+)\s*$/i) || s.match(/openalex\.org\/works\/(W\d+)/i);
  if (m) return m[1].toUpperCase();
  if (/^W\d+$/i.test(s)) return s.toUpperCase();
  return s;
}

export function parseDoi(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  raw = raw.replace(/^doi:\s*/i, "");
  raw = raw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  raw = raw.trim();
  // OpenAlex often stores doi as https://doi.org/10....
  if (/^10\.\d{4,9}\/\S+$/i.test(raw)) {
    return raw.replace(/[.,;)\]]+$/, "");
  }
  return null;
}

export function parseOpenAlexWorkId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const fromUrl = raw.match(/openalex\.org\/works\/(W\d+)/i);
  if (fromUrl) return fromUrl[1].toUpperCase();
  if (/^W\d+$/i.test(raw)) return raw.toUpperCase();
  return null;
}

export function normalizeOpenAlexInput(
  input: string,
):
  | { type: "doi"; doi: string }
  | { type: "work"; id: string }
  | { type: "search"; q: string } {
  const t = input.trim();
  if (!t) throw new Error("Query is required");
  const work = parseOpenAlexWorkId(t);
  if (work) return { type: "work", id: work };
  const doi = parseDoi(t);
  if (doi) return { type: "doi", doi };
  // Also accept openalex.org full id as doi-looking failures
  if (/^https?:\/\/doi\.org\//i.test(t)) {
    const d = parseDoi(t);
    if (d) return { type: "doi", doi: d };
  }
  return { type: "search", q: t };
}

function workToHit(work: OpenAlexWorkJson): OpenAlexHit | null {
  const idRaw = work.id ?? "";
  const id = shortOpenAlexId(idRaw);
  if (!id || !/^W\d+$/i.test(id)) return null;

  let doi: string | null = null;
  if (work.doi) {
    doi = parseDoi(work.doi) ?? work.doi.replace(/^https?:\/\/doi\.org\//i, "");
  }

  const title =
    (work.title || work.display_name || "").trim() || id;
  const isOa = Boolean(
    work.is_oa ?? work.open_access?.is_oa ?? work.best_oa_location,
  );
  const pdfUrl = resolveOaPdfUrl(work);
  const landingUrl =
    work.best_oa_location?.landing_page_url ||
    work.primary_location?.landing_page_url ||
    null;

  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 12);

  const concepts = (work.concepts ?? [])
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((c) => c.display_name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 8);

  return {
    id,
    doi,
    title,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    authors,
    year: work.publication_year ?? null,
    citedBy: work.cited_by_count ?? 0,
    oaStatus: work.open_access?.oa_status ?? null,
    isOa,
    pdfUrl,
    landingUrl,
    concepts,
    openAlexUrl: `https://openalex.org/works/${id}`,
  };
}

async function fetchOpenAlexJson(url: URL): Promise<unknown> {
  withApiKey(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url.href, {
      signal: controller.signal,
      headers: openAlexHeaders(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw mapOpenAlexHttpError(res.status, body);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchOpenAlex(
  rawQuery: string,
  opts?: { max?: number },
): Promise<OpenAlexSearchResult> {
  const q = rawQuery.trim();
  if (!q) throw new Error("Search query is required");
  const max = Math.min(25, Math.max(1, opts?.max ?? 10));

  // If paste is DOI/work id, return single work as search result
  const norm = normalizeOpenAlexInput(q);
  if (norm.type === "doi" || norm.type === "work") {
    const work = await getOpenAlexWork(norm.type === "doi" ? norm.doi : norm.id);
    const hit = workToHit(work);
    return {
      total: hit ? 1 : 0,
      hits: hit ? [hit] : [],
      query: q,
    };
  }

  const url = new URL(`${OPENALEX_BASE}/works`);
  url.searchParams.set("search", norm.q);
  url.searchParams.set("per_page", String(max));
  url.searchParams.set(
    "select",
    [
      "id",
      "doi",
      "title",
      "display_name",
      "publication_year",
      "cited_by_count",
      "is_oa",
      "open_access",
      "abstract_inverted_index",
      "primary_location",
      "best_oa_location",
      "oa_locations",
      "authorships",
      "concepts",
    ].join(","),
  );

  const data = (await fetchOpenAlexJson(url)) as {
    meta?: { count?: number };
    results?: OpenAlexWorkJson[];
  };
  const hits: OpenAlexHit[] = [];
  for (const w of data.results ?? []) {
    const h = workToHit(w);
    if (h) hits.push(h);
  }
  return {
    total: data.meta?.count ?? hits.length,
    hits,
    query: q,
  };
}

export async function getOpenAlexWork(
  idOrDoi: string,
): Promise<OpenAlexWorkJson> {
  const norm = normalizeOpenAlexInput(idOrDoi);
  let path: string;
  if (norm.type === "doi") {
    path = `/works/https://doi.org/${norm.doi}`;
  } else if (norm.type === "work") {
    path = `/works/${norm.id}`;
  } else {
    throw new Error(
      "Paste a DOI or OpenAlex work id (W…), or pick a search hit.",
    );
  }
  const url = new URL(`${OPENALEX_BASE}${path}`);
  return (await fetchOpenAlexJson(url)) as OpenAlexWorkJson;
}

function filenameForWork(hit: OpenAlexHit): string {
  if (hit.doi) {
    const slug = sanitizeFilename(
      hit.doi.replace(/\//g, "_").replace(/[^a-zA-Z0-9._+-]+/g, "_"),
    );
    if (slug) return `${slug.slice(0, 160)}.pdf`;
  }
  return `openalex-${hit.id}.pdf`;
}

export async function acquireOpenAlexPdf(
  idOrDoiOrUrl: string,
  onProgress?: ProgressCb,
  opts?: { jobId?: number },
): Promise<OpenAlexAcquireResult> {
  const checkCancel = () => {
    if (opts?.jobId != null && isCancelRequested(opts.jobId)) {
      throw new Error("Cancelled");
    }
  };

  onProgress?.({
    stage: "resolving",
    percent: 5,
    detail: "Looking up work in OpenAlex…",
  });
  checkCancel();

  const work = await getOpenAlexWork(idOrDoiOrUrl);
  const hit = workToHit(work);
  if (!hit) throw new Error("OpenAlex returned an unusable work record");

  const pdfUrl = hit.pdfUrl;
  if (!pdfUrl) {
    throw new Error(
      hit.isOa
        ? "OpenAlex marks this OA but has no direct https PDF URL. Open the landing page in a browser."
        : "No open-access PDF URL in OpenAlex for this work.",
    );
  }

  const config = loadConfig();
  const maxBytes = Math.min(config.maxFileBytes, OA_PDF_CAP);
  const filename = filenameForWork(hit);
  const dest = safeArchivePath("documents", filename);

  onProgress?.({
    stage: "downloading",
    percent: 15,
    detail: "Downloading OA PDF…",
  });
  checkCancel();

  const fetched = await fetchSafeOutbound(pdfUrl, {
    httpsOnly: true,
    timeoutMs: 120_000,
    maxBytes,
    headers: {
      "User-Agent": "HelixLibrary/0.1 (personal OPAC; localhost)",
      Accept: "application/pdf,*/*",
    },
    onProgress: (received, total) => {
      if (total && total > 0) {
        const pct = 15 + Math.round((received / total) * 65);
        onProgress?.({
          stage: "downloading",
          percent: Math.min(80, pct),
          detail: `${Math.round(received / 1024)} / ${Math.round(total / 1024)} KB`,
        });
      } else {
        onProgress?.({
          stage: "downloading",
          percent: null,
          detail: `${Math.round(received / 1024)} KB received…`,
        });
      }
    },
  });

  checkCancel();
  const buf = fetched.buf;
  if (buf.length === 0) throw new Error("Empty PDF download");
  if (buf.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("Download did not look like a PDF (missing %PDF- magic)");
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
  checkCancel();

  const indexed = await indexAfterAcquire(dest, { source: "openalex" });

  if (indexed.itemId != null) {
    try {
      if (hit.title && hit.title !== hit.id) {
        setItemCatalogTitle(indexed.itemId, hit.title, "openalex");
      }
    } catch {
      /* non-fatal */
    }

    // DOI + concepts (best-effort)
    try {
      if (hit.doi) {
        const doiTag = `doi:${hit.doi}`;
        if (doiTag.length <= 48) {
          addTagToItem(indexed.itemId, doiTag, "acquire");
        } else {
          addTagToItem(indexed.itemId, "doi", "acquire");
        }
      }
      for (const c of hit.concepts.slice(0, 5)) {
        const t = valueToTagName(c);
        if (t) addTagToItem(indexed.itemId, t, "acquire");
      }
    } catch {
      /* ignore */
    }
  }

  const tags = indexed.tags ?? [];
  return {
    openAlexId: hit.id,
    doi: hit.doi,
    path: dest,
    relPath: `documents/${filename}`,
    bytes: buf.length,
    itemId: indexed.itemId,
    tags,
    title: hit.title,
  };
}

