import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { hasThumb, thumbPathForItem } from "@/lib/media/thumbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || !hasThumb(id)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const file = thumbPathForItem(id);
    const buf = await readFile(file);
    const st = await stat(file);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(st.size),
        // Short cache so custom poster edits show up after refresh
        "Cache-Control": "private, max-age=60",
        ETag: `"${st.mtimeMs}-${st.size}"`,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
