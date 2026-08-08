/**
 * Unified Helix jobs: SQLite is source of truth (reindex + acquire).
 * Integer ids only; hard cutover from data/acquire-jobs.json.
 */

import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { desc, eq, inArray } from "drizzle-orm";
import { getDbPath } from "@/lib/config";
import { getDb, getSqlite } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import type {
  HelixJob,
  HelixJobKind,
  HelixJobProgress,
  HelixJobStatus,
} from "@/lib/jobs/types";
import { isHelixJobKind } from "@/lib/jobs/types";

const RETENTION = 50;
const PROGRESS_THROTTLE_MS = 400;

const lastProgressWrite = new Map<number, number>();

/** Optional yt-dlp (or other) child processes for cancel kill. */
const jobProcesses = new Map<
  number,
  { kill: (signal?: NodeJS.Signals | number) => boolean }
>();

export function registerJobProcess(
  jobId: number,
  child: { kill: (signal?: NodeJS.Signals | number) => boolean },
): void {
  jobProcesses.set(jobId, child);
}

export function unregisterJobProcess(jobId: number): void {
  jobProcesses.delete(jobId);
}

export function killJobProcess(jobId: number): boolean {
  const child = jobProcesses.get(jobId);
  if (!child) return false;
  try {
    child.kill("SIGTERM");
    return true;
  } catch {
    return false;
  } finally {
    jobProcesses.delete(jobId);
  }
}

function parseJson(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function defaultProgress(status: HelixJobStatus): HelixJobProgress {
  if (status === "completed") {
    return { stage: "done", percent: 100, detail: "Complete" };
  }
  if (status === "failed") {
    return { stage: "failed", percent: null, detail: undefined };
  }
  if (status === "cancelled") {
    return { stage: "cancelled", percent: null, detail: "Cancelled" };
  }
  if (status === "running") {
    return { stage: "running", percent: null, detail: undefined };
  }
  return { stage: "queued", percent: 0, detail: "Waiting…" };
}

type JobRow = typeof jobs.$inferSelect;

export function toHelixJob(row: JobRow): HelixJob {
  const kind = isHelixJobKind(row.kind ?? "reindex")
    ? (row.kind as HelixJobKind)
    : "reindex";
  const status = (row.status as HelixJobStatus) || "pending";
  const progressParsed = parseJson(row.progressJson) as HelixJobProgress | null;
  const progress: HelixJobProgress = progressParsed?.stage
    ? {
        stage: String(progressParsed.stage),
        percent:
          progressParsed.percent === undefined
            ? null
            : progressParsed.percent == null
              ? null
              : Number(progressParsed.percent),
        detail:
          progressParsed.detail != null
            ? String(progressParsed.detail)
            : undefined,
      }
    : defaultProgress(status);

  const result =
    kind === "reindex"
      ? parseJson(row.statsJson)
      : parseJson(row.resultJson);

  return {
    id: row.id,
    kind,
    status,
    label: row.label?.trim() || kind,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    error: row.error,
    progress,
    result,
    cancelRequested: Boolean(row.cancelRequested),
  };
}

function trimRetention(): void {
  const sqlite = getSqlite();
  const ids = sqlite
    .prepare(
      `SELECT id FROM jobs ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?`,
    )
    .all(RETENTION) as Array<{ id: number }>;
  if (!ids.length) return;
  const db = getDb();
  db.delete(jobs)
    .where(
      inArray(
        jobs.id,
        ids.map((r) => r.id),
      ),
    )
    .run();
}

export function createJob(opts: {
  kind: HelixJobKind;
  label: string;
  status?: HelixJobStatus;
}): HelixJob {
  importLegacyAcquireJobsFileOnce();
  const db = getDb();
  const now = Date.now();
  const status = opts.status ?? "pending";
  const progress = defaultProgress(status);
  const ins = db
    .insert(jobs)
    .values({
      kind: opts.kind,
      label: opts.label.slice(0, 200),
      status,
      createdAt: now,
      startedAt: status === "running" ? now : null,
      progressJson: JSON.stringify(progress),
      cancelRequested: 0,
    })
    .run();
  const id = Number(ins.lastInsertRowid);
  trimRetention();
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) throw new Error("Failed to create job");
  return toHelixJob(row);
}

