import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { createBackup } from "@/lib/backup/create";
import {
  BACKUP_NAME_RE,
  buildBackupFilename,
  exportArchivePath,
  modeFromFilename,
  parseBackupArchiveFilename,
  parseExportFilename,
  stampForFilename,
} from "@/lib/backup/paths";
import { getDb } from "@/lib/db/client";
import { createTestEnv } from "./helpers/harness";

describe("backup paths", () => {
  it("builds standard archive names", () => {
    const name = buildBackupFilename("catalog", "2026-08-08T12-00-00Z");
    assert.equal(name, "helix-backup-catalog-2026-08-08T12-00-00Z.tar.gz");
    assert.match(name, BACKUP_NAME_RE);
    assert.equal(modeFromFilename(name), "catalog");
    assert.equal(
      modeFromFilename("helix-backup-full-2026-08-08T12-00-00Z.tar.gz"),
      "full",
    );
  });

  it("stamp is filesystem-safe", () => {
    const s = stampForFilename(new Date("2026-08-08T15:04:05.123Z"));
    assert.equal(s.includes(":"), false);
    assert.match(s, /2026-08-08T15-04-05Z/);
  });

  it("rejects path traversal in filenames", () => {
    assert.throws(() => parseExportFilename("../evil.tar.gz"));
    assert.throws(() => parseExportFilename("a/b.tar.gz"));
    assert.equal(
      parseExportFilename("helix-backup-catalog-2026-08-08T12-00-00Z.tar.gz"),
      "helix-backup-catalog-2026-08-08T12-00-00Z.tar.gz",
    );
  });

  it("jails millis stamps via parseExportFilename (BACKUP_NAME_RE is a hint)", () => {
    const millis = "helix-backup-catalog-2026-08-08T13-34-08-337Z.tar.gz";
    assert.equal(parseExportFilename(millis), millis);
    assert.equal(parseBackupArchiveFilename(millis), millis);
    assert.equal(modeFromFilename(millis), "unknown");
    assert.equal(BACKUP_NAME_RE.test(millis), false);
  });

  it("inspect jail rejects .json dumps that parseExportFilename allows", () => {
    assert.equal(parseExportFilename("notes.json"), "notes.json");
    assert.throws(
      () => parseBackupArchiveFilename("notes.json"),
      /tar\.gz/,
    );
  });
});

describe("createBackup RESTORE.md", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    env = createTestEnv();
    getDb();
  });

  after(() => {
    env.cleanup();
  });

  it("packs the in-app restore path", async () => {
    const created = await createBackup({
      mode: "catalog",
      includeThumbs: false,
    });
    const r = spawnSync(
      "tar",
      ["-xOf", exportArchivePath(created.name), "RESTORE.md"],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /## Restore \(in-app\)/);
    assert.match(r.stdout, /Services → Restore from snapshot/);
    assert.match(r.stdout, /npm run restore/);
  });
});
