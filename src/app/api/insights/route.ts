import { NextResponse } from "next/server";
import {
  createInsight,
  listInsightsByItem,
} from "@/lib/lens/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/insights?itemId=N — list insights for a holding. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("itemId");
    const itemId = raw != null ? Number(raw) : NaN;
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json(
        { ok: false, error: "itemId query param is required" },
        { status: 400 },
      );
    }
    const items = listInsightsByItem(Math.floor(itemId));
    return NextResponse.json({ ok: true, insights: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST /api/insights — create an insight for a holding. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      itemId?: number;
      quoteText?: string;
      body?: string | null;
      source?: string | null;
      startOffset?: number | null;
      endOffset?: number | null;
    };

    if (body.itemId == null || body.quoteText == null) {
      return NextResponse.json(
        { ok: false, error: "itemId and quoteText are required" },
        { status: 400 },
      );
    }

    const insight = createInsight({
      itemId: body.itemId,
      quoteText: body.quoteText,
      body: body.body,
      source: body.source ?? "manual",
      startOffset: body.startOffset,
      endOffset: body.endOffset,
    });

    return NextResponse.json({ ok: true, insight }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /No holding|quoteText|itemId/.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
