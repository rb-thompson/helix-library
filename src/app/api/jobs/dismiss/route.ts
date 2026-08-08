import { NextResponse } from "next/server";
import {
  dismissAllFailedJobs,
  dismissJob,
  getJob,
} from "@/lib/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mark failed jobs as seen (clears home Rescue warnings).
 * Body: { id: number } | { allFailed: true }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: number;
      allFailed?: boolean;
    };

    if (body.allFailed) {
      const { count } = dismissAllFailedJobs();
      return NextResponse.json({ ok: true, count });
    }

    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "id or allFailed is required" },
        { status: 400 },
      );
    }

    const existing = getJob(id);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Job not found" },
        { status: 404 },
      );
    }

    const job = dismissJob(id);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
