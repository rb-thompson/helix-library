import { NextResponse } from "next/server";
import {
  getJobById,
  getLatestJob,
  serializeJob,
  startReindexAsync,
} from "@/lib/indexer/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a reindex in the background; poll GET for status. */
export async function POST() {
  try {
    const { jobId, alreadyRunning } = startReindexAsync();
    const job = getJobById(jobId);
    return NextResponse.json({
      ok: true,
      jobId,
      alreadyRunning,
      job: job ? serializeJob(job) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Latest job (or ?id=) for polling. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id");
    const job = idParam
      ? getJobById(Number(idParam))
      : getLatestJob();
    if (!job) {
      return NextResponse.json({ ok: true, job: null });
    }
    return NextResponse.json({ ok: true, job: serializeJob(job) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
