import { NextResponse } from "next/server";
import { acquireWebClip } from "@/lib/acquire/clip";
import {
  createAcquireJob,
  isAcquireBusy,
  runAcquireJob,
  serializeAcquireJob,
} from "@/lib/acquire/jobs";
import {
  parseLocationIdBody,
  resolveArchiveRootFromLocationId,
  runWithArchiveRootAsync,
} from "@/lib/acquire/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; locationId?: number };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 },
      );
    }

    if (isAcquireBusy("clip")) {
      return NextResponse.json(
        {
          ok: false,
          error: "A web clip is already running. Wait for it.",
        },
        { status: 409 },
      );
    }

    const locationId = parseLocationIdBody(body);
    const archiveRoot = resolveArchiveRootFromLocationId(locationId);

    const job = createAcquireJob("clip", url.slice(0, 100));
    void runAcquireJob(job, async (report) => {
      const result = await runWithArchiveRootAsync(archiveRoot, () =>
        acquireWebClip(url, report, { jobId: job.id }),
      );
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
