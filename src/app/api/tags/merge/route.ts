import { NextResponse } from "next/server";
import { mergeTags } from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST body: { sourceIds: number[], targetId?: number, targetName?: string }
 * Merges source tags into target; never touches files.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sourceIds?: number[];
      targetId?: number;
      targetName?: string;
    };
    if (!Array.isArray(body?.sourceIds) || body.sourceIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "sourceIds[] is required" },
        { status: 400 },
      );
    }
    const result = mergeTags({
      sourceTagIds: body.sourceIds,
      targetTagId: body.targetId,
      targetName: body.targetName,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
