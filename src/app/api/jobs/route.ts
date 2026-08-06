import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs/store";
import { isHelixJobKind, type HelixJobKind } from "@/lib/jobs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/jobs?limit=20&kind=arxiv */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") || 20) || 20),
  );
  const kindParam = url.searchParams.get("kind");
  const kinds: HelixJobKind[] | undefined = kindParam
    ? kindParam
        .split(",")
        .map((k) => k.trim())
        .filter(isHelixJobKind)
    : undefined;

  const jobs = listJobs({ limit, kinds: kinds?.length ? kinds : undefined });
  return NextResponse.json({ ok: true, jobs });
}
