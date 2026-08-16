"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  FileText,
  Globe,
  ImageIcon,
  Search,
  Video,
  XCircle,
} from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import {
  AcquireModuleCard,
  type AcquireModuleId,
} from "@/components/AcquireModuleCard";
import { toast } from "@/components/ui/Feedback";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import type { AcquireTarget } from "@/lib/acquire/paths";

type Caps = {
  archiveRoot: string;
  archiveWritable: boolean;
  targets: AcquireTarget[];
  ytDlp: boolean;
  ytDlpVersion: string | null;
  grokImage: boolean;
  hasXaiApiKey: boolean;
  xaiCloudAllowed?: boolean;
  imageModel?: string;
  openAlexKey?: boolean;
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

type JobKind =
  | "arxiv"
  | "youtube"
  | "image"
  | "openalex"
  | "clip"
  | "grokipedia"
  | "image_url";
type BusyKind =
  | JobKind
  | "arxiv-search"
  | "openalex-search"
  | "grokipedia-search"
  | null;

type ArxivHit = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  categories: string[];
  absUrl: string;
};

type OpenAlexHit = {
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

type GrokipediaHit = {
  slug: string;
  title: string;
  url: string;
};


const ACQUIRE_OPEN_KEY = "helix-acquire-open-v1";
const ACQUIRE_LOCATION_KEY = "helix-acquire-location-v1";

const DEFAULT_OPEN: Record<AcquireModuleId, boolean> = {
  arxiv: false,
  openalex: false,
  clip: false,
  grokipedia: false,
  image_url: false,
  youtube: false,
  image: false,
};

function loadOpenModules(): Record<AcquireModuleId, boolean> {
  if (typeof window === "undefined") return { ...DEFAULT_OPEN };
  try {
    const raw = localStorage.getItem(ACQUIRE_OPEN_KEY);
    if (!raw) return { ...DEFAULT_OPEN };
    const parsed = JSON.parse(raw) as Partial<Record<AcquireModuleId, boolean>>;
    return { ...DEFAULT_OPEN, ...parsed };
  } catch {
    return { ...DEFAULT_OPEN };
  }
}

function maybeToastAcquire(
  kind: JobKind,
  result: ResultBox,
  open: Record<AcquireModuleId, boolean>,
) {
  const hidden =
    typeof document !== "undefined" && document.visibilityState === "hidden";
  const collapsed = !open[kind];
  if (!hidden && !collapsed) return;
  if (!result.ok) {
    toast({
      tone: "danger",
      title: "Acquire failed",
      href: "/acquire",
    });
    return;
  }
  toast({
    tone: "ok",
    title: "Acquire done",
    href: result.itemId ? `/catalog/${result.itemId}` : "/acquire",
  });
}

function AcquireProgress({
  progress,
  active,
}: {
  progress: JobProgress | null;
  active: boolean;
}) {
  if (
    !progress ||
    (!active && (progress.stage === "done" || progress.stage === "failed"))
  ) {
    return null;
  }
  return (
    <ProgressBar
      percent={progress.percent}
      active={active}
      label={progress.stage.replace(/_/g, " ")}
      detail={progress.detail}
      className="mt-3"
    />
  );
}

function saveOpenModules(state: Record<AcquireModuleId, boolean>) {
  try {
    localStorage.setItem(ACQUIRE_OPEN_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function loadStoredLocationId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACQUIRE_LOCATION_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function pickLocationId(
  targets: AcquireTarget[],
  preferred: number | null,
): number | null {
  if (!targets.length) return null;
  if (preferred != null) {
    const hit = targets.find((t) => t.locationId === preferred);
    if (hit) return hit.locationId;
  }
  const writable = targets.find((t) => t.writable);
  if (writable) return writable.locationId;
  const available = targets.find((t) => t.available);
  if (available) return available.locationId;
  return targets[0]?.locationId ?? null;
}

export function AcquireDesk({ initialCaps }: { initialCaps: Caps }) {
  const [caps, setCaps] = useState<Caps>({
    ...initialCaps,
    targets: initialCaps.targets ?? [],
  });
  const [locationId, setLocationId] = useState<number | null>(() =>
    pickLocationId(initialCaps.targets ?? [], null),
  );
  const [arxivMode, setArxivMode] = useState<"search" | "id">("search");
  const [arxivIn, setArxivIn] = useState("");
  const [arxivHits, setArxivHits] = useState<ArxivHit[]>([]);
  const [arxivTotal, setArxivTotal] = useState(0);
  const [arxivSearchErr, setArxivSearchErr] = useState<string | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  const [oaMode, setOaMode] = useState<"search" | "doi">("search");
  const [oaIn, setOaIn] = useState("");
  const [oaHits, setOaHits] = useState<OpenAlexHit[]>([]);
  const [oaTotal, setOaTotal] = useState(0);
  const [oaSearchErr, setOaSearchErr] = useState<string | null>(null);
  const [oaFetchingId, setOaFetchingId] = useState<string | null>(null);

  const [clipUrl, setClipUrl] = useState("");
  const [gpIn, setGpIn] = useState("");
  const [gpHits, setGpHits] = useState<GrokipediaHit[]>([]);
  const [gpSearchErr, setGpSearchErr] = useState<string | null>(null);
  const [gpFetching, setGpFetching] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [ytMode, setYtMode] = useState<"video" | "audio">("video");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<BusyKind>(null);

  const [arxivResult, setArxivResult] = useState<ResultBox | null>(null);
  const [oaResult, setOaResult] = useState<ResultBox | null>(null);
  const [clipResult, setClipResult] = useState<ResultBox | null>(null);
  const [gpResult, setGpResult] = useState<ResultBox | null>(null);
  const [imgUrlResult, setImgUrlResult] = useState<ResultBox | null>(null);
  const [ytResult, setYtResult] = useState<ResultBox | null>(null);
  const [imgResult, setImgResult] = useState<ResultBox | null>(null);

  const [arxivProgress, setArxivProgress] = useState<JobProgress | null>(null);
  const [oaProgress, setOaProgress] = useState<JobProgress | null>(null);
  const [clipProgress, setClipProgress] = useState<JobProgress | null>(null);
  const [gpProgress, setGpProgress] = useState<JobProgress | null>(null);
  const [imgUrlProgress, setImgUrlProgress] = useState<JobProgress | null>(null);
  const [ytProgress, setYtProgress] = useState<JobProgress | null>(null);
  const [imgProgress, setImgProgress] = useState<JobProgress | null>(null);
  const [openMods, setOpenMods] = useState<Record<AcquireModuleId, boolean>>(DEFAULT_OPEN);
  const [openReady, setOpenReady] = useState(false);
  const openModsRef = useRef(openMods);
  openModsRef.current = openMods;

  const refreshCaps = useCallback(async () => {
    try {
      const res = await fetch("/api/acquire/status");
      const data = await res.json();
      if (data.ok) {
        const targets = (Array.isArray(data.targets)
          ? data.targets
          : []) as AcquireTarget[];
        setCaps({
          archiveRoot: data.archiveRoot,
          archiveWritable: data.archiveWritable,
          targets,
          ytDlp: data.ytDlp,
          ytDlpVersion: data.ytDlpVersion,
          grokImage: data.grokImage,
          hasXaiApiKey: data.hasXaiApiKey,
          xaiCloudAllowed: data.xaiCloudAllowed,
          imageModel: data.imageModel,
          openAlexKey: data.openAlexKey,
        });
        setLocationId((prev) => pickLocationId(targets, prev));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshCaps();
  }, [refreshCaps]);

  useEffect(() => {
    setOpenMods(loadOpenModules());
    setOpenReady(true);
    const stored = loadStoredLocationId();
    setLocationId((prev) =>
      pickLocationId(caps.targets, stored ?? prev),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only hydrate

  useEffect(() => {
    if (locationId == null) return;
    try {
      localStorage.setItem(ACQUIRE_LOCATION_KEY, String(locationId));
    } catch {
      /* ignore */
    }
  }, [locationId]);

  const selectedTarget =
    caps.targets.find((t) => t.locationId === locationId) ?? null;
  const canWrite = Boolean(selectedTarget?.writable);

  useEffect(() => {
    if (!openReady) return;
    saveOpenModules(openMods);
  }, [openMods, openReady]);

  // Expand the module that is actively running a job
  useEffect(() => {
    if (!busy) return;
    const map: Partial<Record<string, AcquireModuleId>> = {
      arxiv: "arxiv",
      "arxiv-search": "arxiv",
      openalex: "openalex",
      "openalex-search": "openalex",
      clip: "clip",
      grokipedia: "grokipedia",
      "grokipedia-search": "grokipedia",
      image_url: "image_url",
      youtube: "youtube",
      image: "image",
    };
    const id = map[busy];
    if (id) {
      setOpenMods((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    }
  }, [busy]);

  function toggleMod(id: AcquireModuleId) {
    setOpenMods((prev) => ({ ...prev, [id]: !prev[id] }));
  }


  function setProgress(kind: JobKind, p: JobProgress | null) {
    if (kind === "arxiv") setArxivProgress(p);
    else if (kind === "youtube") setYtProgress(p);
    else if (kind === "image") setImgProgress(p);
    else if (kind === "openalex") setOaProgress(p);
    else if (kind === "clip") setClipProgress(p);
    else if (kind === "grokipedia") setGpProgress(p);
    else setImgUrlProgress(p);
  }

  async function pollJob(
    jobId: string | number,
    kind: JobKind,
    setResult: (r: ResultBox | null) => void,
  ) {
    const maxAttempts = kind === "youtube" ? 1800 : 360;
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
          maybeToastAcquire(
            kind,
            { ok: false, message: data.error ?? "Lost job status" },
            openModsRef.current,
          );
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
            vcodec && /av1|av01|vp9|vp09/i.test(vcodec);
          const tags = Array.isArray(r.tags)
            ? (r.tags as unknown[]).filter((t) => typeof t === "string")
            : [];
          const tagNote =
            tags.length > 0
              ? ` Tags: ${tags.slice(0, 10).join(", ")}${tags.length > 10 ? "…" : ""}.`
              : "";
          const done: ResultBox = {
            ok: true,
            message: hard
              ? `Saved & reindexed. Codec ${vcodec} may not play in-browser.${tagNote}`
              : `Saved to archive and reindexed.${tagNote}`,
            path: typeof r.path === "string" ? r.path : undefined,
            itemId: typeof r.itemId === "number" ? r.itemId : null,
            bytes: typeof r.bytes === "number" ? r.bytes : undefined,
          };
          setResult(done);
          maybeToastAcquire(kind, done, openModsRef.current);
          void refreshCaps();
          return;
        }
        if (job.status === "failed") {
          const fail: ResultBox = {
            ok: false,
            message: job.error ?? "Acquire failed",
          };
          setResult(fail);
          maybeToastAcquire(kind, fail, openModsRef.current);
          return;
        }
      } catch (e) {
        if (i > maxAttempts - 5) {
          setResult({
            ok: false,
            message: e instanceof Error ? e.message : "Poll failed",
          });
          return;
        }
      }
    }
    const timeout: ResultBox = {
      ok: false,
      message: "Timed out waiting for job (download may still finish on server)",
    };
    setResult(timeout);
    maybeToastAcquire(kind, timeout, openModsRef.current);
  }

  async function post(
    url: string,
    body: Record<string, unknown>,
    kind: JobKind,
    setResult: (r: ResultBox | null) => void,
  ) {
    if (!canWrite || locationId == null) {
      setResult({
        ok: false,
        message: selectedTarget
          ? `Destination “${selectedTarget.name}” is not writable (unmounted?).`
          : "Select a writable archive destination first.",
      });
      return;
    }
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
        body: JSON.stringify({ ...body, locationId }),
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

      if (data.async && data.jobId) {
        if (data.job?.progress) {
          setProgress(kind, data.job.progress as JobProgress);
        }
        await pollJob(String(data.jobId), kind, setResult);
        return;
      }

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
              ? "Network error (connection dropped). For long downloads the server should return a job id immediately — try again after refresh."
              : e.message
            : "Request failed",
      });
      setProgress(kind, null);
    } finally {
      setBusy(null);
      setFetchingId(null);
      setOaFetchingId(null);
      setGpFetching(null);
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

  async function searchOpenAlex() {
    const q = oaIn.trim();
    if (!q || busy) return;
    setBusy("openalex-search");
    setOaSearchErr(null);
    setOaHits([]);
    setOaResult(null);
    try {
      const res = await fetch(
        `/api/acquire/openalex/search?q=${encodeURIComponent(q)}&max=12`,
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setOaSearchErr(data.error ?? "Search failed");
        return;
      }
      setOaHits((data.hits as OpenAlexHit[]) ?? []);
      setOaTotal(Number(data.total) || 0);
      if (!data.hits?.length) {
        setOaSearchErr("No works matched that query.");
      }
    } catch (e) {
      setOaSearchErr(e instanceof Error ? e.message : "Search failed");
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

  function fetchOpenAlex(idOrDoi: string) {
    setOaFetchingId(idOrDoi);
    void post(
      "/api/acquire/openalex",
      { idOrDoi },
      "openalex",
      setOaResult,
    );
  }

  async function searchGrokipedia() {
    const q = gpIn.trim();
    if (!q || busy) return;
    setBusy("grokipedia-search");
    setGpSearchErr(null);
    setGpHits([]);
    setGpResult(null);
    try {
      const res = await fetch(
        `/api/acquire/grokipedia/search?q=${encodeURIComponent(q)}&max=12`,
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setGpSearchErr(data.error ?? "Search failed");
        return;
      }
      setGpHits((data.hits as GrokipediaHit[]) ?? []);
      if (!data.hits?.length) {
        setGpSearchErr("No Grokipedia pages matched that query.");
      }
    } catch (e) {
      setGpSearchErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  function fetchGrokipedia(titleOrSlug: string) {
    setGpFetching(titleOrSlug);
    void post(
      "/api/acquire/grokipedia",
      { titleOrSlug },
      "grokipedia",
      setGpResult,
    );
  }

  const clipIsHttp =
    clipUrl.trim().toLowerCase().startsWith("http://") &&
    !clipUrl.trim().toLowerCase().startsWith("https://");

  const grokChipLabel = !caps.hasXaiApiKey
    ? "no key"
    : caps.xaiCloudAllowed === false
      ? "cloud off"
      : "keyed";

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="surface p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="acquire-destination"
              className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]"
            >
              Destination archive
            </label>
            <p className="mt-0.5 text-xs text-[var(--muted-faint)]">
              Holdings land under this location’s folders (
              <code className="code-inline">documents/</code>,{" "}
              <code className="code-inline">video/</code>, …). Removable drives
              appear when mounted.
            </p>
            <select
              id="acquire-destination"
              className="input mt-2 w-full max-w-xl font-mono text-sm"
              value={locationId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setLocationId(v ? Number(v) : null);
              }}
              disabled={busy != null || caps.targets.length === 0}
            >
              {caps.targets.length === 0 ? (
                <option value="">No enabled locations</option>
              ) : (
                caps.targets.map((t) => (
                  <option
                    key={t.locationId}
                    value={t.locationId}
                    disabled={!t.available}
                  >
                    {t.name}
                    {!t.available
                      ? " (unmounted)"
                      : !t.writable
                        ? " (read-only)"
                        : ""}
                    {" — "}
                    {t.root}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span
              className="chip chip-stat"
              title={selectedTarget?.root ?? caps.archiveRoot}
            >
              <span className="chip-label">Writing to</span>
              <span className="chip-value max-w-[10rem] truncate font-mono text-[0.65rem]">
                {selectedTarget?.name ?? "—"}
              </span>
            </span>
            <span
              className={cn(
                "chip chip-stat",
                canWrite ? "" : "text-[var(--danger)]",
              )}
            >
              <span className="chip-label">Writable</span>
              <span className="chip-value">{canWrite ? "yes" : "no"}</span>
            </span>
            <span className={cn("chip chip-stat", !caps.ytDlp && "opacity-70")}>
              <span className="chip-label">yt-dlp</span>
              <span className="chip-value">
                {caps.ytDlp ? caps.ytDlpVersion ?? "ok" : "missing"}
              </span>
            </span>
            <span
              className={cn("chip chip-stat", !caps.openAlexKey && "opacity-70")}
              title="Free key from openalex.org/settings/api improves rate limits"
            >
              <span className="chip-label">OpenAlex</span>
              <span className="chip-value">
                {caps.openAlexKey ? "keyed" : "no key"}
              </span>
            </span>
            <span
              className={cn("chip chip-stat", !caps.grokImage && "opacity-70")}
            >
              <span className="chip-label">Grok image</span>
              <span className="chip-value">{grokChipLabel}</span>
            </span>
          </div>
        </div>
        {!canWrite && selectedTarget ? (
          <p className="mt-2 text-xs text-[var(--danger)]">
            “{selectedTarget.name}” is not writable right now
            {!selectedTarget.available
              ? " (path missing — plug in the drive?)"
              : ""}
            . Choose another destination or remount.
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          Expand a tool to search or fetch. Open state is remembered.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setOpenMods({
                arxiv: true,
                openalex: true,
                clip: true,
                grokipedia: true,
                image_url: true,
                youtube: true,
                image: true,
              })
            }
          >
            Expand all
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpenMods({ ...DEFAULT_OPEN })}
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* arXiv */}
        <AcquireModuleCard
          id="arxiv"
          open={openMods.arxiv}
          onToggle={() => toggleMod("arxiv")}
          title="arXiv PDF"
          description={
            <>
              Fast path for preprints →{" "}
              <code className="code-inline">archive/documents/</code>
            </>
          }
          icon={<FileText className="h-4 w-4" />}
          className={cn(arxivHits.length > 0 && openMods.arxiv && "md:col-span-2 xl:col-span-2")}
        >
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
                <HelixSpinner size="md" decorative />
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
                <HelixSpinner size="md" decorative />
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
                            <HelixSpinner size="sm" decorative />
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

          <AcquireProgress progress={arxivProgress} active={busy === "arxiv"} />
          <ResultPanel result={arxivResult} />
        </AcquireModuleCard>

        {/* OpenAlex Papers */}
        <AcquireModuleCard
          id="openalex"
          open={openMods.openalex}
          onToggle={() => toggleMod("openalex")}
          title="Papers (OpenAlex)"
          description={
            <>
              Wider OA net by search or DOI. Fetch only when a direct PDF link
              exists → <code className="code-inline">archive/documents/</code>
            </>
          }
          icon={<FileText className="h-4 w-4" />}
          className={cn(oaHits.length > 0 && openMods.openalex && "md:col-span-2 xl:col-span-2")}
          badge={
            !caps.openAlexKey ? (
              <span className="text-[0.65rem] text-[var(--warn)]">no key</span>
            ) : (
              <span className="text-[0.65rem] text-[var(--ok)]">keyed</span>
            )
          }
        >
          {!caps.openAlexKey ? (
            <p className="mt-3 text-xs text-[var(--warn)]">
              Works better with a free{" "}
              <a
                href="https://openalex.org/settings/api"
                className="link-accent"
                target="_blank"
                rel="noreferrer"
              >
                OpenAlex API key
              </a>{" "}
              in{" "}
              <code className="code-inline">NON_OS_OPENALEX_API_KEY</code>{" "}
              (or <code className="code-inline">OPENALEX_API_KEY</code>).
            </p>
          ) : null}

          <div
            className="segment mt-4 w-full"
            role="group"
            aria-label="OpenAlex input mode"
          >
            <button
              type="button"
              className={cn("flex-1", oaMode === "search" && "is-active")}
              onClick={() => setOaMode("search")}
              disabled={busy !== null}
            >
              Search
            </button>
            <button
              type="button"
              className={cn("flex-1", oaMode === "doi" && "is-active")}
              onClick={() => setOaMode("doi")}
              disabled={busy !== null}
            >
              DOI / id
            </button>
          </div>

          <label className="mt-3 block">
            <span className="label-quiet">
              {oaMode === "search"
                ? "Topic, title, or author keywords"
                : "DOI or OpenAlex work id"}
            </span>
            <input
              className="field"
              value={oaIn}
              onChange={(e) => setOaIn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (oaMode === "search") void searchOpenAlex();
                  else if (oaIn.trim()) fetchOpenAlex(oaIn.trim());
                }
              }}
              placeholder={
                oaMode === "search"
                  ? "e.g. retrieval augmented generation"
                  : "10.1038/… or W2741809807"
              }
              disabled={busy !== null || !caps.archiveWritable}
            />
          </label>

          {oaMode === "search" ? (
            <button
              type="button"
              className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
              disabled={
                busy !== null || !oaIn.trim() || !caps.archiveWritable
              }
              onClick={() => void searchOpenAlex()}
            >
              {busy === "openalex-search" ? (
                <HelixSpinner size="md" decorative />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search OpenAlex
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
              disabled={
                busy !== null || !oaIn.trim() || !caps.archiveWritable
              }
              onClick={() => fetchOpenAlex(oaIn.trim())}
            >
              {busy === "openalex" ? (
                <HelixSpinner size="md" decorative />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Fetch OA PDF
            </button>
          )}

          {oaSearchErr ? (
            <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
              {oaSearchErr}
            </p>
          ) : null}

          {oaHits.length > 0 ? (
            <div className="mt-3 min-h-0">
              <p className="text-xs text-[var(--muted)]">
                <span className="tabular-nums font-medium text-[var(--ink-soft)]">
                  {oaTotal.toLocaleString()}
                </span>{" "}
                matches · showing {oaHits.length}.
              </p>
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                {oaHits.map((hit) => {
                  const canFetch = Boolean(hit.pdfUrl);
                  return (
                    <li
                      key={hit.id}
                      className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] p-2.5"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold leading-snug text-[var(--ink)]">
                              {hit.title}
                            </p>
                            {hit.pdfUrl ? (
                              <span
                                className="rounded-full bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--ok)]"
                                title="Direct PDF URL available"
                              >
                                PDF
                              </span>
                            ) : hit.isOa ? (
                              <span
                                className="rounded-full bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--warn)]"
                                title="OA but no direct PDF URL in OpenAlex"
                              >
                                OA
                              </span>
                            ) : (
                              <span
                                className="rounded-full bg-[var(--paper)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--muted)]"
                                title="No open-access PDF listed"
                              >
                                Closed
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 font-mono text-[0.65rem] text-[var(--muted)]">
                            {hit.id}
                            {hit.year ? ` · ${hit.year}` : ""}
                            {hit.doi ? ` · ${hit.doi}` : ""}
                          </p>
                          {hit.authors.length ? (
                            <p className="mt-0.5 truncate text-[0.7rem] text-[var(--muted-faint)]">
                              {hit.authors.join(", ")}
                            </p>
                          ) : null}
                          {hit.abstract ? (
                            <p className="mt-1 line-clamp-2 text-[0.7rem] leading-snug text-[var(--ink-soft)]">
                              {hit.abstract}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <a
                            href={hit.openAlexUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            OpenAlex
                          </a>
                          {hit.landingUrl ? (
                            <a
                              href={hit.landingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost btn-sm"
                            >
                              Landing
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={
                              !canFetch ||
                              busy !== null ||
                              !caps.archiveWritable
                            }
                            title={
                              canFetch
                                ? "Download OA PDF"
                                : "No direct PDF URL in OpenAlex"
                            }
                            onClick={() =>
                              fetchOpenAlex(hit.doi ? hit.doi : hit.id)
                            }
                          >
                            {oaFetchingId === (hit.doi ?? hit.id) &&
                            busy === "openalex" ? (
                              <HelixSpinner size="sm" decorative />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            Fetch
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <AcquireProgress
            progress={oaProgress}
            active={busy === "openalex"}
          />
          <ResultPanel result={oaResult} />
        </AcquireModuleCard>

        {/* Web clip */}
        <AcquireModuleCard
          id="clip"
          open={openMods.clip}
          onToggle={() => toggleMod("clip")}
          title="Web clip"
          description={
            <>
              Single page → Markdown in{" "}
              <code className="code-inline">archive/notes/</code> with source URL
              provenance.
            </>
          }
          icon={<Globe className="h-4 w-4" />}
        >
          <label className="block">
            <span className="label-quiet">Page URL</span>
            <input
              className="field"
              value={clipUrl}
              onChange={(e) => setClipUrl(e.target.value)}
              placeholder="https://example.com/essay…"
              disabled={busy !== null || !caps.archiveWritable}
            />
          </label>
          {clipIsHttp ? (
            <p className="mt-2 text-xs text-[var(--warn)]">
              Prefer https when available. http is allowed for legacy blogs.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
            disabled={
              busy !== null || !clipUrl.trim() || !caps.archiveWritable
            }
            onClick={() =>
              void post(
                "/api/acquire/clip",
                { url: clipUrl.trim() },
                "clip",
                setClipResult,
              )
            }
          >
            {busy === "clip" ? (
              <HelixSpinner size="md" decorative />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy === "clip" ? "Clipping…" : "Clip to notes"}
          </button>
          <AcquireProgress progress={clipProgress} active={busy === "clip"} />
          <ResultPanel result={clipResult} />
        </AcquireModuleCard>

        {/* Grokipedia */}
        <AcquireModuleCard
          id="grokipedia"
          open={openMods.grokipedia}
          onToggle={() => toggleMod("grokipedia")}
          title="Grokipedia"
          description={
            <>
              Reference from{" "}
              <a
                href="https://grokipedia.com"
                className="link-accent"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                grokipedia.com
              </a>{" "}
              → <code className="code-inline">archive/notes/</code> (not Wikipedia).
            </>
          }
          icon={<Globe className="h-4 w-4" />}
          className={cn(gpHits.length > 0 && openMods.grokipedia && "md:col-span-2")}
        >
          <label className="block">
            <span className="label-quiet">Topic, slug, or page URL</span>
            <input
              className="field"
              value={gpIn}
              onChange={(e) => setGpIn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchGrokipedia();
                }
              }}
              placeholder="Artificial intelligence, Palantir, or /page/Slug…"
              disabled={busy !== null || !caps.archiveWritable}
            />
          </label>
          <p className="mt-1.5 text-[0.7rem] text-[var(--muted-faint)]">
            Free-text titles search first (e.g. Palantir → Palantir Technologies).
            Use an exact slug or page URL only when you know it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary min-h-11"
              disabled={
                busy !== null || !gpIn.trim() || !caps.archiveWritable
              }
              onClick={() => void searchGrokipedia()}
            >
              {busy === "grokipedia-search" ? (
                <HelixSpinner size="md" decorative />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </button>
            <button
              type="button"
              className="btn btn-ghost min-h-11"
              disabled={
                busy !== null || !gpIn.trim() || !caps.archiveWritable
              }
              onClick={() => fetchGrokipedia(gpIn.trim())}
              title="Search or fetch: free text searches; exact slugs/URLs fetch directly"
            >
              {busy === "grokipedia" ? (
                <HelixSpinner size="md" decorative />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Fetch best match
            </button>
          </div>
          {gpSearchErr ? (
            <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
              {gpSearchErr}
            </p>
          ) : null}
          {gpHits.length > 0 ? (
            <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto">
              {gpHits.map((hit) => (
                <li
                  key={hit.slug}
                  className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] p-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {hit.title}
                    </p>
                    <p className="font-mono text-[0.65rem] text-[var(--muted)]">
                      {hit.slug}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy !== null || !caps.archiveWritable}
                      onClick={() => fetchGrokipedia(hit.slug)}
                    >
                      {gpFetching === hit.slug && busy === "grokipedia" ? (
                        <HelixSpinner size="sm" decorative />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Fetch
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <AcquireProgress
            progress={gpProgress}
            active={busy === "grokipedia"}
          />
          <ResultPanel result={gpResult} />
        </AcquireModuleCard>

        {/* Image URL */}
        <AcquireModuleCard
          id="image_url"
          open={openMods.image_url}
          onToggle={() => toggleMod("image_url")}
          title="Image URL"
          description={
            <>
              Found images → <code className="code-inline">archive/images/</code>
              . https only; png/jpeg/webp.
            </>
          }
          icon={<ImageIcon className="h-4 w-4" />}
        >
          <label className="block">
            <span className="label-quiet">Image URL</span>
            <input
              className="field"
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              placeholder="https://…/photo.png"
              disabled={busy !== null || !caps.archiveWritable}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary mt-3 min-h-11 w-full sm:w-auto"
            disabled={
              busy !== null || !imgUrl.trim() || !caps.archiveWritable
            }
            onClick={() =>
              void post(
                "/api/acquire/image-url",
                { url: imgUrl.trim() },
                "image_url",
                setImgUrlResult,
              )
            }
          >
            {busy === "image_url" ? (
              <HelixSpinner size="md" decorative />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy === "image_url" ? "Downloading…" : "Save image"}
          </button>
          <AcquireProgress
            progress={imgUrlProgress}
            active={busy === "image_url"}
          />
          <ResultPanel result={imgUrlResult} />
        </AcquireModuleCard>

        {/* YouTube */}
        <AcquireModuleCard
          id="youtube"
          open={openMods.youtube}
          onToggle={() => toggleMod("youtube")}
          title="YouTube / podcast"
          description={
            <>
              <code className="code-inline">yt-dlp</code> (+ ffmpeg) →{" "}
              <code className="code-inline">video/</code> or{" "}
              <code className="code-inline">audio/</code>
            </>
          }
          icon={<Video className="h-4 w-4" />}
          badge={
            !caps.ytDlp ? (
              <span className="text-[0.65rem] text-[var(--warn)]">missing</span>
            ) : null
          }
        >
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
              <HelixSpinner size="md" decorative />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy === "youtube" ? "Downloading…" : "Download"}
          </button>
          <AcquireProgress progress={ytProgress} active={busy === "youtube"} />
          <ResultPanel result={ytResult} />
        </AcquireModuleCard>

        {/* Grok image */}
        <AcquireModuleCard
          id="image"
          open={openMods.image}
          onToggle={() => toggleMod("image")}
          title="Grok image"
          description={
            <>
              xAI Imagine
              {caps.imageModel ? (
                <>
                  {" "}
                  <code className="code-inline">{caps.imageModel}</code>
                </>
              ) : null}{" "}
              → <code className="code-inline">archive/images/</code>
            </>
          }
          icon={<ImageIcon className="h-4 w-4" />}
          className="md:col-span-2 xl:col-span-1"
          badge={
            <span className="text-[0.65rem] text-[var(--muted)]">
              {grokChipLabel}
            </span>
          }
        >
          {!caps.hasXaiApiKey ? (
            <p className="text-xs text-[var(--warn)]">
              Set <code className="code-inline">XAI_API_KEY</code> from{" "}
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
          ) : caps.xaiCloudAllowed === false ? (
            <p className="text-xs text-[var(--warn)]">
              Cloud Grok is disabled (
              <code className="code-inline">NON_OS_USE_XAI=0</code>). Image
              generation is unavailable.
            </p>
          ) : null}
          <label className="mt-3 block">
            <span className="label-quiet">Prompt</span>
            <textarea
              className="field min-h-[5.5rem] resize-y"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A phosphor-green CRT displaying a star catalog…"
              disabled={
                busy !== null || !caps.grokImage || !caps.archiveWritable
              }
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
              <HelixSpinner size="md" decorative />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {busy === "image" ? "Generating…" : "Generate & save"}
          </button>
          <AcquireProgress progress={imgProgress} active={busy === "image"} />
          <ResultPanel result={imgResult} />
        </AcquireModuleCard>
      </div>

      <p className="text-xs text-[var(--muted-faint)]">
        Personal use only. You are responsible for rights to downloaded media
        and clipped pages. OpenAlex Fetch only uses listed OA PDF URLs — never
        paywall bypass. arXiv is open access. Files land under your Archive root
        and are reindexed automatically. Respect site terms of service.
      </p>
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
