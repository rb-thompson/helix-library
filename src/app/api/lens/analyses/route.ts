import { NextResponse } from "next/server";
import { deleteLensAnalysis } from "@/lib/lens/analyses";
import {
  getLensAnalysisState,
  lensAnalyzeEnabled,
  startLensAnalyze,
} from "@/lib/lens/run-analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/lens/analyses?itemId=N */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("itemId");
    const itemId = raw != null ? Number(raw) : NaN;
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json(
        { ok: false, error: "itemId query param is required" },
        { status: 400 },
      );
    }
    const state = getLensAnalysisState(Math.floor(itemId));
    return NextResponse.json({
      ok: true,
      status: state.status,
      analysis: state.analysis,
      jobId: state.jobId,
      agentMode: state.agentMode,
      currentFingerprint: state.currentFingerprint,
      analyzeEnabled: lensAnalyzeEnabled(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST /api/lens/analyses — start or refresh analysis. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      itemId?: number;
      force?: boolean;
    };
    if (body.itemId == null) {
      return NextResponse.json(
        { ok: false, error: "itemId is required" },
        { status: 400 },
      );
    }
    const result = await startLensAnalyze(body.itemId, {
      force: Boolean(body.force),
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.code },
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      jobId: result.jobId,
      analysis: result.analysis,
      started: result.started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** DELETE /api/lens/analyses?itemId=N — discard the cached dossier. */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("itemId");
    const itemId = raw != null ? Number(raw) : NaN;
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json(
        { ok: false, error: "itemId query param is required" },
        { status: 400 },
      );
    }
    const deleted = deleteLensAnalysis(Math.floor(itemId));
    return NextResponse.json({
      ok: true,
      deleted,
      status: "missing",
      analysis: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
