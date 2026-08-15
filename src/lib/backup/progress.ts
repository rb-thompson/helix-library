/**
 * Restore progress sidecar next to the DB (exportsRoot).
 * Snapshot copy overwrites the live jobs table, so apply cannot poll SQLite.
 */

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { exportsRoot } from "@/lib/backup/paths";
import type { HelixJobProgress, HelixJobStatus } from "@/lib/jobs/types";

export const RESTORE_SIDECAR_KEEP_MS = 24 * 60 * 60 * 1000;
const PROGRESS_FILE = ".restore-progress.json";

/** Mid-flight stages. Terminal done/failed/cancelled live on status. */
export const RESTORE_SIDECAR_STAGES = [
  "queued",
  "extract",
  "validate",
  "prerestore",
  "copy",
  "remap",
  "finalize",
] as const;

export type RestoreSidecarStage = (typeof RESTORE_SIDECAR_STAGES)[number];

export const RESTORE_STAGE_BANDS: Record<
  RestoreSidecarStage,
  { min: number; max: number; cancellable: boolean }
> = {
  queued: { min: 0, max: 0, cancellable: true },
  extract: { min: 5, max: 20, cancellable: true },
  validate: { min: 20, max: 30, cancellable: true },
  prerestore: { min: 30, max: 45, cancellable: true },
  copy: { min: 45, max: 80, cancellable: false },
  remap: { min: 80, max: 90, cancellable: false },
  finalize: { min: 90, max: 100, cancellable: false },
};

export type RestoreSidecarResult = {
  undoBackup?: string;
  appliedThumbs?: boolean;
  remapped?: boolean;
  itemCount?: number;
  partial?: boolean;
};

export type RestoreSidecar = {
  v: 1;
  jobIdHint: number | null;
  status: HelixJobStatus;
  label: string;
  archiveName: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  cancelRequested: boolean;
  progress: HelixJobProgress;
  result: RestoreSidecarResult | null;
};

export class RestoreProgressError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RestoreProgressError";
    this.status = status;
  }
}

export function restoreProgressPath(): string {
  return path.join(exportsRoot(), PROGRESS_FILE);
}

export function isRestoreSidecarStage(s: string): s is RestoreSidecarStage {
  return (RESTORE_SIDECAR_STAGES as readonly string[]).includes(s);
}

export function isRestoreStageCancellable(stage: string): boolean {
  if (stage === "done" || stage === "failed" || stage === "cancelled") {
    return false;
  }
  if (!isRestoreSidecarStage(stage)) return true;
  return RESTORE_STAGE_BANDS[stage].cancellable;
}

export function restoreStageProgress(
  stage: RestoreSidecarStage,
  opts?: { percent?: number; detail?: string },
): HelixJobProgress {
  const band = RESTORE_STAGE_BANDS[stage];
  const raw = opts?.percent;
  const percent =
    raw == null
      ? band.min
      : Math.max(band.min, Math.min(band.max, raw));
  return {
    stage,
    percent,
    ...(opts?.detail != null ? { detail: opts.detail } : {}),
  };
}

