"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Search,
  Video,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

type Caps = {
  archiveRoot: string;
  archiveWritable: boolean;
  ytDlp: boolean;
  ytDlpVersion: string | null;
  grokImage: boolean;
  hasXaiApiKey: boolean;
};

type ResultBox = {
  ok: boolean;
  message: string;
  path?: string;
  itemId?: number | null;
  bytes?: number;
};

type JobProgress = {
  stage: string;
  percent: number | null;
  detail?: string;
};

type ArxivHit = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  categories: string[];
  absUrl: string;
};

export function AcquireDesk({ initialCaps }: { initialCaps: Caps }) {
  const [caps, setCaps] = useState(initialCaps);
  const [arxivMode, setArxivMode] = useState<"search" | "id">("search");
  const [arxivIn, setArxivIn] = useState("");
  const [arxivHits, setArxivHits] = useState<ArxivHit[]>([]);
  const [arxivTotal, setArxivTotal] = useState(0);
  const [arxivSearchErr, setArxivSearchErr] = useState<string | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [ytMode, setYtMode] = useState<"video" | "audio">("video");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<
    null | "arxiv" | "arxiv-search" | "youtube" | "image"
  >(null);
  const [arxivResult, setArxivResult] = useState<ResultBox | null>(null);
  const [ytResult, setYtResult] = useState<ResultBox | null>(null);
  const [imgResult, setImgResult] = useState<ResultBox | null>(null);
  const [arxivProgress, setArxivProgress] = useState<JobProgress | null>(null);
  const [ytProgress, setYtProgress] = useState<JobProgress | null>(null);
  const [imgProgress, setImgProgress] = useState<JobProgress | null>(null);

  const refreshCaps = useCallback(async () => {
    try {
      const res = await fetch("/api/acquire/status");
      const data = await res.json();
      if (data.ok) {
        setCaps({
          archiveRoot: data.archiveRoot,
          archiveWritable: data.archiveWritable,
          ytDlp: data.ytDlp,
          ytDlpVersion: data.ytDlpVersion,
          grokImage: data.grokImage,
          hasXaiApiKey: data.hasXaiApiKey,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshCaps();
  }, [refreshCaps]);

  function setProgress(
    kind: "arxiv" | "youtube" | "image",
    p: JobProgress | null,
  ) {
    if (kind === "arxiv") setArxivProgress(p);
    else if (kind === "youtube") setYtProgress(p);
    else setImgProgress(p);
  }

  async function pollJob(
    jobId: string | number,
    kind: "arxiv" | "youtube" | "image",
    setResult: (r: ResultBox | null) => void,
  ) {
    // YouTube polls faster so % updates feel live
    const maxAttempts = kind === "youtube" ? 1800 : 360; // ~15m / ~3m
    const intervalMs = kind === "youtube" ? 500 : 800;
    let notFoundStreak = 0;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 150 : intervalMs));
      try {
        const res = await fetch(`/api/acquire/jobs/${jobId}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          // Brief race / HMR: retry a few times before failing
          notFoundStreak += 1;
          if (notFoundStreak <= 8) {
            setProgress(kind, {
              stage: "starting",
              percent: 1,
              detail: "Waiting for job…",
            });
            continue;
          }
          setResult({
            ok: false,
            message: data.error ?? "Lost job status (server restart?)",
          });
          return;
        }
        notFoundStreak = 0;
        const job = data.job as {
          status: string;
          error: string | null;
          result: Record<string, unknown> | null;
          progress?: JobProgress;
        };
        if (job.progress) {
          setProgress(kind, {
            stage: job.progress.stage,
            percent: job.progress.percent,
            detail: job.progress.detail,
          });
        }
        if (job.status === "completed") {
          const r = job.result ?? {};
          const vcodec =
            typeof r.videoCodec === "string" ? r.videoCodec : null;
          const hard =
            vcodec &&
            /av1|av01|vp9|vp09/i.test(vcodec);
          const tags = Array.isArray(r.tags)
            ? (r.tags as unknown[]).filter((t) => typeof t === "string")
            : [];
          const tagNote =
            tags.length > 0
              ? ` Tags: ${tags.slice(0, 10).join(", ")}${tags.length > 10 ? "…" : ""}.`
              : "";
          setResult({
            ok: true,
            message: hard
              ? `Saved & reindexed. Codec ${vcodec} may not play in-browser.${tagNote}`
              : `Saved to archive and reindexed.${tagNote}`,
            path: typeof r.path === "string" ? r.path : undefined,
            itemId: typeof r.itemId === "number" ? r.itemId : null,
            bytes: typeof r.bytes === "number" ? r.bytes : undefined,
          });
          void refreshCaps();
          return;
        }
        if (job.status === "failed") {
          setResult({
            ok: false,
            message: job.error ?? "Acquire failed",
          });
          return;
        }
      } catch (e) {
        // Transient poll errors — keep trying a few times
        if (i > maxAttempts - 5) {
          setResult({
            ok: false,
            message: e instanceof Error ? e.message : "Poll failed",
          });
          return;
        }
      }
    }
    setResult({
      ok: false,
      message: "Timed out waiting for job (download may still finish on server)",
    });
  }

  async function post(
    url: string,
    body: Record<string, unknown>,
    kind: "arxiv" | "youtube" | "image",
    setResult: (r: ResultBox | null) => void,
  ) {
    setBusy(kind);
    setResult(null);
    setProgress(kind, {
      stage: "starting",
      percent: 0,
      detail: "Initiating…",
    });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setResult({
          ok: false,
          message: data.error ?? "Acquire failed",
        });
        setProgress(kind, null);
        return;
      }

      // Async job path (arXiv / YT / image) — poll for progress
      if (data.async && data.jobId) {
        if (data.job?.progress) {
          setProgress(kind, data.job.progress as JobProgress);
        }
        await pollJob(String(data.jobId), kind, setResult);
        return;
      }

      // Sync fallback
      const r = (data.result ?? {}) as Record<string, unknown>;
      setResult({
        ok: true,
        message: "Saved to archive and reindexed.",
        path: typeof r.path === "string" ? r.path : undefined,
        itemId: typeof r.itemId === "number" ? r.itemId : null,
        bytes: typeof r.bytes === "number" ? r.bytes : undefined,
      });
      void refreshCaps();
    } catch (e) {
      setResult({
        ok: false,
        message:
          e instanceof Error
            ? e.message === "Failed to fetch" || e.name === "TypeError"
              ? "Network error (connection dropped). For long YT downloads the server should return a job id immediately — try again after refresh."
              : e.message
            : "Request failed",
      });
      setProgress(kind, null);
    } finally {
      setBusy(null);
      setFetchingId(null);
      // Keep last progress briefly on success; clear indeterminate on idle
      setTimeout(() => {
        setProgress(kind, null);
      }, 2500);
    }
  }

  async function searchArxiv() {
    const q = arxivIn.trim();
    if (!q || busy) return;
    setBusy("arxiv-search");
    setArxivSearchErr(null);
    setArxivHits([]);
    setArxivResult(null);
    try {
      const res = await fetch(
        `/api/acquire/arxiv/search?q=${encodeURIComponent(q)}&max=12`,
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setArxivSearchErr(data.error ?? "Search failed");
        return;
      }
      setArxivHits((data.hits as ArxivHit[]) ?? []);
      setArxivTotal(Number(data.total) || 0);
      if (!data.hits?.length) {
        setArxivSearchErr("No papers matched that query.");
      }
    } catch (e) {
      setArxivSearchErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  function fetchArxivId(id: string) {
    setFetchingId(id);
    void post(
      "/api/acquire/arxiv",
      { idOrUrl: id },
      "arxiv",
      setArxivResult,
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="chip chip-stat" title={caps.archiveRoot}>
          <span className="chip-label">Archive</span>
          <span className="chip-value max-w-[12rem] truncate font-mono text-[0.65rem]">
            {caps.archiveRoot}
          </span>
        </span>
        <span
          className={cn(
            "chip chip-stat",
            caps.archiveWritable ? "" : "text-[var(--danger)]",
          )}
        >
          <span className="chip-label">Writable</span>
          <span className="chip-value">{caps.archiveWritable ? "yes" : "no"}</span>
        </span>
        <span className={cn("chip chip-stat", !caps.ytDlp && "opacity-70")}>
          <span className="chip-label">yt-dlp</span>
          <span className="chip-value">
            {caps.ytDlp ? caps.ytDlpVersion ?? "ok" : "missing"}
          </span>
        </span>
        <span className={cn("chip chip-stat", !caps.grokImage && "opacity-70")}>
          <span className="chip-label">Grok image</span>
          <span className="chip-value">
            {caps.grokImage ? "keyed" : "no key"}
          </span>
        </span>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* arXiv — wider when search results need room */}
        <section
          className={cn(
            "surface flex flex-col p-4 sm:p-5",
            arxivHits.length > 0 && "md:col-span-2 xl:col-span-2",
          )}
        >
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                arXiv PDF
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Search by topic or fetch by id →{" "}
                <code className="code-inline">archive/documents/</code>
              </p>
            </div>
          </div>

          <div
            className="segment mt-4 w-full"
            role="group"
            aria-label="arXiv input mode"
          >
            <button
              type="button"
              className={cn("flex-1", arxivMode === "search" && "is-active")}
              onClick={() => setArxivMode("search")}
              disabled={busy !== null}
            >
              Search
            </button>
            <button
              type="button"
              className={cn("flex-1", arxivMode === "id" && "is-active")}
              onClick={() => setArxivMode("id")}
              disabled={busy !== null}
            >
              By id
            </button>
          </div>

          <label className="mt-3 block">
            <span className="label-quiet">
              {arxivMode === "search"
                ? "Keyword or topic"
                : "arXiv id or URL"}
            </span>
            <input
              className="field"
              value={arxivIn}
              onChange={(e) => setArxivIn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (arxivMode === "search") void searchArxiv();
                  else if (arxivIn.trim()) fetchArxivId(arxivIn.trim());
                }
              }}
              placeholder={
                arxivMode === "search"
                  ? "e.g. attention transformers vision"
                  : "1706.03762 or arxiv.org/abs/…"
              }
              disabled={busy !== null || !caps.archiveWritable}
            />
          </label>

          {arxivMode === "search" ? (
            <button
              type="button"
              className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
              disabled={
                busy !== null || !arxivIn.trim() || !caps.archiveWritable
              }
              onClick={() => void searchArxiv()}
            >
              {busy === "arxiv-search" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search arXiv
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
              disabled={
                busy !== null || !arxivIn.trim() || !caps.archiveWritable
              }
              onClick={() => fetchArxivId(arxivIn.trim())}
            >
              {busy === "arxiv" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Fetch PDF
            </button>
          )}

          {arxivSearchErr ? (
            <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
              {arxivSearchErr}
            </p>
          ) : null}

          {arxivHits.length > 0 ? (
            <div className="mt-3 min-h-0">
              <p className="text-xs text-[var(--muted)]">
                <span className="tabular-nums font-medium text-[var(--ink-soft)]">
                  {arxivTotal.toLocaleString()}
                </span>{" "}
                matches · showing {arxivHits.length}. Pick one to fetch.
              </p>
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                {arxivHits.map((hit) => (
                  <li
                    key={hit.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] p-2.5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-[var(--ink)]">
                          {hit.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[0.65rem] text-[var(--muted)]">
                          {hit.id}
                          {hit.published ? ` · ${hit.published}` : ""}
                          {hit.categories[0]
                            ? ` · ${hit.categories.slice(0, 2).join(", ")}`
                            : ""}
                        </p>
                        {hit.authors.length ? (
                          <p className="mt-0.5 truncate text-[0.7rem] text-[var(--muted-faint)]">
                            {hit.authors.join(", ")}
                          </p>
                        ) : null}
                        {hit.summary ? (
                          <p className="mt-1 line-clamp-2 text-[0.7rem] leading-snug text-[var(--ink-soft)]">
                            {hit.summary}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <a
                          href={hit.absUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          Abs
                        </a>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy !== null || !caps.archiveWritable}
                          onClick={() => fetchArxivId(hit.id)}
                        >
                          {fetchingId === hit.id && busy === "arxiv" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Fetch
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ProgressPanel progress={arxivProgress} active={busy === "arxiv"} />
          <ResultPanel result={arxivResult} />
        </section>

        {/* YouTube */}
        <section className="surface flex flex-col p-4 sm:p-5">
          <div className="flex items-start gap-2">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                YouTube / podcast
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Requires <code className="code-inline">yt-dlp</code> (+{" "}
                <code className="code-inline">ffmpeg</code> for merges). Prefers
                H.264/AAC for browser playback →{" "}
                <code className="code-inline">video/</code> or{" "}
                <code className="code-inline">audio/</code>.
              </p>
            </div>
          </div>
          {!caps.ytDlp ? (
            <p className="mt-3 text-xs text-[var(--warn)]">
              yt-dlp not found on PATH. Install it (e.g.{" "}
              <code className="code-inline">pip install yt-dlp</code>) then
              refresh.
            </p>
          ) : null}
          <label className="mt-4 block">
            <span className="label-quiet">Media URL</span>
            <input
              className="field"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={busy !== null || !caps.ytDlp || !caps.archiveWritable}
            />
          </label>
          <div className="mt-3 segment w-full" role="group" aria-label="Mode">
            <button
              type="button"
              className={cn("flex-1", ytMode === "video" && "is-active")}
              onClick={() => setYtMode("video")}
              disabled={busy !== null}
            >
              Video
            </button>
            <button
              type="button"
              className={cn("flex-1", ytMode === "audio" && "is-active")}
              onClick={() => setYtMode("audio")}
              disabled={busy !== null}
            >
              Audio
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
            disabled={
              busy !== null ||
              !ytUrl.trim() ||
              !caps.ytDlp ||
              !caps.archiveWritable
            }
            onClick={() =>
              void post(
                "/api/acquire/youtube",
                { url: ytUrl.trim(), mode: ytMode },
                "youtube",
                setYtResult,
              )
            }
          >
            {busy === "youtube" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy === "youtube" ? "Downloading…" : "Download"}
          </button>
          <ProgressPanel progress={ytProgress} active={busy === "youtube"} />
          <ResultPanel result={ytResult} />
        </section>

        {/* Grok image */}
        <section className="surface flex flex-col p-4 sm:p-5 md:col-span-2 xl:col-span-1">
          <div className="flex items-start gap-2">
            <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                Grok image
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Generate via xAI developer API →{" "}
                <code className="code-inline">archive/images/</code>
              </p>
            </div>
          </div>
          {!caps.grokImage ? (
            <p className="mt-3 text-xs text-[var(--warn)]">
              Set{" "}
              <code className="code-inline">XAI_API_KEY</code> from{" "}
              <a
                href="https://console.x.ai"
                className="link-accent"
                target="_blank"
                rel="noreferrer"
              >
                console.x.ai
              </a>{" "}
              (SuperGrok chat alone is not enough).
            </p>
          ) : null}
          <label className="mt-4 block">
            <span className="label-quiet">Prompt</span>
            <textarea
              className="field min-h-[5.5rem] resize-y"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A phosphor-green CRT displaying a star catalog…"
              disabled={busy !== null || !caps.grokImage || !caps.archiveWritable}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
            disabled={
              busy !== null ||
              !prompt.trim() ||
              !caps.grokImage ||
              !caps.archiveWritable
            }
            onClick={() =>
              void post(
                "/api/acquire/image",
                { prompt: prompt.trim() },
                "image",
                setImgResult,
              )
            }
          >
            {busy === "image" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {busy === "image" ? "Generating…" : "Generate & save"}
          </button>
          <ProgressPanel progress={imgProgress} active={busy === "image"} />
          <ResultPanel result={imgResult} />
        </section>
      </div>

      <p className="text-xs text-[var(--muted-faint)]">
        Personal use only. You are responsible for rights to downloaded media.
        arXiv papers are open access. Files land under your Archive root and are
        reindexed automatically.
      </p>
    </div>
  );
}

function ProgressPanel({
  progress,
  active,
}: {
  progress: JobProgress | null;
  active: boolean;
}) {
  if (!progress || (!active && progress.stage === "done")) return null;
  if (!active && progress.stage === "failed") return null;
  const pct = progress.percent;
  const indeterminate = pct == null;
  return (
    <div
      className="mt-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-2.5"
      role="status"
      aria-live="polite"
      aria-busy={active}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium capitalize text-[var(--ink)]">
          {active ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ok)]" />
          ) : null}
          {progress.stage.replace(/_/g, " ")}
        </span>
        <span className="tabular-nums text-[var(--muted)]">
          {indeterminate ? "…" : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ok)_18%,var(--paper-deep))]">
        <div
          className={cn(
            "h-full rounded-full bg-[var(--ok)] shadow-[0_0_10px_color-mix(in_srgb,var(--ok)_45%,transparent)] transition-[width] duration-300",
            indeterminate && "w-1/3 animate-pulse",
          )}
          style={
            indeterminate
              ? undefined
              : { width: `${Math.max(2, Math.min(100, pct))}%` }
          }
        />
      </div>
      {progress.detail ? (
        <p className="mt-1.5 line-clamp-2 font-mono text-[0.65rem] text-[var(--muted)]">
          {progress.detail}
        </p>
      ) : null}
    </div>
  );
}

function ResultPanel({ result }: { result: ResultBox | null }) {
  if (!result) return null;
  return (
    <div
      className={cn(
        "mt-3 rounded-[var(--radius-sm)] border px-3 py-2 text-xs",
        result.ok
          ? "border-[var(--ok)]/30 bg-[var(--ok-soft)] text-[var(--ink-soft)]"
          : "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]",
      )}
      role="status"
    >
      <p className="flex items-start gap-1.5 font-medium">
        {result.ok ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ok)]" />
        ) : (
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <span>{result.message}</span>
      </p>
      {result.path ? (
        <p className="mt-1 break-all font-mono text-[0.65rem] text-[var(--muted)]">
          {result.path}
          {result.bytes != null ? ` · ${formatBytes(result.bytes)}` : ""}
        </p>
      ) : null}
      {result.itemId ? (
        <Link
          href={`/catalog/${result.itemId}`}
          className="link-accent mt-1.5 inline-flex text-[0.75rem]"
        >
          Open in catalog →
        </Link>
      ) : null}
    </div>
  );
}