export function getJob(id: number): HelixJob | null {
  importLegacyAcquireJobsFileOnce();
  if (!Number.isFinite(id) || id <= 0) return null;
  const db = getDb();
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  return row ? toHelixJob(row) : null;
}

export function listJobs(opts?: {
  limit?: number;
  kinds?: HelixJobKind[];
  status?: HelixJobStatus[];
}): HelixJob[] {
  importLegacyAcquireJobsFileOnce();
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));
  const db = getDb();
  let rows = db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(limit * 3)
    .all();

  if (opts?.kinds?.length) {
    const set = new Set(opts.kinds);
    rows = rows.filter((r) => set.has((r.kind ?? "reindex") as HelixJobKind));
  }
  if (opts?.status?.length) {
    const set = new Set(opts.status);
    rows = rows.filter((r) => set.has(r.status as HelixJobStatus));
  }
  return rows.slice(0, limit).map(toHelixJob);
}

export function updateJobProgress(
  id: number,
  progress: Partial<HelixJobProgress>,
  opts?: { force?: boolean },
): HelixJob | null {
  const db = getDb();
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return null;
  const current = toHelixJob(row);
  const next: HelixJobProgress = {
    ...current.progress,
    ...progress,
    percent:
      progress.percent === undefined
        ? current.progress.percent
        : progress.percent == null
          ? null
          : Math.max(0, Math.min(100, progress.percent)),
  };

  const now = Date.now();
  const last = lastProgressWrite.get(id) ?? 0;
  const stage = next.stage;
  const force =
    opts?.force ||
    stage === "queued" ||
    stage === "starting" ||
    stage === "done" ||
    stage === "failed" ||
    stage === "cancelled" ||
    stage === "reindexing" ||
    stage === "merging" ||
    stage === "extracting" ||
    stage === "writing";

  if (!force && now - last < PROGRESS_THROTTLE_MS) {
    // Still update in-memory view via DB only on force — for simplicity always write stage changes
    if (progress.stage == null && progress.detail == null) {
      return { ...current, progress: next };
    }
  }

  lastProgressWrite.set(id, now);
  db.update(jobs)
    .set({ progressJson: JSON.stringify(next) })
    .where(eq(jobs.id, id))
    .run();
  return getJob(id);
}

export function markJobRunning(id: number): void {
  const db = getDb();
  db.update(jobs)
    .set({
      status: "running",
      startedAt: Date.now(),
      error: null,
    })
    .where(eq(jobs.id, id))
    .run();
  updateJobProgress(
    id,
    { stage: "starting", percent: 1, detail: "Starting…" },
    { force: true },
  );
}

export function completeJob(
  id: number,
  result: Record<string, unknown> | null,
  opts?: { statsJson?: string },
): void {
  const db = getDb();
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return;
  const kind = row.kind ?? "reindex";
  db.update(jobs)
    .set({
      status: "completed",
      finishedAt: Date.now(),
      error: null,
      ...(kind === "reindex"
        ? {
            statsJson:
              opts?.statsJson ??
              (result ? JSON.stringify(result) : row.statsJson),
          }
        : { resultJson: result ? JSON.stringify(result) : null }),
      progressJson: JSON.stringify({
        stage: "done",
        percent: 100,
        detail: "Complete",
      }),
    })
    .where(eq(jobs.id, id))
    .run();
  lastProgressWrite.delete(id);
  unregisterJobProcess(id);
}

export function failJob(id: number, error: string): void {
  const db = getDb();
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return;
  const prev = toHelixJob(row);
  db.update(jobs)
    .set({
      status: "failed",
      finishedAt: Date.now(),
      error,
      progressJson: JSON.stringify({
        stage: "failed",
        percent: prev.progress.percent,
        detail: error,
      }),
    })
    .where(eq(jobs.id, id))
    .run();
  lastProgressWrite.delete(id);
  unregisterJobProcess(id);
}

/**
 * Run async work for any job kind (backup, etc.). Fire-and-forget friendly.
 */
export async function runHelixJob(
  jobId: number,
  work: (
    report: (p: Partial<HelixJobProgress>) => void,
  ) => Promise<Record<string, unknown>>,
): Promise<HelixJob | null> {
  markJobRunning(jobId);
  const report = (p: Partial<HelixJobProgress>) => {
    updateJobProgress(jobId, p);
  };
  try {
    if (isCancelRequested(jobId)) {
      failJob(jobId, "Cancelled");
      return getJob(jobId);
    }
    const result = await work(report);
    completeJob(jobId, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failJob(jobId, message || "Failed");
  }
  return getJob(jobId);
}

export function serializeHelixJob(job: HelixJob) {
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
  };
}

