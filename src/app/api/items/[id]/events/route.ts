import { NextResponse } from "next/server";
import {
  isItemEventKind,
  recordItemEvent,
} from "@/lib/catalog/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/items/[id]/events
 * Body: { kind: "open", meta?: { source: "detail" | "room" } }
 * Validates the catalog row exists. Does not require the file on disk.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = (body as { kind?: unknown })?.kind;
  if (!isItemEventKind(kind)) {
    return NextResponse.json({ error: "Unsupported event kind" }, { status: 400 });
  }

  const source = (body as { meta?: { source?: unknown } })?.meta?.source;
  const meta: { source: "detail" | "room" } | undefined =
    source === "detail" || source === "room" ? { source } : undefined;

  const result = recordItemEvent(id, kind, meta);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.status === "ignored") {
    return NextResponse.json({ ok: true, ignored: true });
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
