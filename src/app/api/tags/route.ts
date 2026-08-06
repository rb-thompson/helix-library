import { NextResponse } from "next/server";
import {
  deleteTags,
  listTags,
  renameTag,
} from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List tags with usage counts + source stats (for hygiene UI). */
export async function GET() {
  const tags = listTags({ sortBy: "count" });
  return NextResponse.json({ ok: true, tags });
}

/**
 * PATCH body: { id: number, name: string, mergeIfExists?: boolean }
 * Rename a tag (optional merge when name already exists).
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: number;
      name?: string;
      mergeIfExists?: boolean;
    };
    if (!body?.id || !body?.name?.trim()) {
      return NextResponse.json(
        { ok: false, error: "id and name are required" },
        { status: 400 },
      );
    }
    const result = renameTag(Number(body.id), body.name, {
      mergeIfExists: Boolean(body.mergeIfExists),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
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
