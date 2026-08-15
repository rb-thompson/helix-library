export type HelixJobKind =
  | "reindex"
  | "backup"
  | "lens_analyze"
  | "arxiv"
  | "youtube"
  | "image"
  | "openalex"
  | "clip"
  | "grokipedia"
  | "image_url";

export type HelixJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type HelixJobProgress = {
  stage: string;
  percent: number | null;
  detail?: string;
  /** Durable binding for lens_analyze (and future kinds). Survives progress rewrites. */
  itemId?: number;
};

export type HelixJob = {
  /** SQLite PK — canonical external id */
  id: number;
  kind: HelixJobKind;
  status: HelixJobStatus;
  label: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  progress: HelixJobProgress;
  /**
   * acquire → result_json; reindex → stats_json
   */
  result: Record<string, unknown> | null;
  cancelRequested: boolean;
  /** User marked failed job as seen (clears rescue warnings). */
  dismissed: boolean;
};

export const ACQUIRE_JOB_KINDS = [
  "arxiv",
  "youtube",
  "image",
  "openalex",
  "clip",
  "grokipedia",
  "image_url",
] as const;
export type AcquireJobKind = (typeof ACQUIRE_JOB_KINDS)[number];

export function isAcquireJobKind(k: string): k is AcquireJobKind {
  return (ACQUIRE_JOB_KINDS as readonly string[]).includes(k);
}

export function isHelixJobKind(k: string): k is HelixJobKind {
  return (
    k === "reindex" ||
    k === "backup" ||
    k === "lens_analyze" ||
    isAcquireJobKind(k)
  );
}
