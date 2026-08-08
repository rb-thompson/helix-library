import { NextResponse } from "next/server";
import { acquireImageUrl } from "@/lib/acquire/image-url";
import {
  createAcquireJob,
  isAcquireBusy,
  runAcquireJob,
  serializeAcquireJob,
} from "@/lib/acquire/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: string;
      filenameHint?: string;
    };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 },
      );
    }

    if (isAcquireBusy("image_url")) {
      return NextResponse.json(
        {
          ok: false,
          error: "An image URL download is already running. Wait for it.",
        },
        { status: 409 },
      );
    }

    const job = createAcquireJob("image_url", url.slice(0, 100));
    void runAcquireJob(job, async (report) => {
      const result = await acquireImageUrl(url, report, {
        jobId: job.id,
        filenameHint: body.filenameHint,
      });
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
