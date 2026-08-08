import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  exportArchivePath,
  parseExportFilename,
} from "@/lib/backup/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream a backup archive. Name must be a basename under data/exports/.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  try {
    const { name: raw } = await ctx.params;
    const name = parseExportFilename(decodeURIComponent(raw));
    if (!name.endsWith(".tar.gz")) {
      return NextResponse.json(
        { ok: false, error: "Only .tar.gz downloads are allowed" },
        { status: 400 },
      );
    }
    const full = exportArchivePath(name);
    if (!existsSync(full)) {
      return NextResponse.json(
        { ok: false, error: "Backup not found" },
        { status: 404 },
      );
    }
    const st = statSync(full);
    const stream = createReadStream(full);
    const web = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(web, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(st.size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
