import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { exportsRoot } from "@/lib/backup/paths";
import {
  RESTORE_STAGE_BANDS,
  clearRestoreProgress,
  initRestoreProgress,
  isRestoreCancelRequested,
  isRestoreSidecarBusy,
  isRestoreStageCancellable,
  patchRestoreProgress,
  readRestoreProgress,
  requestRestoreCancel,
  restoreProgressPath,
  restoreStageProgress,
  writeRestoreProgress,
} from "@/lib/backup/progress";
import {
  RESTORE_SESSION_TTL_MS,
  RestoreSessionError,
  clearRestoreSession,
  consumeRestoreSession,
  mintRestoreSession,
  readRestoreSession,
  restoreSessionPath,
  verifyRestoreSession,
} from "@/lib/backup/session";
import { getDbPath } from "@/lib/config";
import { createJob, isKindBusy } from "@/lib/jobs/store";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

const ARCHIVE = "helix-backup-catalog-2026-08-08T12-00-00Z.tar.gz";
const HASH = "abc123preview";

function assertSessionError(fn: () => unknown, status: number, re: RegExp) {
  try {
    fn();
    assert.fail(`expected RestoreSessionError ${status}`);
  } catch (err) {
    assert.ok(err instanceof RestoreSessionError);
    assert.equal(err.status, status);
    assert.match(err.message, re);
  }
}

describe("restore confirm session", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    ensureThumbsParent();
    env = createTestEnv();
  });

  after(() => {
    env.cleanup();
  });

  it("mints under exportsRoot, binds name+hash only, mode 0600", () => {
    const session = mintRestoreSession({
      name: ARCHIVE,
      previewHash: HASH,
      now: 1_700_000_000_000,
    });
    assert.match(session.token, /^[0-9a-f]{64}$/);
    assert.equal(session.name, ARCHIVE);
    assert.equal(session.previewHash, HASH);
    assert.equal(session.consumedAt, null);
    assert.equal(session.createdAt, 1_700_000_000_000);
    assert.equal(
      session.expiresAt,
      1_700_000_000_000 + RESTORE_SESSION_TTL_MS,
    );

    const dest = restoreSessionPath();
    assert.equal(dest, path.join(exportsRoot(), ".restore-session.json"));
    assert.ok(dest.startsWith(path.dirname(getDbPath())));
    assert.ok(dest.startsWith(env.dir));
    assert.ok(existsSync(dest));
    assert.equal(statSync(dest).mode & 0o777, 0o600);

    const raw = JSON.parse(readFileSync(dest, "utf8")) as Record<
      string,
      unknown
    >;
    assert.deepEqual(
      Object.keys(raw).sort(),
      [
        "consumedAt",
        "createdAt",
        "expiresAt",
        "name",
        "previewHash",
        "token",
      ].sort(),
    );
    assert.equal("includeThumbs" in raw, false);
    assert.equal("applyLocationRoots" in raw, false);
    assert.equal("locationActions" in raw, false);

    const loaded = readRestoreSession();
    assert.ok(loaded);
    assert.equal(loaded.token, session.token);
    assert.equal("includeThumbs" in loaded, false);
  });

  it("expires after 10 minutes", () => {
    const now = 2_000_000_000_000;
    const session = mintRestoreSession({
      name: ARCHIVE,
      previewHash: HASH,
      now,
    });
    const ok = verifyRestoreSession({
      token: session.token,
      name: ARCHIVE,
      previewHash: HASH,
      now: now + RESTORE_SESSION_TTL_MS - 1,
    });
    assert.equal(ok.token, session.token);

    assertSessionError(
      () =>
        verifyRestoreSession({
          token: session.token,
          name: ARCHIVE,
          previewHash: HASH,
          now: now + RESTORE_SESSION_TTL_MS,
        }),
      400,
      /expired/i,
    );
    assertSessionError(
      () =>
        consumeRestoreSession({
          token: session.token,
          name: ARCHIVE,
          previewHash: HASH,
          now: now + RESTORE_SESSION_TTL_MS + 1,
        }),
      400,
      /expired/i,
    );
  });

  it("consume-once is 409 on reuse; mismatch is 400", () => {
    const session = mintRestoreSession({
      name: ARCHIVE,
      previewHash: HASH,
    });
    const used = consumeRestoreSession({
      token: session.token,
      name: ARCHIVE,
      previewHash: HASH,
    });
    assert.ok(used.consumedAt);
    assert.equal(readRestoreSession()?.consumedAt, used.consumedAt);

    assertSessionError(
      () =>
        consumeRestoreSession({
          token: session.token,
          name: ARCHIVE,
          previewHash: HASH,
        }),
      409,
      /already used/i,
    );
    assertSessionError(
      () =>
        verifyRestoreSession({
          token: session.token,
          name: ARCHIVE,
          previewHash: HASH,
        }),
      409,
      /already used/i,
    );

    const next = mintRestoreSession({
      name: ARCHIVE,
      previewHash: HASH,
    });
    assert.equal(next.consumedAt, null);
    assert.notEqual(next.token, session.token);

    assertSessionError(
      () =>
        consumeRestoreSession({
          token: "0".repeat(64),
          name: ARCHIVE,
          previewHash: HASH,
        }),
      400,
      /mismatch/i,
    );
    assertSessionError(
      () =>
        consumeRestoreSession({
          token: next.token,
          name: "helix-backup-catalog-1999-01-01T00-00-00Z.tar.gz",
          previewHash: HASH,
        }),
      400,
      /name mismatch/i,
    );
    assertSessionError(
      () =>
        consumeRestoreSession({
          token: next.token,
          name: ARCHIVE,
          previewHash: "different-hash",
        }),
      400,
      /hash mismatch/i,
    );
  });

  it("missing session rejects; mint overwrites a consumed token", () => {
    clearRestoreSession();
    assert.equal(readRestoreSession(), null);
    assertSessionError(
      () =>
        consumeRestoreSession({
          token: "a".repeat(64),
          name: ARCHIVE,
          previewHash: HASH,
        }),
      400,
      /no restore session/i,
    );

    const first = mintRestoreSession({ name: ARCHIVE, previewHash: HASH });
    consumeRestoreSession({
      token: first.token,
      name: ARCHIVE,
      previewHash: HASH,
    });
    const second = mintRestoreSession({ name: ARCHIVE, previewHash: HASH });
    assert.equal(second.consumedAt, null);
    const used = consumeRestoreSession({
      token: second.token,
      name: ARCHIVE,
      previewHash: HASH,
    });
    assert.ok(used.consumedAt);
  });
});

