import { NextResponse } from "next/server";
import { acquireGrokImage } from "@/lib/acquire/grok-image";
import {
  createAcquireJob,
  runAcquireJob,
  serializeAcquireJob,
  updateJobProgress,
} from "@/lib/acquire/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json(
        { ok: false, error: "prompt is required" },
        { status: 400 },
      );
    }

    const job = createAcquireJob("image", prompt.slice(0, 80));
    void runAcquireJob(job, async (report) => {
      report({
        stage: "generating",
        percent: 15,
        detail: "Calling xAI image API…",
      });
      // Soft indeterminate pulse while waiting on the API
      const pulse = setInterval(() => {
        const cur = job.progress.percent ?? 15;
        if (job.status === "running" && cur < 80) {
          updateJobProgress(job, {
            stage: "generating",
            percent: cur + 3,
            detail: "Generating image…",
          });
        }
      }, 2000);
      try {
        const result = await acquireGrokImage(prompt);
        report({
          stage: "reindexing",
          percent: 92,
          detail: "Indexing into catalog…",
        });
        return { ...result };
      } finally {
        clearInterval(pulse);
      }
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
