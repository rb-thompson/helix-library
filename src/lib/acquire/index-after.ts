import { applyAcquireTags } from "@/lib/acquire/auto-tags";
import type { AcquireJobKind } from "@/lib/acquire/jobs";
import { getSqlite } from "@/lib/db/client";
import { runReindex } from "@/lib/indexer/run";

/**
 * Reindex after acquiring a file. Returns catalog item id if found by path.
 * Optionally applies source + EXIF-derived tags.
 */
export async function indexAfterAcquire(
  absPath: string,
  opts?: { source?: AcquireJobKind },
): Promise<{ itemId: number | null; tags: string[] }> {
  await runReindex();
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(`SELECT id FROM items WHERE path = ? LIMIT 1`)
    .get(absPath) as { id: number } | undefined;
  const itemId = row?.id ?? null;
  let tags: string[] = [];
  if (itemId != null && opts?.source) {
    tags = applyAcquireTags(itemId, absPath, opts.source);
  }
  return { itemId, tags };
}
