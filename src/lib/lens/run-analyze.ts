import { resolveAgentMode } from "@/lib/agent/mode";
import { isReindexRunning } from "@/lib/indexer/run";
import {
  getLensAnalysis,
  upsertLensAnalysis,
} from "@/lib/lens/analyses";
import { gatherLensContext } from "@/lib/lens/context";
import {
  canStartAnalyzeWithoutForce,
  resolveAnalysisTopStatus,
  type LensAnalysisTopStatus,
} from "@/lib/lens/dossier";
import { findActiveLensJob } from "@/lib/lens/find-active-job";
import { buildLocalDossier } from "@/lib/lens/local-dossier";
import { runXaiDossier } from "@/lib/lens/xai-dossier";
import {
  createJob,
  runHelixJob,
  seedJobResult,
  updateJobProgress,
} from "@/lib/jobs/store";
import type { HelixJob } from "@/lib/jobs/types";
import type { LensAnalysisRowView } from "@/lib/lens/dossier";

export function lensAnalyzeEnabled(): boolean {
  const v = process.env.NON_OS_LENS_ANALYZE;
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

export type LensAnalysisGetResult = {
  status: LensAnalysisTopStatus;
  analysis: LensAnalysisRowView | null;
  jobId: number | null;
  agentMode: "local" | "xai";
  currentFingerprint: string | null;
};

export function getLensAnalysisState(itemId: number): LensAnalysisGetResult {
  const ctx = gatherLensContext(itemId);
  const agentMode = resolveAgentMode();
  if (!ctx) {
    return {
      status: "missing",
      analysis: null,
      jobId: null,
      agentMode,
      currentFingerprint: null,
    };
  }
  const active = findActiveLensJob(itemId);
  const row = getLensAnalysis(itemId);
  const status = resolveAnalysisTopStatus({
    activeJobId: active?.id ?? null,
    row,
    currentFingerprint: ctx.fingerprint,
  });
  return {
    status,
    analysis: row,
    jobId: active?.id ?? null,
    agentMode,
    currentFingerprint: ctx.fingerprint,
  };
}

export type StartAnalyzeResult =
  | {
      ok: true;
      status: LensAnalysisTopStatus;
      jobId: number | null;
      analysis: LensAnalysisRowView | null;
      started: boolean;
    }
  | { ok: false; error: string; code: number };

/**
 * Start or return analysis for a holding.
 * Local may complete inline; xAI uses async lens_analyze job.
 */
export async function startLensAnalyze(
  itemId: number,
  opts?: { force?: boolean },
): Promise<StartAnalyzeResult> {
  if (!lensAnalyzeEnabled()) {
    return {
      ok: false,
      error: "Deep Lens analysis is disabled (NON_OS_LENS_ANALYZE=0).",
      code: 503,
    };
  }

  const id = Math.floor(Number(itemId));
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "itemId must be a positive integer", code: 400 };
  }

  const ctx = gatherLensContext(id);
  if (!ctx) {
    return { ok: false, error: `No holding with id ${id}`, code: 404 };
  }

  const force = Boolean(opts?.force);
  const state = getLensAnalysisState(id);

  if (state.status === "running" && state.jobId != null) {
    return {
      ok: true,
      status: "running",
      jobId: state.jobId,
      analysis: state.analysis,
      started: false,
    };
  }

  if (state.status === "fresh" && !force) {
    return {
      ok: true,
      status: "fresh",
      jobId: null,
      analysis: state.analysis,
      started: false,
    };
  }

  if (!force && !canStartAnalyzeWithoutForce(state.status)) {
    return {
      ok: true,
      status: state.status,
      jobId: state.jobId,
      analysis: state.analysis,
      started: false,
    };
  }

  const mode = resolveAgentMode();

  // Local: inline fast path
  if (mode === "local") {
    const dossier = buildLocalDossier(ctx);
    if (isReindexRunning()) {
      dossier.caveats.push(
        "Reindex in progress; dossier may go stale soon.",
      );
    }
    const analysis = upsertLensAnalysis({
      itemId: id,
      contentHash: ctx.contentHash,
      fingerprint: ctx.fingerprint,
      mode: "local",
      model: "local",
      status: "completed",
      payload: dossier,
      error: null,
    });
    return {
      ok: true,
      status: "fresh",
      jobId: null,
      analysis,
      started: true,
    };
  }

  // xAI: async job
  const job = createJob({
    kind: "lens_analyze",
    label: `Deep Lens · ${ctx.title.slice(0, 80)}`,
  });
  updateJobProgress(
    job.id,
    {
      stage: "queued",
      percent: 0,
      detail: `item ${id}`,
      itemId: id,
    },
    { force: true },
  );
  seedJobResult(job.id, { itemId: id });

  void runHelixJob(job.id, async (report) => {
    report({ stage: "gather", percent: 15, detail: "Gathering context…" });
    const live = gatherLensContext(id);
    if (!live) throw new Error("Holding disappeared during analysis");

    report({
      stage: "model",
      percent: 40,
      detail:
        live.item.kind === "image" || live.item.kind === "video"
          ? "Looking at stills…"
          : "Running analysis…",
    });
    const { dossier, model, usedXai } = await runXaiDossier(live);
    if (isReindexRunning()) {
      dossier.caveats.push(
        "Reindex in progress; dossier may go stale soon.",
      );
    }

    report({ stage: "persist", percent: 85, detail: "Saving dossier…" });
    const row = upsertLensAnalysis({
      itemId: id,
      contentHash: live.contentHash,
      fingerprint: live.fingerprint,
      mode: usedXai ? "xai" : "local",
      model,
      status: "completed",
      payload: dossier,
      error: null,
    });

    return {
      itemId: id,
      analysisId: row.id,
      contentHash: live.contentHash,
      fingerprint: live.fingerprint,
      mode: usedXai ? "xai" : "local",
    };
  });

  return {
    ok: true,
    status: "running",
    jobId: job.id,
    analysis: state.analysis,
    started: true,
  };
}

export type { HelixJob };
