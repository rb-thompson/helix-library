import { NextResponse } from "next/server";
import { searchArxiv } from "@/lib/acquire/arxiv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/acquire/arxiv/search?q=quantum+optics&max=10
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (!q) {
      return NextResponse.json(
        { ok: false, error: "q (keyword or topic) is required" },
        { status: 400 },
      );
    }
    const max = searchParams.get("max")
      ? Number(searchParams.get("max"))
      : 10;
    const start = searchParams.get("start")
      ? Number(searchParams.get("start"))
      : 0;

    const result = await searchArxiv(q, {
      max: Number.isFinite(max) ? max : 10,
      start: Number.isFinite(start) ? start : 0,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
