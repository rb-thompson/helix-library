import { NextResponse } from "next/server";
import {
  clearThumb,
  setThumbFromUpload,
  setThumbFromVideoFrame,
} from "@/lib/media/thumb";
import { getItemById } from "@/lib/catalog/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart: field "file" (image) → custom catalog thumb
 * POST JSON: { seekSeconds?: number } → video frame at offset
 * POST JSON: { action: "regenerate" } → default ~1s poster
 * DELETE → remove thumb file
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const itemId = Number(idStr);
  if (!Number.isFinite(itemId) || !getItemById(itemId)) {
    return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 });
  }

  const ctype = req.headers.get("content-type") ?? "";

  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "file field required" },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const result = await setThumbFromUpload(itemId, buf);
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const body = (await req.json().catch(() => ({}))) as {
      seekSeconds?: number;
      action?: string;
    };

    if (body.action === "regenerate") {
      const result = setThumbFromVideoFrame(itemId, undefined);
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json({ ...result, mode: "regenerate" as const });
    }

    const seek =
      body.seekSeconds != null && Number.isFinite(Number(body.seekSeconds))
        ? Math.max(0, Number(body.seekSeconds))
        : 1;
    const result = setThumbFromVideoFrame(itemId, seek);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const itemId = Number(idStr);
  if (!Number.isFinite(itemId) || !getItemById(itemId)) {
    return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 });
  }
  const result = clearThumb(itemId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
