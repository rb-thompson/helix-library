/**
 * Create Helix Library backup archives (tar.gz).
 *
 * Modes:
 * - catalog: config + SQLite snapshot + optional thumbs (small, restore-critical)
 * - full: catalog + enabled location roots (may be large)
 *
 * Does NOT include .env.local / API keys. Holdings outside enabled roots are skipped.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  getDbPath,
  loadConfig,
  projectRoot,
  toConfigPath,
} from "@/lib/config";
import { assertCatalogWritable, getSqlite } from "@/lib/db/client";
import { thumbsDir } from "@/lib/media/thumbs";
import {
  buildBackupFilename,
  configWritePath,
  exportArchivePath,
  exportsRoot,
  listExportFiles,
  stampForFilename,
} from "@/lib/backup/paths";
import type {
  BackupCreateResult,
  BackupManifest,
  BackupMode,
} from "@/lib/backup/types";
import { isCancelRequested } from "@/lib/jobs/store";

const RETAIN = 10;

export type BackupCreateOpts = {
  mode: BackupMode;
  /** Default true for catalog, false for full (thumbs already optional) */
  includeThumbs?: boolean;
  jobId?: number;
  /** Undo snapshot: helix-backup-catalog-prerestore-{stamp}.tar.gz */
  prerestore?: boolean;
  extraNotes?: string[];
  extraProtect?: string[];
  onProgress?: (p: {
    stage: string;
    percent: number | null;
    detail?: string;
  }) => void;
};

function checkCancel(jobId?: number) {
  if (jobId != null && isCancelRequested(jobId)) {
    throw new Error("Cancelled");
  }
}

