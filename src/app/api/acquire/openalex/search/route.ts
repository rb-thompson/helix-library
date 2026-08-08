import { NextResponse } from "next/server";
import { searchOpenAlex } from "@/lib/acquire/openalex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const max = Number(searchParams.get("max") ?? 10);
    if (!q) {
      return NextResponse.json(
        { ok: false, error: "q is required" },
        { status: 400 },
      );
    }
    const result = await searchOpenAlex(q, {
      max: Number.isFinite(max) ? max : 10,
    });
    return NextResponse.json({
      ok: true,
      total: result.total,
      hits: result.hits,
      query: result.query,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
