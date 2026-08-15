import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { POST as cancelRestore } from "@/app/api/restore/cancel/route";
import { POST as inspectRestore } from "@/app/api/restore/inspect/route";
import { DELETE as deleteRestoreSession } from "@/app/api/restore/session/route";
import {
  GET as getRestore,
  POST as applyRestoreHttp,
  restoreApplyHttpHooks,
} from "@/app/api/restore/route";
import { createBackup } from "@/lib/backup/create";
import {
  RestoreHttpError,
  assertRestoreHttpCaller,
  parseHostHeader,
} from "@/lib/backup/http";
import { exportsRoot } from "@/lib/backup/paths";
import {
  RESTORE_SIDECAR_KEEP_MS,
  clearRestoreProgress,
  initRestoreProgress,
  isRestoreCancelRequested,
  readRestoreProgress,
  restoreStageProgress,
  writeRestoreProgress,
} from "@/lib/backup/progress";
import { readRestoreSession } from "@/lib/backup/session";
import { getSqlite } from "@/lib/db/client";
import { parseRestoreCliArgs, runRestoreCli } from "../scripts/restore";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

const LAN_KEYS = [
  "NON_OS_LAN",
  "NON_OS_ALLOW_LAN",
  "NON_OS_RESTORE_OK",
  "NON_OS_RESTORE",
] as const;

function snapshotEnv(): Record<(typeof LAN_KEYS)[number], string | undefined> {
  const out = {} as Record<(typeof LAN_KEYS)[number], string | undefined>;
  for (const k of LAN_KEYS) out[k] = process.env[k];
  return out;
}

function restoreEnv(
  snap: Record<(typeof LAN_KEYS)[number], string | undefined>,
): void {
  for (const k of LAN_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function restoreReq(
  urlPath: string,
  init?: RequestInit & { host?: string },
): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has("host")) {
    headers.set("host", init?.host ?? "127.0.0.1:4747");
  }
  return new Request(`http://127.0.0.1:4747${urlPath}`, {
    ...init,
    headers,
  });
}

