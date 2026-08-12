import { NextResponse } from "next/server";
import { acquireOpenAlexPdf } from "@/lib/acquire/openalex";
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
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      idOrDoi?: string;
      workId?: string;
      locationId?: number;
    };
    const idOrDoi = (body.idOrDoi ?? body.workId)?.trim();
    if (!idOrDoi) {
      return NextResponse.json(
        { ok: false, error: "idOrDoi is required (DOI or OpenAlex W… id)" },
        { status: 400 },
      );
    }

    if (isAcquireBusy("openalex")) {
      return NextResponse.json(
        {
          ok: false,
          error: "An OpenAlex download is already running. Wait for it.",
        },
        { status: 409 },
      );
    }

    const locationId = parseLocationIdBody(body);
    const archiveRoot = resolveArchiveRootFromLocationId(locationId);

    const job = createAcquireJob("openalex", idOrDoi.slice(0, 100));
    void runAcquireJob(job, async (report) => {
      const result = await runWithArchiveRootAsync(archiveRoot, () =>
        acquireOpenAlexPdf(idOrDoi, report, {
          jobId: job.id,
        }),
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
