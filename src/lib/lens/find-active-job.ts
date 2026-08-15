import { getSqlite } from "@/lib/db/client";
import { getJob } from "@/lib/jobs/store";
import type { HelixJob } from "@/lib/jobs/types";

function extractItemId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { itemId?: unknown };
    const n = typeof o.itemId === "number" ? o.itemId : Number(o.itemId);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

/**
 * Find pending/running lens_analyze job bound to itemId
 * (progress.itemId or result_json.itemId).
 */
export function findActiveLensJob(itemId: number): HelixJob | null {
  const id = Math.floor(Number(itemId));
  if (!Number.isFinite(id) || id <= 0) return null;

  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      `
      SELECT id, progress_json, result_json
      FROM jobs
      WHERE kind = 'lens_analyze'
        AND status IN ('pending', 'running')
      ORDER BY created_at DESC, id DESC
      LIMIT 40
    `,
    )
    .all() as Array<{
    id: number;
    progress_json: string | null;
    result_json: string | null;
  }>;

  for (const row of rows) {
    const fromProgress = extractItemId(row.progress_json);
    const fromResult = extractItemId(row.result_json);
    if (fromProgress === id || fromResult === id) {
      return getJob(row.id);
    }
  }
  return null;
}
