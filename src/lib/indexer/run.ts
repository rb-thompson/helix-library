import { existsSync } from "node:fs";
import path from "node:path";
import mime from "mime";
import { eq } from "drizzle-orm";
import { loadConfig } from "@/lib/config";
import { assertCatalogWritable, getDb, getSqlite } from "@/lib/db/client";
import { itemText, items, jobs, locations } from "@/lib/db/schema";
import { classifyKind, extensionOf } from "@/lib/indexer/classify";
import {
  enrichFile,
  extractVideoPosterAsync,
  hasThumb,
} from "@/lib/indexer/enrich";
import { mapPool } from "@/lib/indexer/pool";
import { contentHash } from "@/lib/indexer/hash";
import { extractPdfTitle } from "@/lib/indexer/pdf";
import { walkFiles } from "@/lib/indexer/walk";
import { syncLocationsFromConfig } from "@/lib/locations/sync";
import type { IndexJobStats, ItemKind } from "@/lib/types";

/** Re-export for callers that historically imported from indexer/run */
export { syncLocationsFromConfig };

/** Preserve non-filename catalog titles across reindex (KD6). */
export function nextTitle(
  existing:
    | { title: string; titleSource?: string | null; name: string }
    | undefined,
  basename: string,
): { title: string; titleSource: string } {
  if (!existing) return { title: basename, titleSource: "filename" };
  const src = existing.titleSource ?? "filename";
  if (src && src !== "filename") {
    return { title: existing.title, titleSource: src };
  }
  if (existing.title && existing.title !== existing.name) {
    return { title: existing.title, titleSource: "manual" };
  }
  return { title: basename, titleSource: "filename" };
}

function emptyStats(): IndexJobStats {
  return {
    seen: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
    missing: 0,
    skipped: 0,
    errors: 0,
    locations: 0,
  };
}

/**
 * Sync config locations into DB (upsert by root_path).
 */
function needsEnrichment(row: {
  id: number;
  kind: string;
  mime: string | null;
  ext: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}): boolean {
  if (row.kind === "image" && (row.width == null || !hasThumb(row.id))) {
    return true;
  }
  if (row.kind === "video") {
    if (row.durationMs == null || !hasThumb(row.id) || row.width == null) {
      return true;
    }
  }
  if (row.kind === "audio" && row.durationMs == null) {
    return true;
  }
  const wantsBody =
    row.kind === "text" ||
    row.kind === "code" ||
    row.mime === "application/pdf" ||
    (row.kind === "document" && (row.ext ?? "").toLowerCase() === "pdf");
  if (wantsBody) {
    const db = getDb();
    const text = db
      .select()
      .from(itemText)
      .where(eq(itemText.itemId, row.id))
      .get();
    if (!text) return true;
  }
  return false;
}

/**
 * Persist extracted body for FTS.
 * - `null` → do not change existing row (N/A for this kind)
 * - `""` or non-empty → upsert (empty marks “attempted, no text”)
 */
function upsertItemText(itemId: number, body: string | null): void {
  if (body === null) return;

  const db = getDb();
  const existing = db
    .select()
    .from(itemText)
    .where(eq(itemText.itemId, itemId))
    .get();
  if (existing) {
    db.update(itemText)
      .set({ body, extractedAt: Date.now() })
      .where(eq(itemText.itemId, itemId))
      .run();
  } else {
    db.insert(itemText)
      .values({ itemId, body, extractedAt: Date.now() })
      .run();
  }
}

/** In-process single-flight lock for reindex jobs. */
let inflight: {
  jobId: number;
  promise: Promise<{ jobId: number; stats: IndexJobStats }>;
} | null = null;

export function getInflightReindexJobId(): number | null {
  return inflight?.jobId ?? null;
}

export function isReindexRunning(): boolean {
  if (inflight) return true;
  const latest = getLatestJob();
  return latest?.status === "running";
}

/**
 * Start reindex without blocking the caller on completion.
 * Concurrent starts join the same in-flight job.
 */
