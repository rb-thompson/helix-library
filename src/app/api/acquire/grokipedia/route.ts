import { NextResponse } from "next/server";
import { acquireGrokipedia } from "@/lib/acquire/grokipedia";
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
    const body = (await req.json()) as { titleOrSlug?: string; slug?: string };
    const titleOrSlug = (body.titleOrSlug ?? body.slug)?.trim();
    if (!titleOrSlug) {
      return NextResponse.json(
        { ok: false, error: "titleOrSlug is required" },
        { status: 400 },
      );
    }

    if (isAcquireBusy("grokipedia")) {
      return NextResponse.json(
        {
          ok: false,
          error: "A Grokipedia acquire is already running. Wait for it.",
        },
        { status: 409 },
      );
    }

    const job = createAcquireJob("grokipedia", titleOrSlug.slice(0, 100));
    void runAcquireJob(job, async (report) => {
      const result = await acquireGrokipedia(titleOrSlug, report, {
        jobId: job.id,
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
