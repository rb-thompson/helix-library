import { NextResponse } from "next/server";
import {
  addItemToCollection,
  removeItemFromCollection,
} from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    const collectionId = Number(idStr);
    const body = (await req.json()) as { itemId?: number };
    if (!body.itemId) {
      return NextResponse.json(
        { ok: false, error: "itemId is required" },
        { status: 400 },
      );
    }
    addItemToCollection(collectionId, body.itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    const collectionId = Number(idStr);
    const body = (await req.json()) as { itemId?: number };
    if (!body.itemId) {
      return NextResponse.json(
        { ok: false, error: "itemId is required" },
        { status: 400 },
      );
    }
    removeItemFromCollection(collectionId, body.itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
