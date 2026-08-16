"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { Tooltip } from "@/components/Tooltip";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { IndexJobStats } from "@/lib/types";

type JobSnapshot = {
  id: number;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  stats: IndexJobStats | null;
  inflight?: boolean;
};

function formatStats(stats: IndexJobStats): string {
  return `+${stats.added} added · ${stats.updated} updated · ${stats.unchanged} unchanged · ${stats.skipped} skipped`;
}

export function ReindexButton({
  initialJob = null,
}: {
  initialJob?: JobSnapshot | null;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobSnapshot | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running =
    starting ||
    job?.status === "running" ||
    job?.status === "pending" ||
    Boolean(job?.inflight);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (jobId?: number) => {
      try {
        const qs = jobId ? `?id=${jobId}` : "";
        const res = await fetch(`/api/reindex${qs}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to poll job");
          return;
        }
        if (data.job) {
          setJob(data.job as JobSnapshot);
          if (
            data.job.status === "completed" ||
            data.job.status === "failed"
          ) {
            stopPoll();
            setStarting(false);
            if (data.job.status === "completed") {
              router.refresh();
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Poll failed");
      }
    },
    [router, stopPoll],
  );

  const startPoll = useCallback(
    (jobId: number) => {
      stopPoll();
      pollRef.current = setInterval(() => {
        void poll(jobId);
      }, 800);
    },
    [poll, stopPoll],
  );

  useEffect(() => {
    if (initialJob?.status === "running") {
      startPoll(initialJob.id);
    }
    return () => stopPoll();
  }, [initialJob?.id, initialJob?.status, startPoll, stopPoll]);

  async function onClick() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/reindex", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reindex failed");
        setStarting(false);
        return;
      }
      if (data.job) setJob(data.job as JobSnapshot);
      const jobId = data.jobId as number;
      startPoll(jobId);
      void poll(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reindex failed");
      setStarting(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <Tooltip content="Walk enabled locations and refresh the catalog. Runs in the background — safe to leave this page.">
        <button
          type="button"
          onClick={onClick}
          disabled={running}
          className="btn btn-primary"
        >
          {running ? (
            <HelixSpinner size="md" decorative />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {running ? "Reindexing…" : "Run reindex"}
        </button>
      </Tooltip>
      {running ? (
        <ProgressBar
          percent={null}
          active
          label={job ? `Job #${job.id}` : "Reindex"}
          detail={
            job?.startedAt
              ? `started ${new Date(job.startedAt).toLocaleTimeString()}`
              : "Walking locations…"
          }
        />
      ) : null}
      {!running && job?.status === "completed" && job.stats ? (
        <p className="feedback-ok" role="status">
          Job #{job.id} done — {formatStats(job.stats)}
        </p>
      ) : null}
      {job?.status === "failed" ? (
        <p className="feedback-err" role="alert">
          Job #{job.id} failed{job.error ? `: ${job.error}` : ""}
        </p>
      ) : null}
      {error ? (
        <p className="feedback-err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