export function startReindexAsync(): {
  jobId: number;
  alreadyRunning: boolean;
  promise: Promise<{ jobId: number; stats: IndexJobStats }>;
} {
  assertCatalogWritable();
  if (inflight) {
    return {
      jobId: inflight.jobId,
      alreadyRunning: true,
      promise: inflight.promise,
    };
  }

  const db = getDb();
  const insertJob = db
    .insert(jobs)
    .values({
      status: "running",
      startedAt: Date.now(),
      kind: "reindex",
      label: "Reindex holdings",
      progressJson: JSON.stringify({
        stage: "running",
        percent: null,
        detail: "Walking locations…",
      }),
      cancelRequested: 0,
    })
    .run();
  const jobId = Number(insertJob.lastInsertRowid);

  const promise = executeReindexJob(jobId).finally(() => {
    if (inflight?.jobId === jobId) inflight = null;
  });
  inflight = { jobId, promise };
  return { jobId, alreadyRunning: false, promise };
}

/** Full reindex (CLI / awaiters). Joins an in-flight job if one is running. */
export async function runReindex(): Promise<{
  jobId: number;
  stats: IndexJobStats;
}> {
  const { promise } = startReindexAsync();
  return promise;
}

async function executeReindexJob(
  jobId: number,
): Promise<{ jobId: number; stats: IndexJobStats }> {
  const config = loadConfig(true);
  syncLocationsFromConfig();

  const db = getDb();
  const sqlite = getSqlite();
  const stats = emptyStats();

  try {
    const enabledLocations = db
      .select()
      .from(locations)
      .where(eq(locations.enabled, 1))
      .all();

    stats.locations = enabledLocations.length;

    for (const loc of enabledLocations) {
      if (!existsSync(loc.rootPath)) {
        stats.errors += 1;
        continue;
      }

      const seenPaths = new Set<string>();
      const posterJobs: Array<{ filePath: string; itemId: number }> = [];

      for await (const file of walkFiles({
        root: loc.rootPath,
        ignore: config.ignore,
        maxFileBytes: config.maxFileBytes,
        onSkipped: () => {
          stats.skipped += 1;
        },
      })) {
        stats.seen += 1;
        seenPaths.add(file.absPath);

        try {
          const mimeType = mime.getType(file.absPath);
          const kind = classifyKind(file.absPath, mimeType) as ItemKind;
          const ext = extensionOf(file.absPath);
          const basename = path.basename(file.absPath);

          const existing = db
            .select()
            .from(items)
            .where(eq(items.path, file.absPath))
            .get();

          let hash = existing?.contentHash ?? null;
          const unchangedMeta =
            existing &&
            existing.sizeBytes === file.sizeBytes &&
            existing.mtimeMs === file.mtimeMs &&
            existing.isMissing === 0;

          if (!unchangedMeta) {
            hash = await contentHash(
              file.absPath,
              file.sizeBytes,
              config.hashFullUnderBytes,
            );
          }

          if (
            existing &&
            unchangedMeta &&
            existing.contentHash === hash &&
            existing.locationId === loc.id
          ) {
            if (needsEnrichment(existing)) {
              const enrichment = await enrichFile({
                filePath: file.absPath,
                itemId: existing.id,
                kind: existing.kind as ItemKind,
                mime: existing.mime,
                existingWidth: existing.width,
                existingHeight: existing.height,
                existingDurationMs: existing.durationMs,
                deferPoster: existing.kind === "video",
              });
              if (enrichment.posterPending) {
                posterJobs.push({
                  filePath: file.absPath,
                  itemId: existing.id,
                });
              }
              db.update(items)
                .set({
                  width: enrichment.width,
                  height: enrichment.height,
                  durationMs: enrichment.durationMs,
                  indexedAt: Date.now(),
                })
                .where(eq(items.id, existing.id))
                .run();
              upsertItemText(existing.id, enrichment.body);
              stats.updated += 1;
            } else {
              stats.unchanged += 1;
            }
            continue;
          }

          let { title, titleSource } = nextTitle(
            existing
              ? {
                  title: existing.title,
                  titleSource: existing.titleSource,
                  name: existing.name,
                }
              : undefined,
            basename,
          );

          // First-time / filename titles: try PDF Info Title (PR7)
          if (
            titleSource === "filename" &&
            (kind === "document" || mimeType === "application/pdf")
          ) {
            const pdfTitle = extractPdfTitle(file.absPath);
            if (pdfTitle && pdfTitle !== basename) {
              title = pdfTitle;
              titleSource = "pdf";
            }
          }

          // Insert/update base row first so we have an id for thumbs/body
          const baseRow = {
            locationId: loc.id,
            path: file.absPath,
            relPath: file.relPath,
            name: basename,
            ext,
            kind,
            mime: mimeType,
            sizeBytes: file.sizeBytes,
            mtimeMs: file.mtimeMs,
            ctimeMs: file.ctimeMs,
            contentHash: hash,
            title,
            titleSource,
            width: existing?.width ?? null,
            height: existing?.height ?? null,
            durationMs: existing?.durationMs ?? null,
            indexedAt: Date.now(),
            isMissing: 0,
          };

          let itemId: number;
          if (existing) {
            db.update(items).set(baseRow).where(eq(items.id, existing.id)).run();
            itemId = existing.id;
            stats.updated += 1;
          } else {
            const ins = db.insert(items).values(baseRow).run();
            itemId = Number(ins.lastInsertRowid);
            stats.added += 1;
          }

          const enrichment = await enrichFile({
            filePath: file.absPath,
            itemId,
            kind,
            mime: mimeType,
            force: true,
            deferPoster: kind === "video",
          });
          if (enrichment.posterPending) {
            posterJobs.push({ filePath: file.absPath, itemId });
          }

          db.update(items)
            .set({
              width: enrichment.width,
              height: enrichment.height,
              durationMs: enrichment.durationMs,
            })
            .where(eq(items.id, itemId))
            .run();

          upsertItemText(itemId, enrichment.body);
        } catch {
          stats.errors += 1;
        }

        if (stats.seen % 500 === 0) {
          await new Promise((r) => setImmediate(r));
        }
      }

      if (posterJobs.length) {
        await mapPool(posterJobs, 3, async (job) => {
          await extractVideoPosterAsync(job.filePath, job.itemId);
        });
      }

      const locationItems = db
        .select({ id: items.id, path: items.path, isMissing: items.isMissing })
        .from(items)
        .where(eq(items.locationId, loc.id))
        .all();

      for (const item of locationItems) {
        if (!seenPaths.has(item.path) && item.isMissing === 0) {
          db.update(items)
            .set({ isMissing: 1, indexedAt: Date.now() })
            .where(eq(items.id, item.id))
            .run();
          stats.missing += 1;
        }
      }
    }

    const ftsCount = sqlite
      .prepare(`SELECT count(*) as c FROM items_fts`)
      .get() as { c: number };
    const itemCount = sqlite
      .prepare(`SELECT count(*) as c FROM items`)
      .get() as { c: number };
    if (itemCount.c > 0 && ftsCount.c === 0) {
      sqlite.exec(`
        INSERT INTO items_fts(rowid, name, rel_path, title, ext)
        SELECT id, name, rel_path, title, coalesce(ext, '') FROM items;
      `);
    }

    const bodyFts = sqlite
      .prepare(`SELECT count(*) as c FROM item_body_fts`)
      .get() as { c: number };
    const bodyCount = sqlite
      .prepare(`SELECT count(*) as c FROM item_text`)
      .get() as { c: number };
    if (bodyCount.c > 0 && bodyFts.c === 0) {
      sqlite.exec(`
        INSERT INTO item_body_fts(rowid, body)
        SELECT item_id, body FROM item_text;
      `);
    }

    db.update(jobs)
      .set({
        status: "completed",
        finishedAt: Date.now(),
        statsJson: JSON.stringify(stats),
        error: null,
      })
      .where(eq(jobs.id, jobId))
      .run();

    return { jobId, stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(jobs)
      .set({
        status: "failed",
        finishedAt: Date.now(),
        statsJson: JSON.stringify(stats),
        error: message,
      })
      .where(eq(jobs.id, jobId))
      .run();
    throw err;
  }
}

/** Latest reindex job (ignores acquire rows in unified jobs table). */
export function getLatestJob() {
  const db = getDb();
  const rows = db
    .select()
    .from(jobs)
    .where(eq(jobs.kind, "reindex"))
    .all();
  return rows.at(-1) ?? null;
}

export function getJobById(id: number) {
  const db = getDb();
  return db.select().from(jobs).where(eq(jobs.id, id)).get() ?? null;
}

export function serializeJob(job: NonNullable<ReturnType<typeof getLatestJob>>) {
  let stats: IndexJobStats | null = null;
  if (job.statsJson) {
    try {
      stats = JSON.parse(job.statsJson) as IndexJobStats;
    } catch {
      stats = null;
    }
  }
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    stats,
    inflight: inflight?.jobId === job.id,
  };
}