function writeJsonAtomic(dest: string, value: RestoreSidecar): void {
  const tmp = path.join(
    path.dirname(dest),
    `${path.basename(dest)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(tmp, 0o600);
    renameSync(tmp, dest);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* none */
    }
    throw err;
  }
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function parseSidecar(raw: unknown): RestoreSidecar | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.label !== "string" || typeof o.archiveName !== "string") {
    return null;
  }
  const createdAt = asFiniteNumber(o.createdAt);
  if (createdAt == null) return null;
  const status = o.status;
  if (
    status !== "pending" &&
    status !== "running" &&
    status !== "completed" &&
    status !== "failed" &&
    status !== "cancelled"
  ) {
    return null;
  }
  const progressRaw =
    o.progress && typeof o.progress === "object" && !Array.isArray(o.progress)
      ? (o.progress as Record<string, unknown>)
      : null;
  const stage =
    typeof progressRaw?.stage === "string" ? progressRaw.stage : "queued";
  const pct = progressRaw?.percent;
  const progress: HelixJobProgress = {
    stage,
    percent:
      pct === undefined || pct === null
        ? null
        : typeof pct === "number" && Number.isFinite(pct)
          ? pct
          : null,
    ...(typeof progressRaw?.detail === "string"
      ? { detail: progressRaw.detail }
      : {}),
  };
  const result =
    o.result && typeof o.result === "object" && !Array.isArray(o.result)
      ? (o.result as RestoreSidecarResult)
      : null;
  const jobIdHint =
    o.jobIdHint === null || o.jobIdHint === undefined
      ? null
      : asFiniteNumber(o.jobIdHint);
  if (o.jobIdHint != null && jobIdHint == null) return null;
  return {
    v: 1,
    jobIdHint,
    status,
    label: o.label,
    archiveName: o.archiveName,
    createdAt,
    startedAt: o.startedAt == null ? null : asFiniteNumber(o.startedAt),
    finishedAt: o.finishedAt == null ? null : asFiniteNumber(o.finishedAt),
    error: typeof o.error === "string" ? o.error : null,
    cancelRequested: Boolean(o.cancelRequested),
    progress,
    result,
  };
}

export function readRestoreProgress(): RestoreSidecar | null {
  const p = restoreProgressPath();
  if (!existsSync(p)) return null;
  try {
    return parseSidecar(JSON.parse(readFileSync(p, "utf8")) as unknown);
  } catch {
    return null;
  }
}

export function writeRestoreProgress(sidecar: RestoreSidecar): RestoreSidecar {
  const next: RestoreSidecar = { ...sidecar, v: 1 };
  writeJsonAtomic(restoreProgressPath(), next);
  return next;
}

export function initRestoreProgress(opts: {
  label: string;
  archiveName: string;
  now?: number;
}): RestoreSidecar {
  // Do not hide an in-flight apply; stale completed/failed sidecars may rotate.
  if (isRestoreSidecarBusy()) {
    throw new RestoreProgressError("Restore already in progress", 409);
  }
  const now = opts.now ?? Date.now();
  return writeRestoreProgress({
    v: 1,
    jobIdHint: null,
    status: "pending",
    label: opts.label,
    archiveName: opts.archiveName,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    error: null,
    cancelRequested: false,
    progress: restoreStageProgress("queued", { detail: "Waiting…" }),
    result: null,
  });
}

export function patchRestoreProgress(
  patch: Partial<Omit<RestoreSidecar, "v" | "progress">> & {
    progress?: Partial<HelixJobProgress>;
  },
): RestoreSidecar {
  const current = readRestoreProgress();
  if (!current) {
    throw new RestoreProgressError("No restore progress sidecar", 404);
  }
  const mergedProgress: HelixJobProgress = {
    ...current.progress,
    ...patch.progress,
    percent:
      patch.progress?.percent === undefined
        ? current.progress.percent
        : patch.progress.percent,
  };
  const stage = mergedProgress.stage;
  if (
    patch.progress?.percent === undefined &&
    patch.progress?.stage &&
    isRestoreSidecarStage(stage)
  ) {
    mergedProgress.percent = RESTORE_STAGE_BANDS[stage].min;
  }
  return writeRestoreProgress({
    ...current,
    ...patch,
    v: 1,
    progress: mergedProgress,
  });
}

export function requestRestoreCancel(): RestoreSidecar {
  const current = readRestoreProgress();
  if (!current) {
    throw new RestoreProgressError("No restore progress sidecar", 404);
  }
  if (current.cancelRequested) return current;
  return writeRestoreProgress({ ...current, cancelRequested: true });
}

export function isRestoreCancelRequested(): boolean {
  return Boolean(readRestoreProgress()?.cancelRequested);
}

export function isRestoreSidecarBusy(): boolean {
  const s = readRestoreProgress();
  if (!s) return false;
  return s.status === "pending" || s.status === "running";
}

export function clearRestoreProgress(): void {
  const p = restoreProgressPath();
  if (!existsSync(p)) return;
  try {
    unlinkSync(p);
  } catch {
    /* none */
  }
}
