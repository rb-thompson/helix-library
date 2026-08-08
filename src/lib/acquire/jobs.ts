/**
 * Acquire job API — thin wrapper over unified SQLite jobs store.
 * Integer ids only (hard cutover from globalThis + acquire-jobs.json).
 */

import {
  completeJob,
  createJob,
  failJob,
  getJob,
  isCancelRequested,
  isKindBusy,
  listJobs,
  markJobRunning,
  requestCancel,
  updateJobProgress as updateJobProgressStore,
} from "@/lib/jobs/store";
import type {
  AcquireJobKind,
  HelixJob,
  HelixJobProgress,
} from "@/lib/jobs/types";
import { ACQUIRE_JOB_KINDS } from "@/lib/jobs/types";

export type { AcquireJobKind } from "@/lib/jobs/types";
export type AcquireJobStatus = HelixJob["status"];
export type AcquireProgress = HelixJobProgress;

/** @deprecated use HelixJob; kept name for call sites */
export type AcquireJob = HelixJob;

export function createAcquireJob(
  kind: AcquireJobKind,
  label: string,
): AcquireJob {
  return createJob({ kind, label });
}

export function getAcquireJob(id: string | number): AcquireJob | null {
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  const job = getJob(n);
  if (!job) return null;
  if (job.kind === "reindex") return null;
  return job;
}

export function listAcquireJobs(limit = 12): AcquireJob[] {
  return listJobs({
    limit,
    kinds: [...ACQUIRE_JOB_KINDS],
  });
}

export function isAcquireBusy(kind?: AcquireJobKind): boolean {
  if (kind) return isKindBusy(kind);
  return ACQUIRE_JOB_KINDS.some((k) => isKindBusy(k));
}

export function cancelAcquireJob(id: number): AcquireJob | null {
  const job = getJob(id);
  if (!job || job.kind === "reindex") return null;
  return requestCancel(id);
}

/** Compatibility: accept job object or id (legacy callers mutated in-memory jobs). */
export function updateJobProgress(
  jobOrId: AcquireJob | number,
  progress: Partial<AcquireProgress>,
): void {
  const id = typeof jobOrId === "number" ? jobOrId : jobOrId.id;
  const updated = updateJobProgressStore(id, progress);
  if (updated && typeof jobOrId !== "number") {
    jobOrId.progress = updated.progress;
    jobOrId.status = updated.status;
    jobOrId.error = updated.error;
  }
}

export async function runAcquireJob(
  job: AcquireJob,
  work: (
    report: (p: Partial<AcquireProgress>) => void,
  ) => Promise<Record<string, unknown>>,
): Promise<AcquireJob> {
  markJobRunning(job.id);
  job.status = "running";
  job.startedAt = Date.now();

  const report = (p: Partial<AcquireProgress>) => {
    updateJobProgress(job, p);
  };

  try {
    if (isCancelRequested(job.id)) {
      failJob(job.id, "Cancelled");
      return getJob(job.id) ?? job;
    }

    const result = await work(report);
    completeJob(job.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failJob(job.id, message || "Failed");
  }

  return getJob(job.id) ?? job;
}

export function serializeAcquireJob(job: AcquireJob) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    result: job.result,
    label: job.label,
    progress: { ...job.progress },
    cancelRequested: job.cancelRequested,
    dismissed: job.dismissed,
  };
}
