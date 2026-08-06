import { NextResponse } from "next/server";
import { acquireArxivPdf } from "@/lib/acquire/arxiv";
import {
  createAcquireJob,
  runAcquireJob,
  serializeAcquireJob,
} from "@/lib/acquire/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Start arXiv PDF fetch as a job; poll for progress. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { idOrUrl?: string };
    const idOrUrl = body.idOrUrl?.trim();
    if (!idOrUrl) {
      return NextResponse.json(
        { ok: false, error: "idOrUrl is required" },
        { status: 400 },
      );
    }

    const job = createAcquireJob("arxiv", idOrUrl.slice(0, 80));
    void runAcquireJob(job, async (report) => {
      const result = await acquireArxivPdf(idOrUrl, report);
      return { ...result };
    });

    return NextResponse.json({
      ok: true,
      async: true,
      jobId: job.id,
      job: serializeAcquireJob(job),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