describe("restore sidecar progress", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    ensureThumbsParent();
    env = createTestEnv();
  });

  after(() => {
    env.cleanup();
  });

  it("reads, writes, and cancels next to the DB", () => {
    assert.equal(readRestoreProgress(), null);
    assert.equal(isRestoreSidecarBusy(), false);
    assert.equal(isKindBusy("restore"), false);

    const dest = restoreProgressPath();
    assert.equal(dest, path.join(exportsRoot(), ".restore-progress.json"));
    assert.ok(dest.startsWith(env.dir));

    const sidecar = initRestoreProgress({
      label: "Restore snapshot",
      archiveName: ARCHIVE,
    });
    assert.equal(sidecar.v, 1);
    assert.equal(sidecar.status, "pending");
    assert.equal(sidecar.progress.stage, "queued");
    assert.equal(sidecar.progress.percent, 0);
    assert.equal(sidecar.cancelRequested, false);
    assert.equal(sidecar.jobIdHint, null);
    assert.equal(isRestoreSidecarBusy(), true);
    assert.equal(isKindBusy("restore"), true);

    const extract = patchRestoreProgress({
      status: "running",
      startedAt: Date.now(),
      progress: { stage: "extract" },
    });
    assert.equal(extract.progress.stage, "extract");
    assert.equal(extract.progress.percent, RESTORE_STAGE_BANDS.extract.min);
    assert.equal(isRestoreStageCancellable("extract"), true);
    assert.equal(isRestoreStageCancellable("copy"), false);

    const cancelled = requestRestoreCancel();
    assert.equal(cancelled.cancelRequested, true);
    assert.equal(isRestoreCancelRequested(), true);
    assert.equal(readRestoreProgress()?.cancelRequested, true);
    // Flag-only: mid-flight apply (later PR) decides if copy is too late.
    assert.equal(isRestoreSidecarBusy(), true);

    const done = writeRestoreProgress({
      ...cancelled,
      status: "completed",
      finishedAt: Date.now(),
      progress: restoreStageProgress("finalize", {
        percent: 100,
        detail: "Complete",
      }),
    });
    assert.equal(done.status, "completed");
    assert.equal(isRestoreSidecarBusy(), false);
    assert.equal(isKindBusy("restore"), false);

    const job = createJob({ kind: "restore", label: "Restore snapshot" });
    assert.equal(isKindBusy("restore"), true);
    assert.equal(job.kind, "restore");

    clearRestoreProgress();
    assert.equal(readRestoreProgress(), null);
  });
});
