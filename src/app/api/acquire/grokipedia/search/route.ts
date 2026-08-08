import { NextResponse } from "next/server";
import { searchGrokipedia } from "@/lib/acquire/grokipedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const max = Number(searchParams.get("max") ?? 12);
    if (!q) {
      return NextResponse.json(
        { ok: false, error: "q is required" },
        { status: 400 },
      );
    }
    const result = await searchGrokipedia(q, {
      max: Number.isFinite(max) ? max : 12,
    });
    return NextResponse.json({
      ok: true,
      query: result.query,
      hits: result.hits,
      total: result.hits.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