function tarAvailable(): boolean {
  try {
    const r = spawnSync("tar", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function runTar(args: string[], cwd: string): void {
  const r = spawnSync("tar", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(
      `tar failed (${r.status}): ${(r.stderr || r.stdout || "").slice(0, 400)}`,
    );
  }
}

async function snapshotSqlite(destDb: string): Promise<void> {
  const sqlite = getSqlite();
  // Prefer native backup API (consistent under WAL)
  const backupFn = (
    sqlite as unknown as {
      backup?: (dest: string) => Promise<void> | void;
    }
  ).backup;
  if (typeof backupFn === "function") {
    const ret = backupFn.call(sqlite, destDb);
    if (ret && typeof (ret as Promise<void>).then === "function") {
      await (ret as Promise<void>);
    }
    return;
  }
  // Fallback: checkpoint + copy main + wal/shm if present
  try {
    sqlite.pragma("wal_checkpoint(PASSIVE)");
  } catch {
    /* ignore */
  }
  const src = getDbPath();
  cpSync(src, destDb);
  for (const suf of ["-wal", "-shm"]) {
    const side = `${src}${suf}`;
    if (existsSync(side)) {
      cpSync(side, `${destDb}${suf}`);
    }
  }
}

function restoreDoc(mode: BackupMode): string {
  return `# Helix Library backup restore

**Format:** helix-backup-v1  
**Mode:** ${mode}

## What is included

- \`library.config.json\` — scan roots and settings (paths may be machine-specific)
- \`library.db\` — catalog SQLite snapshot (items, tags, collections, FTS, jobs, threads)
- \`thumbs/\` — optional webp posters (only if packed)
- \`holdings/\` — enabled location trees (**full** mode only; inspect-only in-app)
- \`MANIFEST.json\` — machine-readable inventory

## What is NOT included

- \`.env.local\` / \`XAI_API_KEY\` / OpenAlex keys — re-add secrets separately
- SuperGrok / X Premium credentials — never archived
- Disabled locations' files
- The running app source code (use git for that)

## Restore (in-app)

1. Open Services → Restore from snapshot (localhost only).
2. Inspect the archive, type RESTORE, confirm.
3. Helix extracts the archive, writes an undo snapshot, then copies the snapshot into the live catalog (same \`library.db\` file).

CLI: inspect with \`npm run restore -- --inspect <name>\`; apply with \`npm run restore -- --name <name> --phrase RESTORE\`. No-args lists jail archives.

Holdings trees are **not** overwritten in-app. Restore HTTP is off on LAN unless \`NON_OS_RESTORE_OK=1\`.

Manual restore (stop Helix first) remains below.

## Restore (manual)

1. Stop Helix (\`Ctrl+C\` / stop production process).
2. Extract somewhere safe:
   \`\`\`bash
   mkdir -p /tmp/helix-restore && tar -xzf helix-backup-*.tar.gz -C /tmp/helix-restore
   \`\`\`
3. Copy DB + config into your project (adjust paths):
   \`\`\`bash
   cp /tmp/helix-restore/library.db ./data/library.db
   cp /tmp/helix-restore/library.config.json ./library.config.json
   # optional:
   cp -a /tmp/helix-restore/thumbs/. ./data/thumbs/
   \`\`\`
4. For **full** backups, restore holdings under the roots listed in config
   (see \`holdings/<location-name>/\` in the archive) or re-point config roots.
   In-app restore never copies holdings onto live stacks.
5. Start Helix and run **Reindex** if paths changed.

Personal use only. Verify paths before overwriting a live catalog.
`;
}

/**
 * Create a backup archive under data/exports/.
 */
export async function createBackup(
  opts: BackupCreateOpts,
): Promise<BackupCreateResult> {
  assertCatalogWritable();
  if (!tarAvailable()) {
    throw new Error(
      "tar is required for backups (GNU tar / bsdtar on PATH).",
    );
  }

  const mode = opts.mode;
  const includeThumbs =
    opts.includeThumbs ?? (mode === "catalog" ? true : true);
  const onProgress = opts.onProgress;
  const jobId = opts.jobId;

  checkCancel(jobId);
  onProgress?.({
    stage: "preparing",
    percent: 5,
    detail: "Preparing staging directory…",
  });

  const config = loadConfig(true);
  const stamp = new Date();
  const fname = buildBackupFilename(mode, stampForFilename(stamp), {
    prerestore: Boolean(opts.prerestore),
  });
  const outPath = exportArchivePath(fname);

  const stagingParent = path.join(exportsRoot(), ".staging");
  mkdirSync(stagingParent, { recursive: true });
  const staging = mkdtempSync(path.join(stagingParent, "b-"));

  const includes: string[] = [];
  const notes: string[] = [
    "API keys and .env.local are not included.",
    "In-app restore: Services → Restore from snapshot (type RESTORE). See RESTORE.md.",
  ];
  if (opts.prerestore) {
    notes.push("Automatic pre-restore snapshot");
  }
  if (opts.extraNotes?.length) {
    notes.push(...opts.extraNotes);
  }

  try {
    checkCancel(jobId);

    // --- config ---
    onProgress?.({
      stage: "config",
      percent: 12,
      detail: "Copying library config…",
    });
    const cfgPath = configWritePath();
    if (cfgPath && existsSync(cfgPath)) {
      cpSync(cfgPath, path.join(staging, "library.config.json"));
      includes.push("library.config.json");
    } else {
      // Write resolved snapshot so restore has something
      const snapshot = {
        bind: config.bind,
        port: config.port,
        dbPath: toConfigPath(config.dbPath),
        locations: config.locations.map((l) => ({
          name: l.name,
          root: toConfigPath(l.root),
          enabled: l.enabled !== false,
        })),
        ignore: config.ignore,
        maxFileBytes: config.maxFileBytes,
        hashFullUnderBytes: config.hashFullUnderBytes,
      };
      writeFileSync(
        path.join(staging, "library.config.json"),
        `${JSON.stringify(snapshot, null, 2)}\n`,
        "utf8",
      );
      includes.push("library.config.json");
      notes.push("Config was synthesized from runtime (no on-disk config file).");
    }

    // --- sqlite ---
    checkCancel(jobId);
    onProgress?.({
      stage: "database",
      percent: 25,
      detail: "Snapshotting SQLite catalog…",
    });
    const dbDest = path.join(staging, "library.db");
    await snapshotSqlite(dbDest);
    includes.push("library.db");

    // --- thumbs ---
    if (includeThumbs) {
      checkCancel(jobId);
      onProgress?.({
        stage: "thumbs",
        percent: 40,
        detail: "Copying thumbs…",
      });
      const tdir = thumbsDir();
      if (existsSync(tdir)) {
        const destThumbs = path.join(staging, "thumbs");
        mkdirSync(destThumbs, { recursive: true });
        let n = 0;
        for (const name of readdirSync(tdir)) {
          if (!name.endsWith(".webp")) continue;
          cpSync(path.join(tdir, name), path.join(destThumbs, name));
          n += 1;
        }
        if (n > 0) {
          includes.push(`thumbs/ (${n} files)`);
        } else {
          notes.push("No thumbs found to include.");
        }
      }
    } else {
      notes.push("Thumbs omitted by request.");
    }

    // --- holdings (full) ---
    const locMeta: BackupManifest["locations"] = config.locations.map((l) => ({
      name: l.name,
      root: l.root,
      enabled: l.enabled !== false,
      included: false,
    }));

    if (mode === "full") {
      const holdingsRoot = path.join(staging, "holdings");
      mkdirSync(holdingsRoot, { recursive: true });
      const enabled = config.locations.filter((l) => l.enabled !== false);
      let i = 0;
      for (const loc of enabled) {
        i += 1;
        checkCancel(jobId);
        const pct = 45 + Math.round((i / Math.max(1, enabled.length)) * 35);
        onProgress?.({
          stage: "holdings",
          percent: pct,
          detail: `Packing location “${loc.name}”…`,
        });
        if (!existsSync(loc.root)) {
          notes.push(`Skipped missing location root: ${loc.name} (${loc.root})`);
          continue;
        }
        const safeName =
          loc.name.replace(/[^\w.-]+/g, "_").slice(0, 64) || `loc-${i}`;
        const dest = path.join(holdingsRoot, safeName);
        // Copy tree (dereference not required; preserve as much as possible)
        try {
          cpSync(loc.root, dest, { recursive: true });
          includes.push(`holdings/${safeName}/`);
          const row = locMeta.find((x) => x.name === loc.name);
          if (row) row.included = true;
        } catch (e) {
          notes.push(
            `Failed to copy location ${loc.name}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
    }

    // --- manifest + restore doc ---
    const manifest: BackupManifest = {
      format: "helix-backup-v1",
      createdAt: stamp.toISOString(),
      mode,
      includeThumbs,
      app: "helix-library",
      hostname: (() => {
        try {
          return hostname();
        } catch {
          return null;
        }
      })(),
      includes,
      locations: locMeta,
      notes,
    };
    writeFileSync(
      path.join(staging, "MANIFEST.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(path.join(staging, "RESTORE.md"), restoreDoc(mode), "utf8");
    includes.push("MANIFEST.json", "RESTORE.md");

    checkCancel(jobId);
    onProgress?.({
      stage: "compressing",
      percent: 88,
      detail: "Creating tar.gz…",
    });

    // Pack contents of staging (not the staging folder name)
    runTar(
      [
        "-czf",
        outPath,
        "--exclude=.DS_Store",
        "-C",
        staging,
        ...readdirSync(staging),
      ],
      projectRoot(),
    );

    const bytes = statSync(outPath).size;
    onProgress?.({
      stage: "done",
      percent: 100,
      detail: `Wrote ${fname} (${bytes} bytes)`,
    });

    pruneOldExports(RETAIN, opts.extraProtect ?? []);

    return {
      name: fname,
      path: outPath,
      bytes,
      mode,
      manifest,
    };
  } catch (e) {
    // Remove partial archive
    try {
      if (existsSync(outPath)) rmSync(outPath, { force: true });
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

const PRERESTORE_PROTECT_MS = 7 * 24 * 60 * 60 * 1000;

export function isProtectedExport(
  name: string,
  mtimeMs: number,
  extraProtect: string[] = [],
): boolean {
  if (extraProtect.includes(name)) return true;
  if (!name.includes("-prerestore-")) return false;
  return Date.now() - mtimeMs < PRERESTORE_PROTECT_MS;
}

export function pruneOldExports(
  keep: number,
  extraProtect: string[] = [],
): void {
  const files = listExportFiles();
  const candidates = files.filter(
    (f) => !isProtectedExport(f.name, f.mtimeMs, extraProtect),
  );
  for (const f of candidates.slice(Math.max(0, keep))) {
    try {
      rmSync(f.path, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Catalog undo snapshot. Protects `protectNames` (source archive) from prune. */
export async function createPreRestoreBackup(opts: {
  protectNames: string[];
  onProgress?: BackupCreateOpts["onProgress"];
}): Promise<BackupCreateResult> {
  return createBackup({
    mode: "catalog",
    includeThumbs: true,
    prerestore: true,
    extraProtect: opts.protectNames,
    onProgress: opts.onProgress,
  });
}

export function readManifestHint(archivePath: string): BackupMode | "unknown" {
  // Cheap: parse filename; full tar list is heavier
  return path.basename(archivePath).includes("-full-")
    ? "full"
    : path.basename(archivePath).includes("-catalog-")
      ? "catalog"
      : "unknown";
}

/** Load MANIFEST.json from an extracted path or return null. */
export function readManifestFile(dir: string): BackupManifest | null {
  const p = path.join(dir, "MANIFEST.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as BackupManifest;
  } catch {
    return null;
  }
}
