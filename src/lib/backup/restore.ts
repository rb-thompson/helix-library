/**
 * Logical catalog restore: ATTACH a snapshot and copy tables into the
 * still-open live connection. Never rename library.db.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { isAcquireBusy } from "@/lib/acquire/jobs";
import { createPreRestoreBackup } from "@/lib/backup/create";
import {
  assertRestorableRoot,
  inspectBackup,
  normalizeMemberName,
} from "@/lib/backup/inspect";
import {
  exportArchivePath,
  exportsRoot,
  isRestoreLockHeld,
  parseBackupArchiveFilename,
  restoreLockPath,
} from "@/lib/backup/paths";
import {
  initRestoreProgress,
  isRestoreCancelRequested,
  isRestoreSidecarBusy,
  patchRestoreProgress,
  RestoreProgressError,
  restoreStageProgress,
  type RestoreSidecarStage,
} from "@/lib/backup/progress";
import { RESTORE_FTS, RESTORE_TABLES } from "@/lib/backup/tables";
import type { RestoreLocationAction } from "@/lib/backup/types";
import { getDbPath, saveLocationsToConfig } from "@/lib/config";
import {
  getSqlite,
  looksLikeSqlite,
  RestoreBusyError,
  setRestoreGate,
} from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { isReindexRunning } from "@/lib/indexer/run";
import { completeJob, createJob, isKindBusy } from "@/lib/jobs/store";
import { syncLocationsFromConfig } from "@/lib/locations/sync";
import { thumbsDir } from "@/lib/media/thumbs";

export const DISK_SLACK_BYTES = 64 * 1024 * 1024;
const EXTRACT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** Catalog payload ceiling for the pre-extract free-space guess (holdings are never extracted). */
export const CATALOG_PRECHECK_CEILING_BYTES = 512 * 1024 * 1024;
const BEGIN_RETRIES = 5;
const BEGIN_RETRY_MS = 200;

const APPLY_EXTRACT_ALLOW = [
  /^MANIFEST\.json$/,
  /^library\.config\.json$/,
  /^library\.db$/,
  /^library\.db-wal$/,
  /^library\.db-shm$/,
  /^thumbs\/?$/,
  /^thumbs\/[^/]+\.webp$/,
];

export type RestoreLocationActionSpec = {
  name: string;
  action: RestoreLocationAction;
  remapTo?: string;
};

export type ApplyRestoreOpts = {
  name: string;
  includeThumbs?: boolean;
  applyLocationRoots?: boolean;
  locationActions?: RestoreLocationActionSpec[];
};

export type ApplyRestoreResult = {
  undoBackup: string;
  appliedThumbs: boolean;
  remapped: boolean;
  itemCount: number;
  jobId: number;
  partial?: boolean;
  error?: string | null;
};

export class RestoreApplyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "RestoreApplyError";
    this.status = status;
  }
}

/** Test-only hooks. Cleared by tests after use. */
export const restoreTestHooks: {
  afterForeignKeysOff?: () => void;
  afterSidecarClaim?: () => void | Promise<void>;
  injectBeginBusy?: number;
  duringBeginRetry?: () => void;
  /** When set, both volume free-space reads return this value. */
  freeBytesOverride?: number;
} = {};

export function restoreApplyAllowed(): boolean {
  const v = process.env.NON_OS_RESTORE;
  if (v == null || v === "") return true;
  return v !== "0" && v.toLowerCase() !== "false";
}

