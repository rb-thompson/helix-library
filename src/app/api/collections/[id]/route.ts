import { NextResponse } from "next/server";
import {
  deleteCollection,
  updateCollection,
  type SmartShelfQuery,
} from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    const body = (await req.json()) as {
      name?: string;
      description?: string | null;
      query?: SmartShelfQuery | null;
    };
    updateCollection(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id: idStr } = await ctx.params;
    deleteCollection(Number(idStr));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