async function readJson(
  res: Response,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("restore HTTP caller (LAN / Host)", () => {
  let envSnap: ReturnType<typeof snapshotEnv>;

  beforeEach(() => {
    envSnap = snapshotEnv();
    delete process.env.NON_OS_LAN;
    delete process.env.NON_OS_ALLOW_LAN;
    delete process.env.NON_OS_RESTORE_OK;
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  it("parses Host: [::1]:4747 without split(':')[0]", () => {
    const parsed = parseHostHeader("[::1]:4747");
    assert.equal(parsed.hostname, "[::1]");
    assert.equal(parsed.port, "4747");
    // The naive split that middleware uses would yield "[".
    assert.notEqual("[::1]:4747".split(":")[0], parsed.hostname);

    assert.doesNotThrow(() =>
      assertRestoreHttpCaller(
        restoreReq("/api/restore", { host: "[::1]:4747" }),
      ),
    );
  });

  it("LAN without NON_OS_RESTORE_OK is 403 even with loopback Host", () => {
    process.env.NON_OS_LAN = "1";
    delete process.env.NON_OS_RESTORE_OK;
    try {
      assertRestoreHttpCaller(
        restoreReq("/api/restore", { host: "127.0.0.1:4747" }),
      );
      assert.fail("expected RestoreHttpError 403");
    } catch (err) {
      assert.ok(err instanceof RestoreHttpError);
      assert.equal(err.status, 403);
      assert.match(err.message, /LAN preview/i);
    }
  });

  it("LAN Host spoof is still blocked by lanMode without NON_OS_RESTORE_OK", () => {
    process.env.NON_OS_LAN = "1";
    try {
      assertRestoreHttpCaller(
        restoreReq("/api/restore", { host: "192.168.1.10:4747" }),
      );
      assert.fail("expected 403");
    } catch (err) {
      assert.ok(err instanceof RestoreHttpError);
      assert.equal(err.status, 403);
    }
  });

  it("NON_OS_RESTORE_OK=1 still requires a loopback Host", () => {
    process.env.NON_OS_LAN = "1";
    process.env.NON_OS_RESTORE_OK = "1";
    assert.doesNotThrow(() =>
      assertRestoreHttpCaller(
        restoreReq("/api/restore", { host: "127.0.0.1:4747" }),
      ),
    );
    try {
      assertRestoreHttpCaller(
        restoreReq("/api/restore", { host: "192.168.1.10:4747" }),
      );
      assert.fail("expected 403");
    } catch (err) {
      assert.ok(err instanceof RestoreHttpError);
      assert.equal(err.status, 403);
      assert.match(err.message, /localhost/i);
    }
  });

  it("refuses a loopback Origin on the wrong port; matching port is allowed", () => {
    try {
      assertRestoreHttpCaller(
        restoreReq("/api/restore", {
          headers: {
            host: "127.0.0.1:4747",
            origin: "http://127.0.0.1:3000",
          },
        }),
      );
      assert.fail("expected origin port 403");
    } catch (err) {
      assert.ok(err instanceof RestoreHttpError);
      assert.equal(err.status, 403);
      assert.match(err.message, /origin/i);
    }

    try {
      assertRestoreHttpCaller(
        restoreReq("/api/restore", {
          headers: {
            host: "127.0.0.1:4747",
            origin: "http://127.0.0.1",
          },
        }),
      );
      assert.fail("expected default-port origin 403");
    } catch (err) {
      assert.ok(err instanceof RestoreHttpError);
      assert.equal(err.status, 403);
    }

    assert.doesNotThrow(() =>
      assertRestoreHttpCaller(
        restoreReq("/api/restore", {
          headers: {
            host: "127.0.0.1:4747",
            origin: "http://127.0.0.1:4747",
          },
        }),
      ),
    );
  });

  it("refuses a non-loopback Origin and ignores X-Forwarded-For", () => {
    try {
      assertRestoreHttpCaller(
        restoreReq("/api/restore", {
          headers: {
            host: "127.0.0.1:4747",
            origin: "https://evil.example",
            "x-forwarded-for": "127.0.0.1",
          },
        }),
      );
      assert.fail("expected origin 403");
    } catch (err) {
      assert.ok(err instanceof RestoreHttpError);
      assert.equal(err.status, 403);
      assert.match(err.message, /origin/i);
    }

    try {
      assertRestoreHttpCaller(
        restoreReq("/api/restore", {
          headers: {
            host: "10.0.0.8:4747",
            "x-forwarded-for": "127.0.0.1",
          },
        }),
      );
      assert.fail("expected host 403");
    } catch (err) {
      assert.ok(err instanceof RestoreHttpError);
      assert.equal(err.status, 403);
    }
  });
});

describe("restore HTTP routes + CLI", () => {
  let env: ReturnType<typeof createTestEnv>;
  let envSnap: ReturnType<typeof snapshotEnv>;

  before(() => {
    ensureThumbsParent();
    env = createTestEnv();
    getSqlite();
  });

  beforeEach(() => {
    envSnap = snapshotEnv();
    delete process.env.NON_OS_LAN;
    delete process.env.NON_OS_ALLOW_LAN;
    delete process.env.NON_OS_RESTORE_OK;
    delete process.env.NON_OS_RESTORE;
    clearRestoreProgress();
  });

  afterEach(() => {
    restoreEnv(envSnap);
    clearRestoreProgress();
    restoreApplyHttpHooks.afterInspect = undefined;
  });

  after(() => {
    env.cleanup();
  });

  it("GET /api/restore is 403 when LAN is on without NON_OS_RESTORE_OK", async () => {
    process.env.NON_OS_LAN = "1";
    const { status, body } = await readJson(await getRestore(restoreReq("/api/restore")));
    assert.equal(status, 403);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /LAN preview/i);
  });

  it("GET /api/restore reads sidecar only; expires completed after 24h", async () => {
    const idle = await readJson(await getRestore(restoreReq("/api/restore")));
    assert.equal(idle.status, 200);
    assert.deepEqual(idle.body, { ok: true, active: false });

    const now = Date.now();
    writeRestoreProgress({
      v: 1,
      jobIdHint: 9,
      status: "completed",
      label: "Restore test",
      archiveName: "helix-backup-catalog-2026-08-15T00-00-00Z.tar.gz",
      createdAt: now - 1000,
      startedAt: now - 1000,
      finishedAt: now,
      error: null,
      cancelRequested: false,
      progress: restoreStageProgress("finalize", {
        percent: 100,
        detail: "Complete",
      }),
      result: { itemCount: 1 },
    });
    const live = await readJson(await getRestore(restoreReq("/api/restore")));
    assert.equal(live.status, 200);
    assert.equal(live.body.ok, true);
    assert.equal(live.body.active, true);
    assert.equal(live.body.status, "completed");
    assert.equal(live.body.jobIdHint, 9);

    writeRestoreProgress({
      v: 1,
      jobIdHint: 9,
      status: "completed",
      label: "Restore test",
      archiveName: "helix-backup-catalog-2026-08-15T00-00-00Z.tar.gz",
      createdAt: now - RESTORE_SIDECAR_KEEP_MS - 5_000,
      startedAt: now - RESTORE_SIDECAR_KEEP_MS - 5_000,
      finishedAt: now - RESTORE_SIDECAR_KEEP_MS - 1,
      error: null,
      cancelRequested: false,
      progress: { stage: "done", percent: 100 },
      result: null,
    });
    const expired = await readJson(await getRestore(restoreReq("/api/restore")));
    assert.equal(expired.status, 200);
    assert.deepEqual(expired.body, { ok: true, active: false });
    assert.equal(readRestoreProgress(), null);
  });

  it("inspect 404 for a missing jail archive; 400 for a non-tar.gz name", async () => {
    const missing = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "helix-backup-catalog-1999-01-01T00-00-00Z.tar.gz",
          }),
        }),
      ),
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.body.ok, false);

    const bad = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "notes.json" }),
        }),
      ),
    );
    assert.equal(bad.status, 400);
    assert.equal(bad.body.ok, false);
  });

  it("apply without phrase is 400; missing ack is 400", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const inspected = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: created.name }),
        }),
      ),
    );
    assert.equal(inspected.status, 200);
    const token = inspected.body.confirmToken;

    const missingPhrase = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: token,
            acknowledge: true,
            includeThumbs: false,
          }),
        }),
      ),
    );
    assert.equal(missingPhrase.status, 400);
    assert.match(String(missingPhrase.body.error), /phrase/i);
    assert.equal(readRestoreSession()?.consumedAt, null);

    const missingAck = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: token,
            phrase: "RESTORE",
            includeThumbs: false,
          }),
        }),
      ),
    );
    assert.equal(missingAck.status, 400);
    assert.match(String(missingAck.body.error), /acknowledge/i);
    assert.equal(readRestoreSession()?.consumedAt, null);
  });

  it("inspect mints a token; apply is sync and consume-once; busy does not burn the token", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const inspected = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: created.name }),
        }),
      ),
    );
    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.ok, true);
    assert.equal((inspected.body.preview as { mode?: string })?.mode, "catalog");
    assert.match(String(inspected.body.confirmToken), /^[0-9a-f]{64}$/);
    assert.ok(inspected.body.live && typeof inspected.body.live === "object");

    initRestoreProgress({
      label: "blocker",
      archiveName: created.name,
    });
    const busy = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: inspected.body.confirmToken,
            phrase: "RESTORE",
            acknowledge: true,
            includeThumbs: false,
          }),
        }),
      ),
    );
    assert.equal(busy.status, 409);
    assert.equal(readRestoreSession()?.consumedAt, null);
    clearRestoreProgress();

    const applied = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: inspected.body.confirmToken,
            phrase: "RESTORE",
            acknowledge: true,
            includeThumbs: false,
          }),
        }),
      ),
    );
    assert.equal(applied.status, 200);
    assert.equal(applied.body.ok, true);
    assert.equal(applied.body.async, false);
    const result = applied.body.result as {
      undoBackup: string;
      itemCount: number;
      jobId: number;
    };
    assert.ok(result.undoBackup.includes("-prerestore-"));
    assert.equal(typeof result.itemCount, "number");
    assert.equal(typeof result.jobId, "number");
    assert.ok(readRestoreSession()?.consumedAt);

    const replay = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: inspected.body.confirmToken,
            phrase: "RESTORE",
            acknowledge: true,
            includeThumbs: false,
          }),
        }),
      ),
    );
    assert.equal(replay.status, 409);
    assert.match(String(replay.body.error), /already used/i);
  });

  it("DELETE /api/restore/session drops the token; cancel is 404/409", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const inspected = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: created.name }),
        }),
      ),
    );
    assert.equal(inspected.status, 200);
    assert.ok(readRestoreSession());

    const dropped = await readJson(
      await deleteRestoreSession(restoreReq("/api/restore/session", { method: "DELETE" })),
    );
    assert.equal(dropped.status, 200);
    assert.deepEqual(dropped.body, { ok: true });
    assert.equal(readRestoreSession(), null);

    const noSidecar = await readJson(
      await cancelRestore(restoreReq("/api/restore/cancel", { method: "POST" })),
    );
    assert.equal(noSidecar.status, 404);

    const running = initRestoreProgress({
      label: "Restore copy",
      archiveName: created.name,
    });
    writeRestoreProgress({
      ...running,
      status: "running",
      startedAt: Date.now(),
      progress: restoreStageProgress("copy", { detail: "Copying…" }),
    });
    const tooLate = await readJson(
      await cancelRestore(restoreReq("/api/restore/cancel", { method: "POST" })),
    );
    assert.equal(tooLate.status, 409);
    assert.match(String(tooLate.body.error), /too late/i);

    writeRestoreProgress({
      ...readRestoreProgress()!,
      status: "running",
      progress: restoreStageProgress("extract", { detail: "Extracting…" }),
      cancelRequested: false,
    });
    const cancelled = await readJson(
      await cancelRestore(restoreReq("/api/restore/cancel", { method: "POST" })),
    );
    assert.equal(cancelled.status, 200);
    assert.deepEqual(cancelled.body, { ok: true });
    assert.equal(isRestoreCancelRequested(), true);
  });

  it("NON_OS_RESTORE=0 forbids apply but inspect still works", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    process.env.NON_OS_RESTORE = "0";
    const inspected = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: created.name }),
        }),
      ),
    );
    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.ok, true);
    assert.match(String(inspected.body.confirmToken), /^[0-9a-f]{64}$/);

    const blocked = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: inspected.body.confirmToken,
            phrase: "RESTORE",
            acknowledge: true,
            includeThumbs: false,
          }),
        }),
      ),
    );
    assert.equal(blocked.status, 403);
    assert.match(String(blocked.body.error), /NON_OS_RESTORE/i);
    assert.equal(readRestoreSession()?.consumedAt, null);
  });

  it("busy after inspect yield does not consume the token", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const inspected = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: created.name }),
        }),
      ),
    );
    assert.equal(inspected.status, 200);
    restoreApplyHttpHooks.afterInspect = () => {
      initRestoreProgress({
        label: "blocker-after-inspect",
        archiveName: created.name,
      });
    };
    const busy = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: inspected.body.confirmToken,
            phrase: "RESTORE",
            acknowledge: true,
            includeThumbs: false,
          }),
        }),
      ),
    );
    assert.equal(busy.status, 409);
    assert.equal(readRestoreSession()?.consumedAt, null);
  });

  it("omitted includeThumbs skips thumbs when the archive has none", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const inspected = await readJson(
      await inspectRestore(
        restoreReq("/api/restore/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: created.name }),
        }),
      ),
    );
    assert.equal(inspected.status, 200);
    assert.equal((inspected.body.preview as { hasThumbs?: boolean }).hasThumbs, false);

    const applied = await readJson(
      await applyRestoreHttp(
        restoreReq("/api/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: created.name,
            confirmToken: inspected.body.confirmToken,
            phrase: "RESTORE",
            acknowledge: true,
          }),
        }),
      ),
    );
    assert.equal(applied.status, 200);
    assert.equal(applied.body.ok, true);
    assert.equal(
      (applied.body.result as { appliedThumbs?: boolean }).appliedThumbs,
      false,
    );
    assert.ok(readRestoreSession()?.consumedAt);
  });

  it("CLI --inspect exits 0 and mints a session", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const code = await runRestoreCli(["--inspect", created.name]);
      assert.equal(code, 0);
    } finally {
      console.log = orig;
    }
    const text = logs.join("\n");
    assert.match(text, /previewHash/);
    assert.match(text, new RegExp(created.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const session = readRestoreSession();
    assert.ok(session);
    assert.equal(session.name, created.name);
    assert.equal(session.consumedAt, null);
  });

  it("CLI --name without --phrase exits 1 and does not apply", async () => {
    const created = await createBackup({ mode: "catalog", includeThumbs: false });
    const before = new Set(
      readdirSync(exportsRoot()).filter((n) => n.includes("-prerestore-")),
    );
    const errs: string[] = [];
    const origErr = console.error;
    const origLog = console.log;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    console.log = () => {
      /* preview JSON */
    };
    try {
      const code = await runRestoreCli(["--name", created.name]);
      assert.equal(code, 1);
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
    assert.match(errs.join("\n"), /pass --phrase RESTORE/);
    const after = readdirSync(exportsRoot()).filter((n) =>
      n.includes("-prerestore-"),
    );
    assert.deepEqual(
      after.filter((n) => !before.has(n)),
      [],
    );
    assert.equal(readRestoreProgress(), null);
  });

  it("CLI arg parser is inspect-by-default", () => {
    assert.deepEqual(parseRestoreCliArgs([]), {
      noThumbs: false,
      applyRoots: false,
      help: false,
    });
    const inspect = parseRestoreCliArgs([
      "--inspect",
      "helix-backup-catalog-2026-08-15T00-00-00Z.tar.gz",
    ]);
    assert.equal(
      inspect.inspect,
      "helix-backup-catalog-2026-08-15T00-00-00Z.tar.gz",
    );
    const apply = parseRestoreCliArgs([
      "--name",
      "helix-backup-catalog-2026-08-15T00-00-00Z.tar.gz",
      "--phrase",
      "RESTORE",
      "--no-thumbs",
    ]);
    assert.equal(apply.phrase, "RESTORE");
    assert.equal(apply.noThumbs, true);
  });
});
