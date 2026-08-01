import { NextResponse } from "next/server";
import { addLocation } from "@/lib/locations/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      root?: string;
      enabled?: boolean;
    };
    if (!body.name || !body.root) {
      return NextResponse.json(
        { ok: false, error: "name and root are required" },
        { status: 400 },
      );
    }
    const result = addLocation({
      name: body.name,
      root: body.root,
      enabled: body.enabled,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
