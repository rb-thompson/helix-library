import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { parseShotBody, SHOT_TAGS, shotFilename } from "@/lib/arcade/night-moth";
import { indexAfterAcquire } from "@/lib/acquire/index-after";
import { safeArchivePath } from "@/lib/acquire/paths";
import { addTagToItem } from "@/lib/collections/manage";
import { assertCatalogWritable } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertCatalogWritable();
    const body = (await req.json()) as unknown;
    const shot = parseShotBody(body);
    const filename = shotFilename(shot.region, shot.night, shot.ext);
    const dest = safeArchivePath("images", filename);
    await writeFile(dest, shot.bytes);
    const indexed = await indexAfterAcquire(dest);
    const tags = [...SHOT_TAGS, shot.region];
    if (indexed.itemId != null) {
      for (const tag of tags) {
        addTagToItem(indexed.itemId, tag, "manual");
      }
    }
    return NextResponse.json({
      ok: true,
      itemId: indexed.itemId,
      relPath: `images/${filename}`,
      tags,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