type LocRow = {
  id: number;
  name: string;
  root_path: string;
  enabled: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function throwIfCancelled(): void {
  if (isRestoreCancelRequested()) {
    throw new RestoreApplyError("Restore cancelled", 409);
  }
}

function report(stage: RestoreSidecarStage, detail?: string): void {
  try {
    patchRestoreProgress({
      status: "running",
      progress: restoreStageProgress(stage, { detail }),
    });
  } catch {
    /* sidecar optional for direct lib calls that failed to init */
  }
}

/** Busy locks — call before consuming the confirm token so a 409 does not burn it. */
export function assertRestoreApplyAvailable(): void {
  if (isRestoreSidecarBusy()) {
    throw new RestoreApplyError("Restore already in progress", 409);
  }
  if (isReindexRunning()) {
    throw new RestoreApplyError("Cannot restore while a reindex is running", 409);
  }
  if (isKindBusy("backup")) {
    throw new RestoreApplyError("Cannot restore while a backup is running", 409);
  }
  if (isKindBusy("restore")) {
    throw new RestoreApplyError("Restore already in progress", 409);
  }
  if (isAcquireBusy()) {
    throw new RestoreApplyError("Cannot restore while an acquire job is running", 409);
  }
  if (isKindBusy("lens_analyze")) {
    throw new RestoreApplyError(
      "Cannot restore while a lens analysis is running",
      409,
    );
  }
  if (isRestoreLockHeld()) {
    throw new RestoreApplyError(
      "another process has the catalog open (stop `npm run watch`)",
      409,
    );
  }
}

function writeRestoreLock(): void {
  writeFileSync(
    restoreLockPath(),
    `${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}\n`,
    "utf8",
  );
}

function unlinkRestoreLock(): void {
  try {
    unlinkSync(restoreLockPath());
  } catch {
    /* none */
  }
}

function archiveHasMember(archive: string, member: string): boolean {
  const r = spawnSync("tar", ["-tzf", archive, member], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const names = (r.stdout || "")
    .split("\n")
    .map((s) => normalizeMemberName(s.trim()))
    .filter(Boolean);
  return names.some(
    (n) => n === member || n === `${member}/` || n.startsWith(`${member}/`),
  );
}

function extractMembers(archive: string, dest: string, members: string[]): void {
  if (members.length === 0) {
    throw new RestoreApplyError("Nothing to extract from archive");
  }
  const r = spawnSync(
    "tar",
    [
      "-xzf",
      archive,
      "-C",
      dest,
      "--no-same-owner",
      "--no-overwrite-dir",
      "--anchored",
      ...members,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new RestoreApplyError(
      `tar extract failed: ${(r.stderr || r.stdout || "").slice(0, 400)}`,
    );
  }
}

function posixRel(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}

function pathIsUnder(root: string, abs: string): boolean {
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function walkExtractedTree(staging: string): void {
  const stagingReal = realpathSync(staging);
  const stack = [staging];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const name of readdirSync(cur)) {
      const p = path.join(cur, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) {
        throw new RestoreApplyError(`Refusing symlink in extract: ${name}`);
      }
      if (st.isFile() && st.nlink > 1) {
        throw new RestoreApplyError(`Refusing hardlink in extract: ${name}`);
      }
      let physical: string;
      try {
        physical = realpathSync(p);
      } catch {
        throw new RestoreApplyError(`Unreadable extract path: ${name}`);
      }
      if (!pathIsUnder(stagingReal, physical)) {
        throw new RestoreApplyError("Extracted file escaped staging");
      }
      const rel = posixRel(staging, p);
      if (rel === "holdings" || rel.startsWith("holdings/")) {
        throw new RestoreApplyError("Holdings members must not be extracted");
      }
      if (st.isDirectory()) {
        if (rel !== "" && rel !== "thumbs") {
          throw new RestoreApplyError(`Unexpected directory in extract: ${rel}`);
        }
        stack.push(p);
        continue;
      }
      if (!st.isFile()) {
        throw new RestoreApplyError(`Unsupported extract entry: ${rel}`);
      }
      if (!APPLY_EXTRACT_ALLOW.some((re) => re.test(rel))) {
        throw new RestoreApplyError(
          `Extracted member not on apply allowlist: ${rel}`,
        );
      }
    }
  }
}

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const name of readdirSync(cur)) {
      const p = path.join(cur, name);
      const st = lstatSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile()) total += st.size;
    }
  }
  return total;
}

function freeBytes(dir: string): number {
  if (restoreTestHooks.freeBytesOverride != null) {
    return restoreTestHooks.freeBytesOverride;
  }
  try {
    const s = statfsSync(dir);
    return s.bsize * s.bavail;
  } catch {
    throw new RestoreApplyError("Cannot measure free disk space", 507);
  }
}

/**
 * Pre-extract free-space need. `null` means skip (holdings-sized archive;
 * apply never extracts holdings/ — post-extract db+thumbs check is enough).
 */
