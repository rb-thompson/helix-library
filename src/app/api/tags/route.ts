import { NextResponse } from "next/server";
import { deleteTags, listTags } from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List tags with usage counts (for hygiene UI). */
export async function GET() {
  const tags = listTags({ sortBy: "count" });
  return NextResponse.json({ ok: true, tags });
}

/**
 * DELETE body: { ids: number[] }
 * Removes tags and their item_tags links. Does not touch files.
 */
export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { ids?: number[] };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "ids[] is required" },
        { status: 400 },
      );
    }
    if (body.ids.length > 100) {
      return NextResponse.json(
        { ok: false, error: "At most 100 tags per request" },
        { status: 400 },
      );
    }
    const result = deleteTags(body.ids);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