export function requestCancel(id: number): HelixJob | null {
  const db = getDb();
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return null;
  if (row.status !== "running" && row.status !== "pending") {
    return toHelixJob(row);
  }
  db.update(jobs)
    .set({ cancelRequested: 1 })
    .where(eq(jobs.id, id))
    .run();
  killJobProcess(id);
  // Soft-cancel pending immediately; running jobs check flag / process death
  if (row.status === "pending") {
    db.update(jobs)
      .set({
        status: "cancelled",
        finishedAt: Date.now(),
        error: "Cancelled",
        progressJson: JSON.stringify({
          stage: "cancelled",
          percent: null,
          detail: "Cancelled",
        }),
      })
      .where(eq(jobs.id, id))
      .run();
  }
  return getJob(id);
}

export function isCancelRequested(id: number): boolean {
  const db = getDb();
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  return Boolean(row?.cancelRequested);
}

export function isKindBusy(kind: HelixJobKind): boolean {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT id FROM jobs WHERE kind = ? AND status IN ('running', 'pending') LIMIT 1`,
    )
    .get(kind) as { id: number } | undefined;
  return Boolean(row);
}

let legacyImportDone = false;

/**
 * One-shot import of data/acquire-jobs.json → SQLite, then rename file.
 */
function legacyAcquireJobsPaths(): string[] {
  // Prefer alongside the SQLite DB; also check historic project data/ path.
  const nextToDb = path.join(path.dirname(getDbPath()), "acquire-jobs.json");
  const historic = path.join(process.cwd(), "data", "acquire-jobs.json");
  return nextToDb === historic ? [nextToDb] : [nextToDb, historic];
}

export function importLegacyAcquireJobsFileOnce(): void {
  if (legacyImportDone) return;
  legacyImportDone = true;

  const candidates = legacyAcquireJobsPaths().filter((p) => existsSync(p));
  const p = candidates[0];
  if (!p) return;
  const migrated = `${p}.migrated`;

  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      jobs?: Record<
        string,
        {
          id?: string;
          kind?: string;
          status?: string;
          createdAt?: number;
          startedAt?: number | null;
          finishedAt?: number | null;
          error?: string | null;
          result?: Record<string, unknown> | null;
          label?: string;
          progress?: HelixJobProgress;
        }
      >;
    };
    const entries = Object.values(raw.jobs ?? {});
    const db = getDb();

    for (const j of entries) {
      const kind = isHelixJobKind(j.kind ?? "") ? j.kind! : "arxiv";
      if (kind === "reindex") continue;

      let status: HelixJobStatus = "failed";
      let error = j.error ?? null;
      if (j.status === "completed") status = "completed";
      else if (j.status === "failed") status = "failed";
      else {
        status = "failed";
        error = error || "Interrupted by jobs migration";
      }

      const progress =
        j.progress ??
        (status === "completed"
          ? { stage: "done", percent: 100, detail: "Complete" }
          : {
              stage: "failed",
              percent: null,
              detail: error ?? undefined,
            });

      const labelBase = (j.label ?? kind).slice(0, 160);
      const legacy = j.id ? ` [legacy ${j.id}]` : "";

      db.insert(jobs)
        .values({
          kind,
          label: `${labelBase}${legacy}`.slice(0, 200),
          status,
          createdAt: j.createdAt ?? Date.now(),
          startedAt: j.startedAt ?? null,
          finishedAt: j.finishedAt ?? Date.now(),
          error,
          progressJson: JSON.stringify(progress),
          resultJson: j.result ? JSON.stringify(j.result) : null,
          cancelRequested: 0,
        })
        .run();
    }

    trimRetention();
    try {
      renameSync(p, migrated);
    } catch {
      try {
        unlinkSync(p);
      } catch {
        // ignore
      }
    }
  } catch {
    // leave file; will retry next boot if still present
    legacyImportDone = false;
  }
}

/** Test helper: allow re-import in isolated env */
export function resetLegacyImportFlagForTests(): void {
  legacyImportDone = false;
}
