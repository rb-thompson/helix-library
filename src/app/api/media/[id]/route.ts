import { NextResponse } from "next/server";
import {
  contentTypeFor,
  openFileRangeStream,
  openFileStream,
  parseRange,
  resolveMediaItem,
} from "@/lib/media/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const resolved = resolveMediaItem(id);
  if (!resolved) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { item, absPath, size } = resolved;
  const contentType = contentTypeFor(item);
  const range = parseRange(req.headers.get("range"), size);

  const url = new URL(req.url);
  const asDownload = url.searchParams.get("download") === "1";
  const safeName = item.name.replace(/"/g, "");
  const contentDisposition = asDownload
    ? `attachment; filename="${safeName}"`
    : `inline; filename="${safeName}"`;

  if (range) {
    const { start, end } = range;
    const chunkSize = end - start + 1;
    return new NextResponse(openFileRangeStream(absPath, start, end), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": contentDisposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return new NextResponse(openFileStream(absPath), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
