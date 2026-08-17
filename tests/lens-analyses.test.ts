import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { searchCatalog } from "@/lib/catalog/query";
import { ITEM_KINDS } from "@/lib/types";
import {
  deleteLensAnalysis,
  getLensAnalysis,
  upsertLensAnalysis,
} from "@/lib/lens/analyses";
import {
  canStartAnalyzeWithoutForce,
  lensFingerprint,
  parseLensDossier,
  resolveAnalysisTopStatus,
} from "@/lib/lens/dossier";
import { allKindObjectSpecs, kindObjectSpec } from "@/lib/lens/kind-object";
import { gatherLensContext } from "@/lib/lens/context";
import { buildLocalDossier } from "@/lib/lens/local-dossier";
import {
  getLensAnalysisState,
  startLensAnalyze,
} from "@/lib/lens/run-analyze";
import {
  completeJob,
  createJob,
  getJob,
  markJobRunning,
  seedJobResult,
  updateJobProgress,
} from "@/lib/jobs/store";
import { isHelixJobKind } from "@/lib/jobs/types";
import { findActiveLensJob } from "@/lib/lens/find-active-job";
import { getSqlite } from "@/lib/db/client";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("Deep Lens S2 analyses + jobs binding", () => {
  let env: ReturnType<typeof createTestEnv>;
  let welcomeId: number;

  let prevAgentMode: string | undefined;
  let prevUseXai: string | undefined;

  before(async () => {
    // Force local extractive path (no async xAI job) for deterministic tests.
    prevAgentMode = process.env.NON_OS_AGENT_MODE;
    prevUseXai = process.env.NON_OS_USE_XAI;
    process.env.NON_OS_AGENT_MODE = "local";
    process.env.NON_OS_USE_XAI = "0";

    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
    const hit = searchCatalog({ q: "welcome", pageSize: 10 });
    const welcome = hit.items.find((i) => i.name === "welcome.txt");
    assert.ok(welcome);
    welcomeId = welcome!.id;
  });

  after(() => {
    if (prevAgentMode === undefined) delete process.env.NON_OS_AGENT_MODE;
    else process.env.NON_OS_AGENT_MODE = prevAgentMode;
    if (prevUseXai === undefined) delete process.env.NON_OS_USE_XAI;
    else process.env.NON_OS_USE_XAI = prevUseXai;
    env.cleanup();
  });

  it("isHelixJobKind accepts lens_analyze", () => {
    assert.equal(isHelixJobKind("lens_analyze"), true);
    assert.equal(isHelixJobKind("nope"), false);
  });

  it("kindObjectSpec covers all ITEM_KINDS", () => {
    const specs = allKindObjectSpecs();
    assert.equal(specs.length, ITEM_KINDS.length);
    for (const k of ITEM_KINDS) {
      const s = kindObjectSpec(k);
      assert.equal(s.kind, k);
      assert.ok(s.metaphor);
      assert.ok(s.label.length > 0);
    }
    assert.equal(kindObjectSpec("bogus").kind, "other");
  });

  it("lensFingerprint prefers content_hash", () => {
    assert.equal(
      lensFingerprint({
        contentHash: "abc123",
        mtimeMs: 1,
        sizeBytes: 2,
      }),
      "abc123",
    );
    assert.equal(
      lensFingerprint({
        contentHash: null,
        mtimeMs: 99,
        sizeBytes: 10,
      }),
      "mtime:99:size:10",
    );
  });

  it("resolveAnalysisTopStatus precedence", () => {
    const fp = "fp1";
    const row = {
      id: 1,
      itemId: 1,
      contentHash: null,
      fingerprint: fp,
      mode: "local",
      model: "local",
      status: "completed" as const,
      payload: parseLensDossier({
        schemaVersion: 1,
        summary: "s",
        keyPoints: [],
        themes: [],
        entities: [],
        contentFacts: [],
        suggestedTags: [],
        suggestedCollections: [],
        caveats: [],
        sources: {
          usedItemText: false,
          itemTextChars: 0,
          truncated: false,
          usedVision: false,
          usedMetadataOnly: true,
          contentHashMissing: true,
        },
      }),
      error: null,
      createdAt: 0,
      updatedAt: 0,
    };
    assert.equal(
      resolveAnalysisTopStatus({
        activeJobId: 9,
        row,
        currentFingerprint: fp,
      }),
      "running",
    );
    assert.equal(
      resolveAnalysisTopStatus({
        activeJobId: null,
        row: null,
        currentFingerprint: fp,
      }),
      "missing",
    );
    assert.equal(
      resolveAnalysisTopStatus({
        activeJobId: null,
        row: { ...row, fingerprint: "old" },
        currentFingerprint: fp,
      }),
      "stale",
    );
    assert.equal(
      resolveAnalysisTopStatus({
        activeJobId: null,
        row: { ...row, status: "failed", payload: null },
        currentFingerprint: fp,
      }),
      "failed",
    );
    assert.equal(
      resolveAnalysisTopStatus({
        activeJobId: null,
        row,
        currentFingerprint: fp,
      }),
      "fresh",
    );
    assert.equal(canStartAnalyzeWithoutForce("missing"), true);
    assert.equal(canStartAnalyzeWithoutForce("fresh"), false);
  });

  it("progress.itemId survives markJobRunning (KD17)", () => {
    const job = createJob({
      kind: "lens_analyze",
      label: "Deep Lens · test",
    });
    updateJobProgress(
      job.id,
      {
        stage: "queued",
        percent: 0,
        detail: `item ${welcomeId}`,
        itemId: welcomeId,
      },
      { force: true },
    );
    seedJobResult(job.id, { itemId: welcomeId });
    markJobRunning(job.id);
    updateJobProgress(
      job.id,
      { stage: "gather", percent: 10, detail: "Gathering…" },
      { force: true },
    );

    const got = getJob(job.id);
    assert.ok(got);
    assert.equal(got!.progress.itemId, welcomeId);

    const raw = getSqlite()
      .prepare(`SELECT progress_json FROM jobs WHERE id = ?`)
      .get(job.id) as { progress_json: string };
    const parsed = JSON.parse(raw.progress_json) as { itemId?: number };
    assert.equal(parsed.itemId, welcomeId);

    const active = findActiveLensJob(welcomeId);
    assert.ok(active);
    assert.equal(active!.id, job.id);

    // Finish job so later tests are not blocked by single-flight running.
    completeJob(job.id, { itemId: welcomeId, ok: true });
    assert.equal(findActiveLensJob(welcomeId), null);
  });

  it("local analyze create-then-get is fresh", async () => {
    const started = await startLensAnalyze(welcomeId, { force: true });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.equal(started.status, "fresh");
    assert.ok(started.analysis);
    assert.ok(started.analysis!.payload);
    assert.equal(started.analysis!.payload!.entities.length, 0);
    assert.equal(started.analysis!.mode, "local");

    const state = getLensAnalysisState(welcomeId);
    assert.equal(state.status, "fresh");
    assert.ok(state.analysis?.payload?.summary);

    const again = await startLensAnalyze(welcomeId, { force: false });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.started, false);
    assert.equal(again.status, "fresh");
  });

  it("fingerprint change marks stale", () => {
    const ctx = gatherLensContext(welcomeId);
    assert.ok(ctx);
    const row = getLensAnalysis(welcomeId);
    assert.ok(row);
    // Force mismatch
    upsertLensAnalysis({
      itemId: welcomeId,
      contentHash: ctx!.contentHash,
      fingerprint: "mtime:0:size:0",
      mode: "local",
      model: "local",
      status: "completed",
      payload: buildLocalDossier(ctx!),
    });
    const state = getLensAnalysisState(welcomeId);
    assert.equal(state.status, "stale");
  });

  it("deleteLensAnalysis removes the cached dossier", async () => {
    const started = await startLensAnalyze(welcomeId, { force: true });
    assert.equal(started.ok, true);
    assert.ok(getLensAnalysis(welcomeId));
    assert.equal(deleteLensAnalysis(welcomeId), true);
    assert.equal(getLensAnalysis(welcomeId), null);
    assert.equal(deleteLensAnalysis(welcomeId), false);
  });

  it("buildLocalDossier is honest without body inventing entities", () => {
    const ctx = gatherLensContext(welcomeId);
    assert.ok(ctx);
    const d = buildLocalDossier(ctx!);
    assert.equal(d.schemaVersion, 1);
    assert.equal(d.entities.length, 0);
    assert.ok(d.summary.length > 0);
    assert.ok(d.sources.usedItemText || d.sources.usedMetadataOnly);
  });
});
