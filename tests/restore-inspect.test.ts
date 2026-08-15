import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createBackup } from "@/lib/backup/create";
import {
  assertRestorableRoot,
  auditTarMembers,
  inspectBackup,
  parseTarVerboseLine,
  restoreLiveStats,
} from "@/lib/backup/inspect";
import { exportArchivePath } from "@/lib/backup/paths";
import { getDb } from "@/lib/db/client";
import { createTestEnv, fixtureRoot } from "./helpers/harness";

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
  files: Record<string, string | { link: string }>,
): string {
  const staging = mkdtempSync(path.join(tmpdir(), "helix-inspect-pack-"));
  try {
    const members: string[] = [];
    for (const [n, v] of Object.entries(files)) {
      const dest = path.join(staging, n);
      if (typeof v === "object" && v && "link" in v) {
        symlinkSync(v.link, dest);
      } else {
        writeFileSync(dest, v);
      }
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
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

describe("auditTarMembers", () => {
  it("rejects path slip, absolute members, and unknown names", () => {
    const slip = auditTarMembers(["MANIFEST.json", "../evil"]);
    assert.equal(slip.ok, false);
    assert.ok(slip.errors.some((e) => /escape|allowlist/i.test(e)));

    const abs = auditTarMembers(["/etc/passwd"]);
    assert.equal(abs.ok, false);
    assert.ok(abs.errors.some((e) => /absolute/i.test(e)));

    const env = auditTarMembers([".env.local"]);
    assert.equal(env.ok, false);
    assert.ok(env.errors.some((e) => /allowlist/i.test(e)));
  });

  it("rejects symlink / hardlink members", () => {
    const a = auditTarMembers([{ name: "library.db", kind: "link" }]);
    assert.equal(a.ok, false);
    assert.ok(a.errors.some((e) => /link/i.test(e)));
  });

  it("allows holdings listing and catalog members", () => {
    const a = auditTarMembers([
      "MANIFEST.json",
      "RESTORE.md",
      "library.config.json",
      "library.db",
      "thumbs/",
      "thumbs/abc.webp",
      "holdings/Archive/secret.txt",
    ]);
    assert.equal(a.ok, true, a.errors.join("; "));
  });

  it("rejects holdings path-escape even though the prefix is listed", () => {
    const a = auditTarMembers(["holdings/../evil"]);
    assert.equal(a.ok, false);
    assert.ok(a.errors.some((e) => /escape/i.test(e)));
  });
});

describe("parseTarVerboseLine", () => {
  it("reads GNU verbose rows and link targets", () => {
    const file = parseTarVerboseLine(
      "-rw-r--r-- brandon/brandon 123 2026-08-08 13:34 MANIFEST.json",
    );
    assert.equal(file?.name, "MANIFEST.json");
    assert.equal(file?.kind, "file");

    const dir = parseTarVerboseLine(
      "drwxr-xr-x brandon/brandon 0 2026-08-08 13:34 thumbs/",
    );
    assert.equal(dir?.name, "thumbs/");
    assert.equal(dir?.kind, "dir");

    const link = parseTarVerboseLine(
      "lrwxrwxrwx brandon/brandon 0 2026-08-08 13:34 evil -> /etc/passwd",
    );
    assert.equal(link?.name, "evil");
    assert.equal(link?.kind, "link");
  });
});

describe("inspectBackup + restorable roots", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    env = createTestEnv();
    getDb();
  });

  after(() => {
    env.cleanup();
  });

  it("forbids / , $HOME, and $HOME/Documents", () => {
    assert.throws(() => assertRestorableRoot("/"), /system/i);
    assert.throws(() => assertRestorableRoot(homedir()), /home directory/i);
    assert.throws(
      () => assertRestorableRoot(path.join(homedir(), "Documents")),
      /home|does not exist/i,
    );
    assert.throws(() => assertRestorableRoot(process.cwd()), /working directory/i);
    assert.throws(() => assertRestorableRoot(path.join(process.cwd(), "src")), /src/i);
  });

  it("allows an already-configured live location root", () => {
    assert.doesNotThrow(() => assertRestorableRoot(fixtureRoot()));
  });

  it("previews a harness catalog backup (mode catalog, keep-live)", async () => {
    const created = await createBackup({
      mode: "catalog",
      includeThumbs: false,
    });
    const preview = await inspectBackup(created.name);
    assert.equal(preview.mode, "catalog");
    assert.equal(preview.format, "helix-backup-v1");
    assert.equal(preview.hasDb, true);
    assert.equal(preview.hasConfig, true);
    assert.equal(preview.hasHoldings, false);
    assert.ok(preview.previewHash.length === 64);
    assert.ok(preview.locations.length >= 1);
    const fixtures = preview.locations.find((l) => l.name === "Fixtures");
    assert.ok(fixtures);
    assert.equal(fixtures!.defaultAction, "keep-live");
    assert.equal(fixtures!.forbidden, false);
    for (const loc of preview.locations) {
      assert.ok(
        loc.defaultAction === "keep-live" || loc.defaultAction === "disable",
        `${loc.name} defaulted to ${loc.defaultAction}`,
      );
    }
    const live = restoreLiveStats();
    assert.equal(live.dbPath, env.dbPath);
    assert.ok(live.dbBytes >= 0);
  });

  it("rejects slip names and non-.tar.gz", async () => {
    await assert.rejects(() => inspectBackup("../evil.tar.gz"), /Invalid export/);
    await assert.rejects(() => inspectBackup("notes.json"), /tar\.gz/);
  });

  it("rejects unknown format and missing library.db", async () => {
    packIntoExports("helix-backup-catalog-badfmt.tar.gz", {
      "MANIFEST.json": validManifest({ format: "helix-backup-v2" }),
      "library.db": "not-a-db",
    });
    await assert.rejects(
      () => inspectBackup("helix-backup-catalog-badfmt.tar.gz"),
      /unknown backup manifest/i,
    );

    packIntoExports("helix-backup-catalog-nodb.tar.gz", {
      "MANIFEST.json": validManifest(),
    });
    await assert.rejects(
      () => inspectBackup("helix-backup-catalog-nodb.tar.gz"),
      /library\.db/,
    );
  });

  it("rejects a symlink member inside the archive", async () => {
    packIntoExports("helix-backup-catalog-link.tar.gz", {
      "MANIFEST.json": validManifest(),
      "library.db": { link: "/tmp" },
    });
    await assert.rejects(
      () => inspectBackup("helix-backup-catalog-link.tar.gz"),
      /link|Unsafe/i,
    );
  });

  it("defaults unknown location names to disable and flags $HOME children", async () => {
    const docs = path.join(homedir(), "Documents");
    packIntoExports("helix-backup-catalog-docs.tar.gz", {
      "MANIFEST.json": validManifest({
        hostname: "other-box",
        locations: [
          {
            name: "Fixtures",
            root: fixtureRoot(),
            enabled: true,
            included: false,
          },
          {
            name: "Documents",
            root: docs,
            enabled: true,
            included: false,
          },
        ],
      }),
      "library.db": "x",
    });
    const preview = await inspectBackup("helix-backup-catalog-docs.tar.gz");
    assert.equal(preview.mode, "catalog");
    const fixtures = preview.locations.find((l) => l.name === "Fixtures");
    const documents = preview.locations.find((l) => l.name === "Documents");
    assert.equal(fixtures?.defaultAction, "keep-live");
    assert.equal(documents?.defaultAction, "disable");
    assert.equal(documents?.forbidden, true);
    assert.notEqual(documents?.defaultAction, "use-archived");
    assert.equal(preview.hostnameMismatch, true);
  });

  it("does not mint a restore session or write the live catalog path", () => {
    const exportsDir = path.join(env.dir, "exports");
    const names = existsSync(exportsDir) ? readdirSync(exportsDir) : [];
    assert.ok(!names.includes(".restore-session.json"));
    assert.ok(!names.some((n) => n.startsWith(".restore-staging")));
  });
});
