"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Tags,
  Trash2,
} from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import type { RescueSnapshot } from "@/lib/catalog/rescue";

type FailedJob = RescueSnapshot["failedJobs"][number];

export function RescuePanel({ rescue }: { rescue: RescueSnapshot }) {
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>(rescue.failedJobs);
  const [busy, setBusy] = useState<null | "all" | number>(null);
  const [error, setError] = useState<string | null>(null);

  const dismiss = useCallback(async (payload: { id: number } | { allFailed: true }) => {
    setError(null);
    setBusy("allFailed" in payload ? "all" : payload.id);
    try {
      const res = await fetch("/api/jobs/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not dismiss");
        return;
      }
      if ("allFailed" in payload) {
        setFailedJobs([]);
      } else {
        setFailedJobs((prev) => prev.filter((j) => j.id !== payload.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const hasOtherWork =
    rescue.missingCount > 0 ||
    rescue.untaggedCount > 0 ||
    rescue.runningJobs.length > 0 ||
    rescue.lowUseTagCount >= 20;

  if (!hasOtherWork && failedJobs.length === 0) {
    return null;
  }

  return (
    <section
      className="surface border-[var(--accent-ring)] p-4 sm:p-5"
      aria-label="Rescue desk"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Desk</p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-[var(--ink)]">
            Rescue
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Catch up on missing holdings, untagged items, and job status.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rescue.missingCount > 0 ? (
          <li>
            <Link
              href="/catalog?missing=1"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--danger)]">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Missing
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.missingCount}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Open weeding desk
              </span>
            </Link>
          </li>
        ) : null}

        {rescue.untaggedCount > 0 ? (
          <li>
            <Link
              href="/catalog?untagged=1"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Tags className="h-3.5 w-3.5" aria-hidden />
                Untagged
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.untaggedCount}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Browse untagged holdings
              </span>
            </Link>
          </li>
        ) : null}

        {rescue.runningJobs.length > 0 ? (
          <li>
            <Link
              href="/services"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                <HelixSpinner size="sm" decorative />
                Running
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.runningJobs.length}
              </span>
              <span className="line-clamp-2 text-xs text-[var(--muted)]">
                {rescue.runningJobs[0]?.label ?? "Jobs in progress"}
              </span>
            </Link>
          </li>
        ) : null}

        {rescue.lowUseTagCount >= 20 ? (
          <li>
            <Link
              href="/collections"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <Tags className="h-3.5 w-3.5" aria-hidden />
                Tag hygiene
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.lowUseTagCount}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Low-use tags — merge or delete
              </span>
            </Link>
          </li>
        ) : null}
      </ul>

      {failedJobs.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_6%,var(--paper-deep))] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--danger)]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Failed jobs
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Mark as seen to clear these from Rescue. History stays on{" "}
                <Link href="/services" className="link-accent">
                  Services
                </Link>
                .
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy !== null}
              onClick={() => void dismiss({ allFailed: true })}
            >
              {busy === "all" ? (
                <HelixSpinner size="sm" decorative />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Mark all seen
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {failedJobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--ink)]">
                    {job.label}
                    <span className="ml-1.5 font-mono text-[0.65rem] text-[var(--muted-faint)]">
                      #{job.id} · {job.kind}
                    </span>
                  </p>
                  {job.error ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--danger)]">
                      {job.error}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Link href="/services" className="btn btn-ghost btn-sm">
                    Details
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy !== null}
                    onClick={() => void dismiss({ id: job.id })}
                  >
                    {busy === job.id ? (
                      <HelixSpinner size="sm" decorative />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Seen
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {error ? (
            <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
