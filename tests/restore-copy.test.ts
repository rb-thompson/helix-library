import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import Database from "better-sqlite3";
import { createBackup, isProtectedExport, pruneOldExports } from "@/lib/backup/create";
import {
  BACKUP_NAME_RE,
  buildBackupFilename,
  exportArchivePath,
  exportsRoot,
  isRestoreLockHeld,
  modeFromFilename,
  restoreLockPath,
} from "@/lib/backup/paths";
import {
  applyRestore,
  RestoreApplyError,
  restoreTestHooks,
} from "@/lib/backup/restore";
import { RESTORE_TABLES } from "@/lib/backup/tables";
import { getDbPath } from "@/lib/config";
import {
  getSqlite,
  resetDbConnection,
  RestoreBusyError,
  setRestoreGate,
} from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { runReindex } from "@/lib/indexer/run";
import { createJob, listJobs } from "@/lib/jobs/store";
import { resolveMediaItem } from "@/lib/media/serve";
import { thumbsDir } from "@/lib/media/thumbs";
import { createTestEnv, fixtureRoot } from "./helpers/harness";

const CWD_LOCK = path.join(process.cwd(), "data", "library.restore.lock");
const CWD_THUMBS = path.join(process.cwd(), "data", "thumbs");

function cwdThumbsListing(): string[] {
  if (!existsSync(CWD_THUMBS)) return [];
  return readdirSync(CWD_THUMBS).sort();
}

