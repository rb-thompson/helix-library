import { NextResponse } from "next/server";
import { clampTextMax, loadItemFileText } from "@/lib/media/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/items/[id]/text?max=524288
 * Capped UTF-8 body for the text/code reading room.
 * Media route stays binary/Range only — do not overload with ?text=1.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const max = clampTextMax(url.searchParams.get("max"));

  const result = await loadItemFileText(id, max);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    text: result.text,
    truncated: result.truncated,
    byteLength: result.byteLength,
    encoding: result.encoding,
  });
}
