import { NextResponse } from "next/server";
import { addTagToItem, removeTagFromItem } from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    const itemId = Number(idStr);
    const body = (await req.json()) as { name?: string };
    if (!body.name) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }
    addTagToItem(itemId, body.name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    const itemId = Number(idStr);
    const body = (await req.json()) as { tagId?: number };
    if (!body.tagId) {
      return NextResponse.json(
        { ok: false, error: "tagId is required" },
        { status: 400 },
      );
    }
    removeTagFromItem(itemId, body.tagId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
