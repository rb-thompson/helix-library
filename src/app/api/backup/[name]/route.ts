import { NextResponse } from "next/server";
import { deleteBackup } from "@/lib/backup/list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/backup/:name — remove a local export archive. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await ctx.params;
    deleteBackup(decodeURIComponent(name));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
