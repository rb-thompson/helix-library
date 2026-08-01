import { NextResponse } from "next/server";
import { createCollection, listCollections } from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, collections: listCollections() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string;
    };
    if (!body.name) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }
    const id = createCollection(body.name, body.description);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
