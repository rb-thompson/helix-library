import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BACKUP_NAME_RE,
  buildBackupFilename,
  modeFromFilename,
  parseExportFilename,
  stampForFilename,
} from "@/lib/backup/paths";

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
});
