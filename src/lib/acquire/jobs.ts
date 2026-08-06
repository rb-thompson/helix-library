/**
 * Acquire job store for single-user localhost.
 *
 * Uses globalThis (survives Next HMR / route-module reloads) + JSON file under
 * data/ so POST and GET /api/acquire/jobs/[id] always see the same jobs.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { projectRoot } from "@/lib/config";

export type AcquireJobKind = "arxiv" | "youtube" | "image";

export type AcquireJobStatus = "pending" | "running" | "completed" | "failed";

export type AcquireProgress = {
  stage: string;
  percent: number | null;
  detail?: string;
};

export type AcquireJob = {
  id: string;
  kind: AcquireJobKind;
  status: AcquireJobStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  result: Record<string, unknown> | null;
  label: string;
  progress: AcquireProgress;
};

type Store = {
  seq: number;
  jobs: Record<string, AcquireJob>;
};

declare global {
  // eslint-disable-next-line no-var
  var __helixAcquireJobs: Store | undefined;
}

function storePath(): string {
  return path.join(projectRoot(), "data", "acquire-jobs.json");
}

function loadFromDisk(): Store | null {
  try {
    const p = storePath();
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Store;
    if (!raw || typeof raw !== "object" || !raw.jobs) return null;
    return { seq: Number(raw.seq) || 0, jobs: raw.jobs };
  } catch {
    return null;
  }
}

function persist(store: Store): void {
  try {
    const p = storePath();
    mkdirSync(path.dirname(p), { recursive: true });
    // Cap finished jobs on disk
    const entries = Object.values(store.jobs).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const keep = entries.slice(0, 40);
    const jobs: Record<string, AcquireJob> = {};
    for (const j of keep) jobs[j.id] = j;
    store.jobs = jobs;
    writeFileSync(p, JSON.stringify({ seq: store.seq, jobs }, null, 0), "utf8");
  } catch {
    // non-fatal
  }
}

function getStore(): Store {
  if (!globalThis.__helixAcquireJobs) {
    globalThis.__helixAcquireJobs = loadFromDisk() ?? { seq: 0, jobs: {} };
  }
  return globalThis.__helixAcquireJobs;
}

export function createAcquireJob(
  kind: AcquireJobKind,
  label: string,
): AcquireJob {
  const store = getStore();
  store.seq += 1;
  const job: AcquireJob = {
    id: `acq-${Date.now()}-${store.seq}`,
    kind,
    status: "pending",
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
    label,
    progress: { stage: "queued", percent: 0, detail: "Waiting to start…" },
  };
  store.jobs[job.id] = job;
  persist(store);
  return job;
}

export function getAcquireJob(id: string): AcquireJob | null {
  const store = getStore();
  if (store.jobs[id]) return store.jobs[id];
  // Reload disk in case another request context wrote it
  const disk = loadFromDisk();
  if (disk?.jobs[id]) {
    store.jobs[id] = disk.jobs[id];
    store.seq = Math.max(store.seq, disk.seq);
    return store.jobs[id];
  }
  return null;
}

export function listAcquireJobs(limit = 12): AcquireJob[] {
  const store = getStore();
  return Object.values(store.jobs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function isAcquireBusy(kind?: AcquireJobKind): boolean {
  for (const j of Object.values(getStore().jobs)) {
    if (j.status === "running" || j.status === "pending") {
      if (!kind || j.kind === kind) return true;
    }
  }
  return false;
}

/** Last disk flush time per job (throttle I/O, keep memory always fresh). */
const lastPersistAt = new Map<string, number>();

export function updateJobProgress(
  job: AcquireJob,
  progress: Partial<AcquireProgress>,
): void {
  job.progress = {
    ...job.progress,
    ...progress,
    percent:
      progress.percent === undefined
        ? job.progress.percent
        : progress.percent == null
          ? null
          : Math.max(0, Math.min(100, progress.percent)),
  };
  const store = getStore();
  store.jobs[job.id] = job;

  // Persist often enough that polls (and HMR reloads) see live %).
  const now = Date.now();
  const last = lastPersistAt.get(job.id) ?? 0;
  const stage = job.progress.stage;
  const force =
    stage === "queued" ||
    stage === "starting" ||
    stage === "done" ||
    stage === "failed" ||
    stage === "reindexing" ||
    stage === "merging" ||
    stage === "extracting" ||
    stage === "writing";
  if (force || now - last >= 400) {
    lastPersistAt.set(job.id, now);
    persist(store);
  }
}

function touchJob(job: AcquireJob): void {
  const store = getStore();
  store.jobs[job.id] = job;
  persist(store);
}

export async function runAcquireJob(
  job: AcquireJob,
  work: (
    report: (p: Partial<AcquireProgress>) => void,
  ) => Promise<Record<string, unknown>>,
): Promise<AcquireJob> {
  job.status = "running";
  job.startedAt = Date.now();
  updateJobProgress(job, {
    stage: "starting",
    percent: 1,
    detail: "Starting…",
  });
  touchJob(job);

  const report = (p: Partial<AcquireProgress>) => updateJobProgress(job, p);
  try {
    job.result = await work(report);
    job.status = "completed";
    updateJobProgress(job, {
      stage: "done",
      percent: 100,
      detail: "Complete",
    });
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    updateJobProgress(job, {
      stage: "failed",
      percent: job.progress.percent,
      detail: job.error,
    });
  } finally {
    job.finishedAt = Date.now();
    touchJob(job);
  }
  return job;
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
  };
}
