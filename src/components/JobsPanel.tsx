"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, RefreshCw, Square } from "lucide-react";

type JobProgress = {
  stage: string;
  percent: number | null;
  detail?: string;
};

type HelixJobRow = {
  id: number;
  kind: string;
  status: string;
  label: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  progress: JobProgress;
  result: Record<string, unknown> | null;
  cancelRequested: boolean;
};

function kindLabel(kind: string): string {
  switch (kind) {
    case "reindex":
      return "Reindex";
    case "arxiv":
      return "arXiv";
    case "youtube":
      return "YouTube";
    case "image":
      return "Image";
    case "openalex":
      return "OpenAlex PDF";
    case "clip":
      return "Web clip";
    default:
      return kind;
  }
}

function statusClass(status: string): string {
  if (status === "completed") return "text-[var(--ok,var(--accent))]";
  if (status === "failed" || status === "cancelled")
    return "text-[var(--danger)]";
  if (status === "running" || status === "pending")
    return "text-[var(--accent)]";
  return "text-[var(--muted)]";
}

function formatWhen(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function resultSummary(job: HelixJobRow): string | null {
  const r = job.result;
  if (!r) return null;
  if (job.kind === "reindex") {
    const seen = r.seen;
    const added = r.added;
    const updated = r.updated;
    if (seen != null) {
      return `seen ${seen} · +${added ?? 0} · ~${updated ?? 0}`;
    }
  }
  if (typeof r.itemId === "number") {
    return `item #${r.itemId}`;
  }
  return null;
}

export function JobsPanel({ initialJobs }: { initialJobs: HelixJobRow[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Collapsed by default so Services stays compact; expand for detail. */
  const [open, setOpen] = useState(false);

  const activeCount = useMemo(
    () =>
      jobs.filter((j) => j.status === "running" || j.status === "pending")
        .length,
    [jobs],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=20", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    }
  }, []);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Poll while panel open and any job is active (or always when active so badge updates)
  useEffect(() => {
    if (activeCount === 0 && !open) return;
    const t = setInterval(() => {
      void refresh();
    }, 1200);
    return () => clearInterval(t);
  }, [activeCount, open, refresh]);

  async function cancel(id: number) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Cancel failed");
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  const summaryLine =
    jobs.length === 0
      ? "No jobs yet"
      : activeCount > 0
        ? `${activeCount} active · ${jobs.length} recent`
        : `${jobs.length} recent`;

  return (
    <section className="surface p-4 sm:p-5" aria-label="Jobs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="mt-0.5 shrink-0 text-[var(--muted)]" aria-hidden>
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-[var(--ink)]">
                Jobs
              </span>
              {activeCount > 0 ? (
                <span className="chip !py-0.5 text-[0.65rem] text-[var(--accent)]">
                  {activeCount} running
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {open
                ? "Reindex and acquire activity. Progress updates while work runs."
                : summaryLine}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            void refresh();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </button>
      </div>

      {open ? (
        <>
          {error ? (
            <p className="feedback-err mt-3" role="alert">
              {error}
            </p>
          ) : null}

          {jobs.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No jobs yet. Run reindex or acquire something.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {jobs.map((job) => {
                const pct = job.progress?.percent;
                const summary = resultSummary(job);
                const itemId =
                  job.result && typeof job.result.itemId === "number"
                    ? job.result.itemId
                    : null;
                const active =
                  job.status === "running" || job.status === "pending";
                return (
                  <li
                    key={job.id}
                    className="surface-inset rounded-[var(--radius-md)] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="chip !py-0.5 text-[0.65rem]">
                            {kindLabel(job.kind)}
                          </span>
                          <span
                            className={`text-xs font-semibold uppercase tracking-wide ${statusClass(job.status)}`}
                          >
                            {job.status}
                            {job.cancelRequested && active ? " · cancel…" : ""}
                          </span>
                          <span className="text-xs text-[var(--muted-faint)]">
                            #{job.id}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--ink)]">
                          {job.label}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {formatWhen(job.startedAt ?? job.createdAt)}
                          {job.finishedAt
                            ? ` → ${formatWhen(job.finishedAt)}`
                            : ""}
                          {summary ? ` · ${summary}` : ""}
                        </p>
                        {job.progress?.detail ? (
                          <p className="mt-1 text-xs text-[var(--ink-soft)]">
                            {job.progress.stage}
                            {pct != null ? ` · ${Math.round(pct)}%` : ""} —{" "}
                            {job.progress.detail}
                          </p>
                        ) : null}
                        {job.error ? (
                          <p className="mt-1 text-xs text-[var(--danger)]">
                            {job.error}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {itemId != null ? (
                          <Link
                            href={`/catalog/${itemId}`}
                            className="btn btn-ghost btn-sm"
                          >
                            Open
                          </Link>
                        ) : null}
                        {active ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm text-[var(--danger)]"
                            disabled={
                              busyId === job.id || job.cancelRequested
                            }
                            onClick={() => void cancel(job.id)}
                          >
                            <Square className="h-3 w-3" aria-hidden />
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {active && pct != null ? (
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--paper-deep)]"
                        role="progressbar"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                          style={{
                            width: `${Math.max(2, Math.min(100, pct))}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