export function preExtractDiskNeed(
  archiveBytes: number,
  opts: { hasHoldings: boolean },
): number | null {
  if (opts.hasHoldings) return null;
  const catalogBytes = Math.min(
    Math.max(0, archiveBytes),
    CATALOG_PRECHECK_CEILING_BYTES,
  );
  return 2 * catalogBytes + DISK_SLACK_BYTES;
}

function assertDiskBudget(need: number): void {
  const dbFree = freeBytes(path.dirname(getDbPath()));
  const expFree = freeBytes(exportsRoot());
  if (dbFree < need) {
    throw new RestoreApplyError(
      "Not enough free disk space on the catalog volume",
      507,
    );
  }
  if (expFree < need) {
    throw new RestoreApplyError(
      "Not enough free disk space on the exports volume",
      507,
    );
  }
}

function checkpointBusy(raw: unknown): number {
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object") {
    const b = (raw[0] as { busy?: unknown }).busy;
    return typeof b === "number" ? b : 1;
  }
  return 1;
}

function assertSnapshotCatalogFile(stagingDb: string): void {
  if (!existsSync(stagingDb) || !statSync(stagingDb).isFile()) {
    throw new RestoreApplyError("Archive is missing library.db");
  }
  if (statSync(stagingDb).size < 16 || !looksLikeSqlite(stagingDb)) {
    throw new RestoreApplyError("Snapshot library.db is not a SQLite catalog");
  }
}

function applyPackedWal(stagingDb: string): void {
  const wal = `${stagingDb}-wal`;
  if (!existsSync(wal)) return;
  assertSnapshotCatalogFile(stagingDb);
  const db = new Database(stagingDb, { fileMustExist: true });
  try {
    const raw = db.pragma("wal_checkpoint(TRUNCATE)");
    if (checkpointBusy(raw) !== 0) {
      throw new RestoreApplyError(
        "Could not apply packed WAL (checkpoint busy)",
      );
    }
  } finally {
    db.close();
  }
  for (const suf of ["-wal", "-shm"]) {
    const p = `${stagingDb}${suf}`;
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        /* leftover */
      }
    }
  }
}

function migrateStagingCopy(stagingDb: string): string {
  assertSnapshotCatalogFile(stagingDb);
  const migrated = `${stagingDb}.migrated`;
  cpSync(stagingDb, migrated);
  const db = new Database(migrated, { fileMustExist: true });
  try {
    const items = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='items'`,
      )
      .get();
    const locations = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='locations'`,
      )
      .get();
    if (!items || !locations) {
      throw new RestoreApplyError(
        "Snapshot is missing required table items or locations",
      );
    }
    migrate(db);
  } finally {
    db.close();
  }
  return migrated;
}

function tableExists(
  sqlite: Database.Database,
  schemaName: string,
  table: string,
): boolean {
  const row = sqlite
    .prepare(
      `SELECT 1 AS ok FROM ${schemaName}.sqlite_master WHERE type='table' AND name=?`,
    )
    .get(table) as { ok: number } | undefined;
  return Boolean(row);
}

function tableColumns(
  sqlite: Database.Database,
  schemaName: string,
  table: string,
): string[] {
  const pragma =
    schemaName === "main"
      ? `PRAGMA table_info(${table})`
      : `PRAGMA ${schemaName}.table_info(${table})`;
  return (sqlite.prepare(pragma).all() as Array<{ name: string }>).map(
    (r) => r.name,
  );
}

function isBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /busy|locked/i.test(msg);
}

/** FK off + BEGIN as one non-yielding pair. Restore FK before any await. */
async function beginImmediateWithFkOff(sqlite: Database.Database): Promise<void> {
  for (let i = 0; i < BEGIN_RETRIES; i++) {
    sqlite.pragma("foreign_keys = OFF");
    try {
      if (
        restoreTestHooks.injectBeginBusy != null &&
        restoreTestHooks.injectBeginBusy > 0
      ) {
        restoreTestHooks.injectBeginBusy -= 1;
        throw new Error("database is locked");
      }
      sqlite.exec("BEGIN IMMEDIATE");
      return;
    } catch (e) {
      sqlite.pragma("foreign_keys = ON");
      if (!isBusyError(e)) throw e;
      restoreTestHooks.duringBeginRetry?.();
      await sleep(BEGIN_RETRY_MS);
    }
  }
  throw new RestoreApplyError(
    "another process has the catalog open (stop `npm run watch`)",
    409,
  );
}

