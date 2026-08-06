import { NextResponse } from "next/server";
import { listAcquireJobs } from "@/lib/acquire/jobs";
import { acquireCapabilities } from "@/lib/acquire/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    ...acquireCapabilities(),
    recent: listAcquireJobs(10),
  });
}
