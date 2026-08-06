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
  const contentDisposition = contentDispositionFor(
    item.name,
    asDownload ? "attachment" : "inline",
  );

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

/**
 * HTTP headers must be ByteString (0–255). yt-dlp titles often include
 * fullwidth/Unicode (｜ ⧸ …) which crash NextResponse if put in filename=.
 * Use ASCII fallback + RFC 5987 filename*.
 */
function contentDispositionFor(
  name: string,
  disposition: "inline" | "attachment",
): string {
  const raw = name.replace(/[\r\n"]/g, "_") || "file";
  const ascii = raw
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 180);
  const fallback = ascii || "file";
  const encoded = encodeURIComponent(raw)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
