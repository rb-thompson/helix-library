import { NextResponse } from "next/server";
import {
  assertRestoreHttpCaller,
  restoreHttpFailure,
} from "@/lib/backup/http";
import { clearRestoreSession } from "@/lib/backup/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/restore/session — drop the confirm token. */
export async function DELETE(req: Request) {
  try {
    assertRestoreHttpCaller(req);
    clearRestoreSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = restoreHttpFailure(err);
    return NextResponse.json(body, { status });
  }
}
