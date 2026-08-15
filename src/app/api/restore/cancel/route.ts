import { NextResponse } from "next/server";
import {
  assertRestoreHttpCaller,
  RestoreHttpError,
  restoreHttpFailure,
} from "@/lib/backup/http";
import {
  isRestoreStageCancellable,
  readRestoreProgress,
  requestRestoreCancel,
} from "@/lib/backup/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/restore/cancel — best-effort before BEGIN IMMEDIATE. */
export async function POST(req: Request) {
  try {
    assertRestoreHttpCaller(req);
    const sidecar = readRestoreProgress();
    if (!sidecar) {
      throw new RestoreHttpError("No restore progress sidecar", 404);
    }
    if (
      sidecar.status === "completed" ||
      sidecar.status === "failed" ||
      sidecar.status === "cancelled" ||
      !isRestoreStageCancellable(sidecar.progress.stage)
    ) {
      throw new RestoreHttpError("too late to cancel.", 409);
    }
    requestRestoreCancel();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = restoreHttpFailure(err);
    return NextResponse.json(body, { status });
  }
}
