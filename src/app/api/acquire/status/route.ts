import { NextResponse } from "next/server";
import { acquireCapabilities } from "@/lib/acquire/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Capability chips only — intentionally does not list jobs here.
 * (Listing jobs pulled the full jobs/indexer graph into the status path;
 * Services/header already poll /api/jobs.)
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ...acquireCapabilities(),
  });
}
