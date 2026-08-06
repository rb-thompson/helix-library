import { NextResponse } from "next/server";
import {
  createAcquireJob,
  isAcquireBusy,
  runAcquireJob,
  serializeAcquireJob,
} from "@/lib/acquire/jobs";
import { acquireYoutube, type YoutubeMode } from "@/lib/acquire/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Start YouTube/podcast download as a background job.
 * Returns job id immediately — poll GET /api/acquire/jobs/[id].
 * Avoids browser NetworkError from long-held HTTP connections.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: string;
      mode?: YoutubeMode;
    };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 },
      );
    }
    const mode: YoutubeMode = body.mode === "audio" ? "audio" : "video";

    if (isAcquireBusy("youtube")) {
      return NextResponse.json(
        {
          ok: false,
          error: "A YouTube/podcast download is already running. Wait for it.",
        },
        { status: 409 },
      );
    }

    const job = createAcquireJob("youtube", url.slice(0, 100));

    // Fire-and-forget: do not await (prevents proxy/browser timeout → NetworkError)
    void runAcquireJob(job, async (report) => {
      const result = await acquireYoutube(url, mode, report);
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
