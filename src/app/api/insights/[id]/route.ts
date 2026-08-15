import { NextResponse } from "next/server";
import { deleteInsight, getInsight } from "@/lib/lens/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "invalid id" },
        { status: 400 },
      );
    }
    const insight = getInsight(Math.floor(id));
    if (!insight) {
      return NextResponse.json(
        { ok: false, error: "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, insight });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "invalid id" },
        { status: 400 },
      );
    }
    const ok = deleteInsight(Math.floor(id));
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
