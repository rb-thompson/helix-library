import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json(
      { ok: false, error: "Invalid job id" },
      { status: 400 },
    );
  }
  const job = getJob(n);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Job not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, job });
}