export function rewriteItemPaths(
  sqlite: Database.Database,
  locationId: number,
  newRoot: string,
): void {
  const root = path.resolve(newRoot);
  const rows = sqlite
    .prepare(`SELECT id, path, rel_path FROM items WHERE location_id = ?`)
    .all(locationId) as Array<{ id: number; path: string; rel_path: string }>;
  const upd = sqlite.prepare(`UPDATE items SET path = ? WHERE id = ?`);
  const taken = new Set(
    (sqlite.prepare(`SELECT path FROM items`).all() as Array<{ path: string }>).map(
      (r) => r.path,
    ),
  );
  for (const row of rows) {
    if (
      path.isAbsolute(row.rel_path) ||
      row.rel_path.split(/[/\\]/).some((seg) => seg === "..")
    ) {
      throw new RestoreApplyError(
        `items.rel_path escapes location root: ${row.rel_path}`,
      );
    }
    const abs = path.resolve(root, row.rel_path);
    if (!pathIsUnder(root, abs)) {
      throw new RestoreApplyError(
        `items.rel_path escapes location root: ${row.rel_path}`,
      );
    }
    if (taken.has(abs) && abs !== row.path) {
      throw new RestoreApplyError(`items.path collision after remap: ${abs}`);
    }
    taken.delete(row.path);
    taken.add(abs);
    upd.run(abs, row.id);
  }
}

function matchLiveLocation(snap: LocRow, live: LocRow[]): LocRow | null {
  const byName = live.filter((l) => l.name === snap.name);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    return byName.find((l) => l.root_path === snap.root_path) ?? null;
  }
  return live.find((l) => l.root_path === snap.root_path) ?? null;
}

function pickAction(
  snap: LocRow,
  live: LocRow[],
  opts: ApplyRestoreOpts,
): { action: RestoreLocationAction; spec?: RestoreLocationActionSpec } {
  if (opts.applyLocationRoots && opts.locationActions?.length) {
    const spec = opts.locationActions.find((a) => a.name === snap.name);
    if (spec) return { action: spec.action, spec };
  }
  const hasName = live.some((l) => l.name === snap.name);
  return { action: hasName ? "keep-live" : "disable" };
}

function computeRemap(
  snap: LocRow,
  liveMatch: LocRow | null,
  action: RestoreLocationAction,
  spec?: RestoreLocationActionSpec,
): { newRoot: string; enabled: number } {
  switch (action) {
    case "keep-live":
      if (liveMatch) {
        return { newRoot: liveMatch.root_path, enabled: liveMatch.enabled };
      }
      return { newRoot: snap.root_path, enabled: 0 };
    case "use-archived":
      return { newRoot: path.resolve(snap.root_path), enabled: 1 };
    case "remap":
      return { newRoot: path.resolve(spec?.remapTo ?? snap.root_path), enabled: 1 };
    case "disable":
    default:
      return {
        newRoot: liveMatch?.root_path ?? snap.root_path,
        enabled: 0,
      };
  }
}

function validateLocationActions(
  previewLocs: Array<{ name: string; archivedRoot: string }>,
  opts: ApplyRestoreOpts,
): void {
  if (!opts.applyLocationRoots || !opts.locationActions?.length) return;
  for (const spec of opts.locationActions) {
    if (spec.action === "remap") {
      if (!spec.remapTo?.trim()) {
        throw new RestoreApplyError(`remap requires remapTo for “${spec.name}”`);
      }
      assertRestorableRoot(spec.remapTo);
    } else if (spec.action === "use-archived") {
      const loc = previewLocs.find((l) => l.name === spec.name);
      if (!loc) {
        throw new RestoreApplyError(`Unknown location “${spec.name}”`);
      }
      assertRestorableRoot(loc.archivedRoot);
    }
  }
}