function validManifest(over: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      format: "helix-backup-v1",
      createdAt: "2026-08-15T00:00:00.000Z",
      mode: "catalog",
      includeThumbs: false,
      app: "helix-library",
      hostname: "test-host",
      includes: ["library.db", "MANIFEST.json"],
      locations: [
        {
          name: "Fixtures",
          root: fixtureRoot(),
          enabled: true,
          included: false,
        },
      ],
      notes: [],
      ...over,
    },
    null,
    2,
  )}\n`;
}

function packIntoExports(
  name: string,
  files: Record<string, string | Buffer>,
): string {
  const staging = mkdtempSync(path.join(tmpdir(), "helix-restore-pack-"));
  try {
    const members: string[] = [];
    for (const [n, v] of Object.entries(files)) {
      const dest = path.join(staging, n);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, v);
      members.push(n);
    }
    const out = exportArchivePath(name);
    const r = spawnSync("tar", ["-czf", out, "-C", staging, ...members], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(`pack failed: ${r.stderr || r.stdout}`);
    }
    return name;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function userTables(sqlite: Database.Database): string[] {
  const rows = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '%_fts%'
         AND name NOT LIKE '%_fts_%'
       ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe("restore tables + filenames + prune helpers", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    env = createTestEnv();
    getSqlite();
  });

  after(() => {
    setRestoreGate("idle");
    restoreTestHooks.afterForeignKeysOff = undefined;
    env.cleanup();
  });

  it("RESTORE_TABLES matches migrate() user tables", () => {
    const names = userTables(getSqlite());
    const registry = new Set<string>(RESTORE_TABLES);
    const missing = names.filter((n) => !registry.has(n));
    assert.deepEqual(
      missing,
      [],
      `migrate() tables missing from RESTORE_TABLES: ${missing.join(", ")}`,
    );
    for (const t of RESTORE_TABLES) {
      assert.ok(names.includes(t), `RESTORE_TABLES extra or not migrated: ${t}`);
    }
  });

  it("BACKUP_NAME_RE accepts optional -prerestore- infix", () => {
    const regular = buildBackupFilename("catalog", "2026-08-15T12-00-00Z");
    const undo = buildBackupFilename("catalog", "2026-08-15T12-00-00Z", {
      prerestore: true,
    });
    assert.equal(regular, "helix-backup-catalog-2026-08-15T12-00-00Z.tar.gz");
    assert.equal(
      undo,
      "helix-backup-catalog-prerestore-2026-08-15T12-00-00Z.tar.gz",
    );
    assert.match(regular, BACKUP_NAME_RE);
    assert.match(undo, BACKUP_NAME_RE);
    assert.equal(modeFromFilename(regular), "catalog");
    assert.equal(modeFromFilename(undo), "catalog");
    assert.equal(
      modeFromFilename("helix-backup-full-prerestore-2026-08-15T12-00-00Z.tar.gz"),
      "full",
    );
  });

  it("isProtectedExport keeps source name and young prerestore", () => {
    assert.equal(
      isProtectedExport("helix-backup-catalog-2026-08-15T12-00-00Z.tar.gz", Date.now(), [
        "helix-backup-catalog-2026-08-15T12-00-00Z.tar.gz",
      ]),
      true,
    );
    assert.equal(
      isProtectedExport(
        "helix-backup-catalog-prerestore-2026-08-15T12-00-00Z.tar.gz",
        Date.now(),
      ),
      true,
    );
    assert.equal(
      isProtectedExport(
        "helix-backup-catalog-prerestore-2026-08-01T12-00-00Z.tar.gz",
        Date.now() - 8 * 24 * 60 * 60 * 1000,
      ),
      false,
    );
  });

  it("restoreLockPath is sibling of the temp DB, not cwd/data", () => {
    const p = restoreLockPath();
    assert.equal(p, path.join(path.dirname(getDbPath()), "library.restore.lock"));
    assert.ok(p.startsWith(env.dir));
    assert.notEqual(p, CWD_LOCK);
  });

  it("thumbsDir follows the harness DB directory", () => {
    const t = thumbsDir();
    assert.equal(t, path.join(path.dirname(getDbPath()), "thumbs"));
    assert.ok(t.startsWith(env.dir));
  });

  it("stale restore lock pid is unlinked; live pid is held", () => {
    const p = restoreLockPath();
    writeFileSync(p, `${JSON.stringify({ pid: 999999, startedAt: Date.now() })}\n`);
    assert.equal(isRestoreLockHeld(), false);
    assert.equal(existsSync(p), false);

    writeFileSync(
      p,
      `${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}\n`,
    );
    assert.equal(isRestoreLockHeld(), true);
    unlinkSync(p);
    assert.equal(isRestoreLockHeld(), false);
  });
});

describe("restoreGate (no spin)", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    env = createTestEnv();
  });

  after(() => {
    setRestoreGate("idle");
    env.cleanup();
  });

  afterEach(() => {
    setRestoreGate("idle");
  });

  it("already-open singleton returns while busy", () => {
    const sqlite = getSqlite();
    setRestoreGate("busy");
    assert.equal(getSqlite(), sqlite);
  });

  it("closed singleton + busy throws immediately and creates no extra db inode", () => {
    getSqlite();
    resetDbConnection();
    unlinkSync(env.dbPath);
    assert.equal(existsSync(env.dbPath), false);
    setRestoreGate("busy");
    const t0 = Date.now();
    assert.throws(() => getSqlite(), RestoreBusyError);
    assert.ok(Date.now() - t0 < 250, "getSqlite must not spin");
    assert.equal(existsSync(env.dbPath), false);
  });
});

describe("applyRestore copy-in", () => {
  let env: ReturnType<typeof createTestEnv>;
  let thumbsBefore: string[];

  before(async () => {
    thumbsBefore = cwdThumbsListing();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    setRestoreGate("idle");
    restoreTestHooks.afterForeignKeysOff = undefined;
    env.cleanup();
    assert.deepEqual(cwdThumbsListing(), thumbsBefore);
    assert.equal(existsSync(CWD_LOCK), false);
  });

  afterEach(() => {
    setRestoreGate("idle");
    restoreTestHooks.afterForeignKeysOff = undefined;
    try {
      if (existsSync(restoreLockPath())) unlinkSync(restoreLockPath());
    } catch {
      /* none */
    }
    try {
      getSqlite()
        .prepare(
          `UPDATE jobs SET status = 'failed', finished_at = ?, error = 'test cleanup'
           WHERE status IN ('running', 'pending')`,
        )
        .run(Date.now());
    } catch {
      /* db closed */
    }
  });

  it("restores item set; apply does not write cwd lock or cwd thumbs", async () => {
    const before = getSqlite()
      .prepare(`SELECT id, name, title FROM items ORDER BY id`)
      .all() as Array<{ id: number; name: string; title: string }>;
    assert.ok(before.length >= 1);
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    getSqlite()
      .prepare(`UPDATE items SET title = 'MUTATED-BY-TEST' WHERE id = ?`)
      .run(before[0].id);
    const mutated = getSqlite()
      .prepare(`SELECT title FROM items WHERE id = ?`)
      .get(before[0].id) as { title: string };
    assert.equal(mutated.title, "MUTATED-BY-TEST");

    const result = await applyRestore({
      name: created.name,
      includeThumbs: false,
    });
    assert.ok(result.undoBackup.includes("-prerestore-"));
    assert.match(result.undoBackup, BACKUP_NAME_RE);
    assert.ok(result.jobId > 0);
    assert.equal(existsSync(CWD_LOCK), false);
    assert.equal(existsSync(restoreLockPath()), false);

    const after = getSqlite()
      .prepare(`SELECT id, name, title FROM items ORDER BY id`)
      .all() as Array<{ id: number; name: string; title: string }>;
    assert.deepEqual(after, before);

    const restoreJobs = listJobs({ kinds: ["restore"], limit: 5 });
    assert.ok(restoreJobs.some((j) => j.id === result.jobId && j.status === "completed"));
    assert.deepEqual(cwdThumbsListing(), thumbsBefore);
  });

  it("txn throw leaves live catalog unchanged and foreign_keys ON", async () => {
    const before = getSqlite()
      .prepare(`SELECT id, title FROM items ORDER BY id`)
      .all() as Array<{ id: number; title: string }>;
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    getSqlite()
      .prepare(`UPDATE items SET title = 'LIVE-AFTER-BACKUP' WHERE id = ?`)
      .run(before[0].id);

    restoreTestHooks.afterForeignKeysOff = () => {
      throw new Error("injected-copy-failure");
    };
    await assert.rejects(
      () => applyRestore({ name: created.name, includeThumbs: false }),
      /injected-copy-failure/,
    );
    restoreTestHooks.afterForeignKeysOff = undefined;

    const sqlite = getSqlite();
    assert.equal(sqlite.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(sqlite.pragma("busy_timeout", { simple: true }), 5000);
    const live = sqlite
      .prepare(`SELECT title FROM items WHERE id = ?`)
      .get(before[0].id) as { title: string };
    assert.equal(live.title, "LIVE-AFTER-BACKUP");
    assert.equal(existsSync(restoreLockPath()), false);
  });

  it("running snapshot job becomes failed; restore job is completed", async () => {
    const stuck = createJob({
      kind: "reindex",
      label: "snapshot-running",
      status: "running",
    });
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    // Live must not look busy; the snapshot still carries the running row.
    getSqlite()
      .prepare(
        `UPDATE jobs SET status = 'completed', finished_at = ? WHERE id = ?`,
      )
      .run(Date.now(), stuck.id);
    await applyRestore({ name: created.name, includeThumbs: false });
    const rows = getSqlite()
      .prepare(`SELECT kind, status, error, label FROM jobs`)
      .all() as Array<{
      kind: string;
      status: string;
      error: string | null;
      label: string | null;
    }>;
    const interrupted = rows.filter(
      (r) => r.error === "Interrupted by catalog restore",
    );
    assert.ok(
      interrupted.some((r) => r.status === "failed" && r.kind === "reindex"),
    );
    assert.ok(rows.some((r) => r.kind === "restore" && r.status === "completed"));
  });

  it("thumbs swap uses sibling-of-DB dir and does not touch cwd/data/thumbs", async () => {
    const beforeLive = cwdThumbsListing();
    const tdir = thumbsDir();
    assert.ok(tdir.startsWith(env.dir));
    mkdirSync(tdir, { recursive: true });
    writeFileSync(path.join(tdir, "1.webp"), "packed-thumb");
    const created = await createBackup({ mode: "catalog", includeThumbs: true });
    writeFileSync(path.join(tdir, "1.webp"), "changed-live");
    writeFileSync(path.join(tdir, "99.webp"), "extra-live");

    const result = await applyRestore({ name: created.name, includeThumbs: true });
    assert.equal(result.appliedThumbs, true);
    assert.equal(readFileSync(path.join(thumbsDir(), "1.webp"), "utf8"), "packed-thumb");
    assert.equal(existsSync(path.join(thumbsDir(), "99.webp")), false);
    assert.deepEqual(cwdThumbsListing(), beforeLive);
  });

  it("holdings member is not written", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const staging = mkdtempSync(path.join(tmpdir(), "helix-hold-"));
    try {
      const r0 = spawnSync(
        "tar",
        ["-xzf", exportArchivePath(created.name), "-C", staging],
        { encoding: "utf8" },
      );
      assert.equal(r0.status, 0, r0.stderr);
      mkdirSync(path.join(staging, "holdings", "Archive"), { recursive: true });
      writeFileSync(
        path.join(staging, "holdings", "Archive", "helix-restore-holdings-secret.txt"),
        "SECRET-HOLDINGS",
      );
      const manifest = JSON.parse(
        readFileSync(path.join(staging, "MANIFEST.json"), "utf8"),
      ) as Record<string, unknown>;
      manifest.mode = "full";
      (manifest.includes as string[]).push("holdings/Archive/");
      writeFileSync(
        path.join(staging, "MANIFEST.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      const packed = "helix-backup-full-holdings-secret.tar.gz";
      const r1 = spawnSync(
        "tar",
        ["-czf", exportArchivePath(packed), "-C", staging, ...readdirSync(staging)],
        { encoding: "utf8" },
      );
      assert.equal(r1.status, 0, r1.stderr);
      await applyRestore({ name: packed, includeThumbs: false });
      assert.equal(
        existsSync(
          path.join(env.dir, "holdings", "Archive", "helix-restore-holdings-secret.txt"),
        ),
        false,
      );
      assert.equal(
        existsSync(
          path.join(process.cwd(), "holdings", "Archive", "helix-restore-holdings-secret.txt"),
        ),
        false,
      );
      assert.equal(
        existsSync(
          path.join(exportsRoot(), "holdings", "Archive", "helix-restore-holdings-secret.txt"),
        ),
        false,
      );
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  });

  it("prune keeps the source archive among 10 newer dummies", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const now = Date.now();
    utimesSync(
      exportArchivePath(created.name),
      new Date(now - 120_000),
      new Date(now - 120_000),
    );
    for (let i = 0; i < 10; i++) {
      const n = `dummy-restore-${i}.tar.gz`;
      const p = path.join(exportsRoot(), n);
      writeFileSync(p, "dummy");
      utimesSync(p, new Date(now + (i + 1) * 1000), new Date(now + (i + 1) * 1000));
    }
    await applyRestore({ name: created.name, includeThumbs: false });
    assert.ok(
      existsSync(exportArchivePath(created.name)),
      "source archive must survive prerestore prune",
    );
  });

  it("NON_OS_RESTORE=0 refuses apply", async () => {
    process.env.NON_OS_RESTORE = "0";
    try {
      await assert.rejects(
        () => applyRestore({ name: "helix-backup-catalog-x.tar.gz" }),
        (err: unknown) => {
          assert.ok(err instanceof RestoreApplyError);
          assert.equal(err.status, 403);
          return /disabled/i.test(err.message);
        },
      );
    } finally {
      delete process.env.NON_OS_RESTORE;
    }
  });
});

describe("applyRestore remap + media", () => {
  let env: ReturnType<typeof createTestEnv>;
  let oldRoot: string;
  let newRoot: string;

  before(() => {
    const dir = mkdtempSync(path.join(tmpdir(), "helix-remap-hold-"));
    oldRoot = path.join(dir, "old-root");
    newRoot = path.join(dir, "new-root");
    mkdirSync(oldRoot, { recursive: true });
    writeFileSync(path.join(oldRoot, "note.txt"), "remap-hello\n");
    env = createTestEnv({ root: oldRoot, locationName: "Archive" });
  });

  after(() => {
    setRestoreGate("idle");
    env.cleanup();
    try {
      rmSync(path.dirname(oldRoot), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("rewrites items.path; resolveMediaItem works; reindex is unchanged", async () => {
    const { stats: first } = await runReindex();
    assert.ok(first.added >= 1);
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    renameSync(oldRoot, newRoot);

    await applyRestore({
      name: created.name,
      includeThumbs: false,
      applyLocationRoots: true,
      locationActions: [
        { name: "Archive", action: "remap", remapTo: newRoot },
      ],
    });

    const item = getSqlite()
      .prepare(`SELECT id, path, rel_path FROM items WHERE name = 'note.txt'`)
      .get() as { id: number; path: string; rel_path: string } | undefined;
    assert.ok(item);
    assert.equal(path.resolve(item!.path), path.resolve(newRoot, "note.txt"));

    const media = resolveMediaItem(item!.id);
    assert.ok(media, "resolveMediaItem should succeed after remap");
    assert.equal(path.resolve(media!.absPath), path.resolve(newRoot, "note.txt"));

    const { stats } = await runReindex();
    assert.equal(stats.added, 0);
    assert.equal(stats.missing, 0);
    assert.ok(stats.unchanged >= 1, `expected unchanged>=1, got ${JSON.stringify(stats)}`);
  });

  it("$HOME child cannot be newly enabled", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    await assert.rejects(
      () =>
        applyRestore({
          name: created.name,
          includeThumbs: false,
          applyLocationRoots: true,
          locationActions: [
            { name: "Archive", action: "remap", remapTo: homedir() },
          ],
        }),
      /home/i,
    );
  });
});

describe("applyRestore packed WAL", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    env = createTestEnv();
    getSqlite();
  });

  after(() => {
    setRestoreGate("idle");
    env.cleanup();
  });

  it("applies packed WAL pages before ATTACH", async () => {
    const work = mkdtempSync(path.join(tmpdir(), "helix-wal-"));
    try {
      const dbFile = path.join(work, "library.db");
      const db = new Database(dbFile);
      db.pragma("journal_mode = WAL");
      migrate(db);
      const root = fixtureRoot();
      db.prepare(
        `INSERT INTO locations (name, root_path, enabled) VALUES (?, ?, 1)`,
      ).run("Fixtures", root);
      const loc = db
        .prepare(`SELECT id FROM locations WHERE name = 'Fixtures'`)
        .get() as { id: number };
      const abs = path.join(root, "wal-only.txt");
      db.prepare(
        `INSERT INTO items (
           location_id, path, rel_path, name, ext, kind,
           size_bytes, mtime_ms, ctime_ms, title, indexed_at
         ) VALUES (?, ?, 'wal-only.txt', 'wal-only.txt', 'txt', 'text',
                   1, 0, 0, 'wal-only', 0)`,
      ).run(loc.id, abs);
      const pack: Record<string, string | Buffer> = {
        "MANIFEST.json": validManifest({
          includes: ["library.db", "library.db-wal", "MANIFEST.json"],
        }),
        "library.config.json": readFileSync(env.configPath),
        "library.db": readFileSync(dbFile),
      };
      if (existsSync(`${dbFile}-wal`)) {
        pack["library.db-wal"] = readFileSync(`${dbFile}-wal`);
      }
      db.close();
      // If close checkpointed, the row is still in the main file — still a valid restore.
      const name = "helix-backup-catalog-wal-fallback.tar.gz";
      packIntoExports(name, pack);
      await applyRestore({ name, includeThumbs: false });
      const row = getSqlite()
        .prepare(`SELECT name FROM items WHERE name = 'wal-only.txt'`)
        .get() as { name: string } | undefined;
      assert.ok(row, "WAL (or checkpointed) snapshot row must be restored");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe("pruneOldExports extraProtect", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    env = createTestEnv();
    getSqlite();
  });

  after(() => {
    env.cleanup();
  });

  it("does not delete a protected source among keep-10 dummies", () => {
    const root = exportsRoot();
    const source = "helix-backup-catalog-2026-01-01T00-00-00Z.tar.gz";
    writeFileSync(path.join(root, source), "source");
    const now = Date.now();
    utimesSync(
      path.join(root, source),
      new Date(now - 60_000),
      new Date(now - 60_000),
    );
    for (let i = 0; i < 10; i++) {
      const n = `dummy-prune-${i}.tar.gz`;
      writeFileSync(path.join(root, n), "d");
      utimesSync(
        path.join(root, n),
        new Date(now + (i + 1) * 1000),
        new Date(now + (i + 1) * 1000),
      );
    }
    pruneOldExports(10, [source]);
    assert.ok(existsSync(path.join(root, source)));
  });
});
