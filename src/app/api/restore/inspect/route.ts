import { NextResponse } from "next/server";
import {
  assertRestoreHttpCaller,
  restoreHttpFailure,
} from "@/lib/backup/http";
import { inspectBackup, restoreLiveStats } from "@/lib/backup/inspect";
import { mintRestoreSession } from "@/lib/backup/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/restore/inspect — jail + preview + mint confirm token.
 * No live catalog / config / holdings writes.
 */
export async function POST(req: Request) {
  try {
    assertRestoreHttpCaller(req);
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }

    const preview = await inspectBackup(body.name);
    const session = mintRestoreSession({
      name: preview.name,
      previewHash: preview.previewHash,
    });
    return NextResponse.json({
      ok: true,
      preview,
      confirmToken: session.token,
      live: restoreLiveStats(),
    });
  } catch (err) {
    const { body, status } = restoreHttpFailure(err);
    return NextResponse.json(body, { status });
  }
}