function remapCopiedLocations(
  sqlite: Database.Database,
  liveBefore: LocRow[],
  opts: ApplyRestoreOpts,
): boolean {
  const copied = sqlite
    .prepare(`SELECT id, name, root_path, enabled FROM locations`)
    .all() as LocRow[];
  const upd = sqlite.prepare(
    `UPDATE locations SET root_path = ?, enabled = ? WHERE id = ?`,
  );
  let remapped = false;
  for (const snap of copied) {
    const { action, spec } = pickAction(snap, liveBefore, opts);
    const liveMatch = matchLiveLocation(snap, liveBefore);
    const { newRoot, enabled } = computeRemap(snap, liveMatch, action, spec);
    upd.run(newRoot, enabled, snap.id);
    rewriteItemPaths(sqlite, snap.id, newRoot);
    if (path.resolve(newRoot) !== path.resolve(snap.root_path)) {
      remapped = true;
    }
  }
  return remapped || Boolean(opts.applyLocationRoots);
}

function persistLocationConfig(
  sqlite: Database.Database,
  liveBefore: LocRow[],
  applyLocationRoots: boolean,
): void {
  if (applyLocationRoots) {
    const rows = sqlite
      .prepare(`SELECT name, root_path, enabled FROM locations`)
      .all() as Array<{ name: string; root_path: string; enabled: number }>;
    const mapped = rows.map((r) => ({
      name: r.name,
      rootPath: r.root_path,
      enabled: r.enabled === 1,
    }));
    const have = new Set(mapped.map((r) => path.resolve(r.rootPath)));
    for (const live of liveBefore) {
      if (!have.has(path.resolve(live.root_path))) {
        mapped.push({
          name: live.name,
          rootPath: live.root_path,
          enabled: live.enabled === 1,
        });
      }
    }
    saveLocationsToConfig(mapped);
  } else {
    saveLocationsToConfig(
      liveBefore.map((l) => ({
        name: l.name,
        rootPath: l.root_path,
        enabled: l.enabled === 1,
      })),
    );
  }
  syncLocationsFromConfig();
}

function copySequences(sqlite: Database.Database): void {
  if (!tableExists(sqlite, "snap", "sqlite_sequence")) return;
  if (!tableExists(sqlite, "main", "sqlite_sequence")) return;
  const names = [...RESTORE_TABLES];
  const ph = names.map(() => "?").join(",");
  const rows = sqlite
    .prepare(
      `SELECT name, seq FROM snap.sqlite_sequence WHERE name IN (${ph})`,
    )
    .all(...names) as Array<{ name: string; seq: number }>;
  const del = sqlite.prepare(`DELETE FROM main.sqlite_sequence WHERE name = ?`);
  const ins = sqlite.prepare(
    `INSERT INTO main.sqlite_sequence(name, seq) VALUES (?, ?)`,
  );
  for (const r of rows) {
    del.run(r.name);
    ins.run(r.name, r.seq);
  }
}

function copyTables(sqlite: Database.Database): void {
  for (const table of [...RESTORE_TABLES].reverse()) {
    sqlite.exec(`DELETE FROM "${table}"`);
  }
  for (const table of RESTORE_TABLES) {
    if (!tableExists(sqlite, "snap", table)) {
      if (table === "items" || table === "locations") {
        throw new RestoreApplyError(`Snapshot is missing required table ${table}`);
      }
      continue;
    }
    const liveCols = tableColumns(sqlite, "main", table);
    const snapCols = tableColumns(sqlite, "snap", table);
    const common = liveCols.filter((c) => snapCols.includes(c));
    if (common.length === 0) continue;
    const cols = common.map((c) => `"${c}"`).join(", ");
    sqlite.exec(
      `INSERT INTO main."${table}" (${cols}) SELECT ${cols} FROM snap."${table}"`,
    );
  }
  for (const fts of RESTORE_FTS) {
    if (tableExists(sqlite, "main", fts)) {
      sqlite.exec(`INSERT INTO "${fts}"("${fts}") VALUES('rebuild')`);
    }
  }
  copySequences(sqlite);
  sqlite
    .prepare(
      `UPDATE jobs
       SET status = 'failed',
           error = 'Interrupted by catalog restore',
           finished_at = ?,
           cancel_requested = 0
       WHERE status IN ('running', 'pending')`,
    )
    .run(Date.now());
}

