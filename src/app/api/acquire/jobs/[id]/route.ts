import { NextResponse } from "next/server";
import { getAcquireJob, serializeAcquireJob } from "@/lib/acquire/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = getAcquireJob(id);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Job not found (may have been lost on server restart)" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, job: serializeAcquireJob(job) });
}
