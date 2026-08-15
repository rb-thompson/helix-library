"use client";

import { useCallback, useEffect, useState } from "react";
import { Aperture, RefreshCw, Sparkles, Tag } from "lucide-react";
import type {
  LensAnalysisRowView,
  LensAnalysisTopStatus,
  LensDossierV1,
} from "@/lib/lens/dossier";
import {
  readLensAuto,
  writeLensAuto,
  readLensAutoXaiConfirmed,
  writeLensAutoXaiConfirmed,
} from "@/lib/client/lens-object-mode";

type ApiGet = {
  ok?: boolean;
  status?: LensAnalysisTopStatus;
  analysis?: LensAnalysisRowView | null;
  jobId?: number | null;
  agentMode?: "local" | "xai";
  analyzeEnabled?: boolean;
  error?: string;
};

/**
 * Machine dossier analysis panel (not human insights).
 */
export function DossierAnalysisPanel({
  itemId,
  initialStatus,
  initialAnalysis,
  initialJobId,
  agentMode,
}: {
  itemId: number;
  initialStatus: LensAnalysisTopStatus;
  initialAnalysis: LensAnalysisRowView | null;
  initialJobId: number | null;
  agentMode: "local" | "xai";
}) {
  const [status, setStatus] = useState(initialStatus);
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [jobId, setJobId] = useState(initialJobId);
  const [mode, setMode] = useState(agentMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [applyingTag, setApplyingTag] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/lens/analyses?itemId=${itemId}`);
      const data = (await res.json()) as ApiGet;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Load failed (${res.status})`);
      }
      setStatus(data.status ?? "missing");
      setAnalysis(data.analysis ?? null);
      setJobId(data.jobId ?? null);
      if (data.agentMode) setMode(data.agentMode);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [itemId]);

  const run = useCallback(
    async (force = false) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/lens/analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, force }),
        });
        const data = (await res.json()) as ApiGet & {
          started?: boolean;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `Analyze failed (${res.status})`);
        }
        setStatus(data.status ?? "missing");
        setAnalysis(data.analysis ?? null);
        setJobId(data.jobId ?? null);
        if (data.status === "running" && data.jobId) {
          // poll until done
          const jid = data.jobId;
          for (let i = 0; i < 90; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const st = await refresh();
            if (st && st.status !== "running") break;
            // also poke job endpoint
            await fetch(`/api/jobs/${jid}`).catch(() => null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [itemId, refresh],
  );

  useEffect(() => {
    setAuto(readLensAuto());
  }, []);

  // Auto-analyze on miss when preference on
  useEffect(() => {
    if (!auto) return;
    if (status !== "missing" && status !== "stale" && status !== "failed") {
      return;
    }
    if (mode === "xai" && !readLensAutoXaiConfirmed()) return;
    void run(false);
    // only on mount / auto toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  async function applyTag(name: string) {
    setApplyingTag(name);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Tag apply failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingTag(null);
    }
  }

  function toggleAuto() {
    if (!auto && mode === "xai" && !readLensAutoXaiConfirmed()) {
      const ok = window.confirm(
        "Auto-analyze will send holding metadata and indexed text to the xAI developer API when cache is missing. Continue?",
      );
      if (!ok) return;
      writeLensAutoXaiConfirmed();
    }
    const next = !auto;
    setAuto(next);
    writeLensAuto(next);
  }

  const payload: LensDossierV1 | null = analysis?.payload ?? null;

  return (
    <section className="surface p-4 sm:p-5" aria-label="Dossier analysis">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Aperture
              className="h-4 w-4 shrink-0 text-[var(--accent)]"
              aria-hidden
            />
            <h2 className="label-quiet !mb-0">Dossier analysis</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Machine-built understanding of this holding. Cached until the file
            fingerprint changes. Separate from your saved quotes below.
          </p>
        </div>
        <StatusChip status={status} mode={mode} />
      </div>

      {mode === "xai" ? (
        <p
          className="mt-3 rounded-lg border border-[var(--accent-ring)] bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--ink)]"
          role="note"
        >
          Cloud analysis uses the <strong>xAI developer API</strong> (not SuperGrok
          chat). Metadata and indexed text samples may leave this machine.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
          disabled={busy || status === "running"}
          onClick={() => void run(status === "fresh")}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {busy || status === "running"
            ? "Analyzing…"
            : status === "fresh"
              ? "Re-run analysis"
              : "Run analysis"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
          disabled={busy}
          onClick={() => void refresh()}
          title="Refresh status"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={auto}
            onChange={toggleAuto}
            className="rounded border-[var(--line)]"
          />
          Auto on open
        </label>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {status === "running" ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          Analysis job running{jobId ? ` (#${jobId})` : ""}…
        </p>
      ) : null}

      {status === "missing" && !busy ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          No dossier yet. Run analysis to extract a structured view of this
          holding.
        </p>
      ) : null}

      {status === "failed" && analysis?.error ? (
        <p className="mt-4 text-sm text-[var(--danger)]">
          Last analysis failed: {analysis.error}
        </p>
      ) : null}

      {status === "stale" ? (
        <p className="mt-3 text-xs font-medium text-[var(--warn)]">
          Outdated — holding fingerprint changed since this dossier was built.
        </p>
      ) : null}

      {payload ? (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Summary
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]">
              {payload.summary}
            </p>
          </div>

          {payload.keyPoints.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Key points
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--ink-soft)]">
                {payload.keyPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {payload.themes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {payload.themes.map((t) => (
                <span key={t} className="chip !py-0.5 text-[0.7rem]">
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {payload.entities.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Entities
              </h3>
              <ul className="mt-1 flex flex-wrap gap-1.5 text-sm">
                {payload.entities.map((e) => (
                  <li key={e.name} className="chip !py-0.5 text-[0.7rem]">
                    {e.name}
                    {e.kind ? (
                      <span className="text-[var(--muted)]"> · {e.kind}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {payload.contentFacts.length > 0 ? (
            <dl className="grid gap-1.5 sm:grid-cols-2">
              {payload.contentFacts.map((f) => (
                <div
                  key={`${f.label}:${f.value}`}
                  className="surface-inset px-2.5 py-1.5"
                >
                  <dt className="text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                    {f.label}
                  </dt>
                  <dd className="break-all text-xs text-[var(--ink)]">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {payload.suggestedTags.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Suggested tags
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {payload.suggestedTags.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                      disabled={applyingTag === t}
                      onClick={() => void applyTag(t)}
                    >
                      <Tag className="h-3 w-3" aria-hidden />
                      {applyingTag === t ? "Applying…" : t}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {payload.caveats.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Caveats
              </h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--muted)]">
                {payload.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis ? (
            <p className="text-[0.65rem] text-[var(--muted-faint)]">
              Mode {analysis.mode}
              {analysis.model ? ` · ${analysis.model}` : ""} · updated{" "}
              {new Date(analysis.updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function StatusChip({
  status,
  mode,
}: {
  status: LensAnalysisTopStatus;
  mode: string;
}) {
  const tone =
    status === "fresh"
      ? "text-[var(--ok)]"
      : status === "failed"
        ? "text-[var(--danger)]"
        : status === "stale" || status === "running"
          ? "text-[var(--warn)]"
          : "text-[var(--muted)]";
  return (
    <span className={`chip !py-0.5 text-[0.7rem] ${tone}`}>
      {status} · {mode}
    </span>
  );
}