function applyThumbsSwap(extractedThumbs: string): { ok: boolean; error?: string } {
  const dest = thumbsDir();
  const rollbackParent = path.join(
    path.dirname(getDbPath()),
    "exports",
    ".restore-rollback",
  );
  mkdirSync(rollbackParent, { recursive: true });
  const rollback = path.join(rollbackParent, "thumbs");
  if (existsSync(rollback)) {
    rmSync(rollback, { recursive: true, force: true });
  }
  try {
    if (existsSync(dest)) {
      renameSync(dest, rollback);
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    renameSync(extractedThumbs, dest);
    if (existsSync(rollback)) {
      rmSync(rollback, { recursive: true, force: true });
    }
    return { ok: true };
  } catch (e) {
    try {
      if (!existsSync(dest) && existsSync(rollback)) {
        renameSync(rollback, dest);
      }
    } catch {
      /* thumbs rollback failed */
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function copySnapshotIntoLive(
  sqlite: Database.Database,
  migrated: string,
  liveBefore: LocRow[],
  opts: ApplyRestoreOpts,
): Promise<boolean> {
  sqlite.pragma("busy_timeout = 60000");
  await beginImmediateWithFkOff(sqlite);
  sqlite.prepare("ATTACH ? AS snap").run(migrated);
  try {
    restoreTestHooks.afterForeignKeysOff?.();
    report("copy", "Copying snapshot tables…");
    copyTables(sqlite);
    report("remap", "Remapping location roots…");
    const remapped = remapCopiedLocations(sqlite, liveBefore, opts);
    sqlite.exec("COMMIT");
    return remapped;
  } catch (err) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      /* no txn */
    }
    throw err;
  }
}

/**
 * Return a jail-safe catalog snapshot over the live catalog.
 * Source is extracted and pinned before the undo snapshot (prune cannot eat it).
 */
export async function applyRestore(
  opts: ApplyRestoreOpts,
): Promise<ApplyRestoreResult> {
  if (!restoreApplyAllowed()) {
    throw new RestoreApplyError("Restore is disabled (NON_OS_RESTORE=0)", 403);
  }

  const name = parseBackupArchiveFilename(opts.name);
  const abs = exportArchivePath(name);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new RestoreApplyError("Backup archive not found", 404);
  }

  assertRestoreApplyAvailable();
  try {
    initRestoreProgress({
      label: `Restore ${name}`,
      archiveName: name,
    });
  } catch (err) {
    if (err instanceof RestoreProgressError) {
      throw new RestoreApplyError(err.message, err.status);
    }
    throw err;
  }

  let staging: string | undefined;
  let committed = false;
  let undoBackup = "";
  let appliedThumbs = false;
  let remapped = false;
  let itemCount = 0;
  let thumbsError: string | undefined;
  let sqlite: Database.Database | undefined;

  const failSidecar = (error: string, extra?: { partial?: boolean }) => {
    try {
      patchRestoreProgress({
        status: isRestoreCancelRequested() ? "cancelled" : "failed",
        finishedAt: Date.now(),
        error,
        result: {
          undoBackup: undoBackup || undefined,
          appliedThumbs,
          remapped,
          itemCount: itemCount || undefined,
          partial: extra?.partial ?? committed,
        },
      });
    } catch {
      /* none */
    }
  };

  try {
    await restoreTestHooks.afterSidecarClaim?.();
    patchRestoreProgress({
      status: "running",
      startedAt: Date.now(),
      progress: restoreStageProgress("extract", {
        detail: "Extracting archive…",
      }),
    });

    const preview = await inspectBackup(name);
    if (!preview.hasDb) {
      throw new RestoreApplyError("Archive is missing library.db");
    }
    const includeThumbs = Boolean(opts.includeThumbs);
    if (includeThumbs && !preview.hasThumbs) {
      throw new RestoreApplyError("Archive has no thumbs to restore");
    }
    validateLocationActions(preview.locations, opts);

    const archiveBytes = statSync(abs).size;
    const preNeed = preExtractDiskNeed(archiveBytes, {
      hasHoldings: preview.hasHoldings,
    });
    if (preNeed != null) assertDiskBudget(preNeed);

    const stagingParent = path.join(exportsRoot(), ".restore-staging");
    mkdirSync(stagingParent, { recursive: true });
    staging = mkdtempSync(path.join(stagingParent, "r-"));

    report("extract", "Extracting catalog members…");
    const found: string[] = [];
    for (const member of [
      "MANIFEST.json",
      "library.config.json",
      "library.db",
      "library.db-wal",
      "library.db-shm",
    ]) {
      if (archiveHasMember(abs, member)) found.push(member);
    }
    if (includeThumbs && (preview.hasThumbs || archiveHasMember(abs, "thumbs"))) {
      found.push("thumbs");
    }
    if (!found.includes("library.db")) {
      throw new RestoreApplyError("Archive is missing library.db");
    }
    extractMembers(abs, staging, found);
    walkExtractedTree(staging);
    if (existsSync(path.join(staging, "holdings"))) {
      throw new RestoreApplyError("Holdings members must not be extracted");
    }

    throwIfCancelled();
    report("validate", "Validating snapshot…");
    const stagingDb = path.join(staging, "library.db");
    assertSnapshotCatalogFile(stagingDb);
    applyPackedWal(stagingDb);
    const migrated = migrateStagingCopy(stagingDb);

    const dbBytes = statSync(stagingDb).size;
    const extractedThumbs = path.join(staging, "thumbs");
    const thumbsBytes =
      includeThumbs && existsSync(extractedThumbs) ? dirBytes(extractedThumbs) : 0;
    if (dbBytes + thumbsBytes > EXTRACT_MAX_BYTES) {
      throw new RestoreApplyError("Extracted catalog exceeds 2 GiB");
    }
    assertDiskBudget(2 * (dbBytes + thumbsBytes) + DISK_SLACK_BYTES);

    throwIfCancelled();
    report("prerestore", "Writing undo snapshot…");
    const undo = await createPreRestoreBackup({
      protectNames: [name],
      onProgress: (p) => {
        report("prerestore", p.detail);
      },
    });
    undoBackup = undo.name;

    throwIfCancelled();

    const liveBefore = getSqlite()
      .prepare(`SELECT id, name, root_path, enabled FROM locations`)
      .all() as LocRow[];

    sqlite = getSqlite();
    setRestoreGate("busy");

    try {
      writeRestoreLock();
      remapped = await copySnapshotIntoLive(sqlite, migrated, liveBefore, opts);
      committed = true;

      report("finalize", "Finalizing…");
      persistLocationConfig(
        sqlite,
        liveBefore,
        Boolean(opts.applyLocationRoots),
      );

      if (includeThumbs && existsSync(extractedThumbs)) {
        const swap = applyThumbsSwap(extractedThumbs);
        appliedThumbs = swap.ok;
        if (!swap.ok) thumbsError = swap.error;
      }

      itemCount = (
        sqlite.prepare(`SELECT count(*) AS c FROM items`).get() as { c: number }
      ).c;
    } catch (err) {
      try {
        sqlite.exec("ROLLBACK");
      } catch {
        /* no txn */
      }
      throw err;
    } finally {
      if (sqlite) {
        try {
          sqlite.exec("DETACH DATABASE snap");
        } catch {
          /* not attached */
        }
        sqlite.pragma("foreign_keys = ON");
        sqlite.pragma("busy_timeout = 5000");
      }
      setRestoreGate("idle");
      unlinkRestoreLock();
    }

    const job = createJob({
      kind: "restore",
      label: `Restore ${name}`,
      status: "completed",
    });
    completeJob(job.id, {
      undoBackup,
      appliedThumbs,
      remapped,
      itemCount,
      ...(thumbsError ? { partial: true, thumbsError } : {}),
    });

    const result: ApplyRestoreResult = {
      undoBackup,
      appliedThumbs,
      remapped,
      itemCount,
      jobId: job.id,
      ...(thumbsError
        ? { partial: true, error: `Thumbs restore failed: ${thumbsError}` }
        : {}),
    };

    patchRestoreProgress({
      status: "completed",
      finishedAt: Date.now(),
      jobIdHint: job.id,
      error: result.error ?? null,
      result: {
        undoBackup,
        appliedThumbs,
        remapped,
        itemCount,
        partial: result.partial,
      },
      progress: { stage: "done", percent: 100, detail: "Complete" },
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failSidecar(message, { partial: committed });
    if (err instanceof RestoreApplyError || err instanceof RestoreBusyError) {
      throw err;
    }
    throw new RestoreApplyError(message);
  } finally {
    if (staging) {
      try {
        rmSync(staging, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
