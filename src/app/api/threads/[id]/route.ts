import { NextResponse } from "next/server";
import {
  deleteThread,
  getThread,
  listMessages,
} from "@/lib/agent/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  const thread = getThread(id);
  if (!thread) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const messages = listMessages(id);
  return NextResponse.json({ ok: true, thread, messages });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  deleteThread(Number(idStr));
  return NextResponse.json({ ok: true });
}
