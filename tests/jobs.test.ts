import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createAcquireJob,
  getAcquireJob,
  isAcquireBusy,
  runAcquireJob,
  serializeAcquireJob,
} from "@/lib/acquire/jobs";
import { getLatestJob, startReindexAsync } from "@/lib/indexer/run";
import {
  completeJob,
  createJob,
  failJob,
  getJob,
  importLegacyAcquireJobsFileOnce,
  isKindBusy,
  listJobs,
  requestCancel,
  resetLegacyImportFlagForTests,
  toHelixJob,
  updateJobProgress,
} from "@/lib/jobs/store";
import { isHelixJobKind } from "@/lib/jobs/types";
import { getDbPath } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("unified jobs store", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
  });

  after(() => {
    env.cleanup();
  });

  it("create/complete/fail and list order", () => {
    const a = createJob({ kind: "arxiv", label: "paper-a" });
    const b = createJob({ kind: "youtube", label: "vid-b" });
    assert.ok(a.id > 0);
    assert.ok(b.id > a.id);
    assert.equal(a.status, "pending");

    updateJobProgress(a.id, { stage: "downloading", percent: 40 });
    completeJob(a.id, { itemId: 99, path: "/tmp/x.pdf" });
    const done = getJob(a.id);
    assert.equal(done?.status, "completed");
    assert.equal(done?.result?.itemId, 99);
    assert.equal(done?.progress.stage, "done");

    failJob(b.id, "boom");
    assert.equal(getJob(b.id)?.status, "failed");
    assert.equal(getJob(b.id)?.error, "boom");

    const listed = listJobs({ limit: 10 });
    assert.ok(listed.length >= 2);
    assert.ok(listed[0]!.createdAt >= listed[1]!.createdAt);
  });

  it("retention trims to last 50", () => {
    for (let i = 0; i < 55; i++) {
      createJob({ kind: "image", label: `img-${i}` });
    }
    const all = listJobs({ limit: 100 });
    assert.ok(all.length <= 50);
  });

  it("acquire wrapper uses integer ids", async () => {
    const job = createAcquireJob("arxiv", "1706.03762");
    assert.equal(typeof job.id, "number");
    const ser = serializeAcquireJob(job);
    assert.equal(typeof ser.id, "number");

    await runAcquireJob(job, async (report) => {
      report({ stage: "downloading", percent: 50, detail: "test" });
      return { itemId: 1, arxivId: "1706.03762" };
    });
    const done = getAcquireJob(job.id);
    assert.equal(done?.status, "completed");
    assert.equal(done?.result?.arxivId, "1706.03762");
  });

  it("isAcquireBusy tracks youtube pending/running", async () => {
    assert.equal(isAcquireBusy("youtube"), false);
    const job = createAcquireJob("youtube", "https://example.com/v");
    // pending counts as busy
    assert.equal(isAcquireBusy("youtube"), true);
    await runAcquireJob(job, async () => ({ ok: true }));
    assert.equal(isAcquireBusy("youtube"), false);
  });

  it("requestCancel marks pending cancelled", () => {
    const job = createJob({ kind: "arxiv", label: "to-cancel" });
    const updated = requestCancel(job.id);
    assert.equal(updated?.status, "cancelled");
  });

  it("isHelixJobKind restore and toHelixJob does not collapse to reindex", () => {
    assert.equal(isHelixJobKind("restore"), true);
    assert.equal(isHelixJobKind("nope"), false);
    assert.equal(isKindBusy("restore"), false);

    const job = createJob({ kind: "restore", label: "Restore snapshot" });
    assert.equal(job.kind, "restore");
    assert.equal(getJob(job.id)?.kind, "restore");

    const row = getDb().select().from(jobs).where(eq(jobs.id, job.id)).get();
    assert.ok(row);
    assert.equal(row.kind, "restore");
    assert.equal(toHelixJob(row).kind, "restore");
  });

  it("reindex jobs stay separate from getLatestJob", async () => {
    createAcquireJob("image", "noise");
    const { jobId, promise } = startReindexAsync();
    await promise.catch(() => {
      // fixture reindex may still succeed
    });
    const latest = getLatestJob();
    assert.ok(latest);
    assert.equal(latest!.kind, "reindex");
    assert.equal(latest!.id, jobId);
  });
});

describe("legacy acquire-jobs.json import", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    ensureThumbsParent();
    env = createTestEnv();
    resetLegacyImportFlagForTests();
  });

  after(() => {
    env.cleanup();
  });

  it("imports completed and marks pending as interrupted", () => {
    const dataDir = path.dirname(getDbPath());
    mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, "acquire-jobs.json");
    writeFileSync(
      file,
      JSON.stringify({
        seq: 2,
        jobs: {
          "acq-1": {
            id: "acq-old-done",
            kind: "arxiv",
            status: "completed",
            createdAt: Date.now() - 1000,
            startedAt: Date.now() - 900,
            finishedAt: Date.now() - 100,
            error: null,
            result: { itemId: 7 },
            label: "legacy-done",
            progress: { stage: "done", percent: 100 },
          },
          "acq-2": {
            id: "acq-old-run",
            kind: "youtube",
            status: "running",
            createdAt: Date.now() - 500,
            startedAt: Date.now() - 400,
            finishedAt: null,
            error: null,
            result: null,
            label: "legacy-run",
            progress: { stage: "downloading", percent: 12 },
          },
        },
      }),
    );

    resetLegacyImportFlagForTests();
    importLegacyAcquireJobsFileOnce();

    const listed = listJobs({ limit: 30, kinds: ["arxiv", "youtube"] });
    const done = listed.find((j) => j.label.includes("legacy-done"));
    const failed = listed.find((j) => j.label.includes("legacy-run"));
    assert.ok(done);
    assert.equal(done!.status, "completed");
    assert.equal(done!.result?.itemId, 7);
    assert.ok(failed);
    assert.equal(failed!.status, "failed");
    assert.match(failed!.error ?? "", /Interrupted by jobs migration/);
  });
});
