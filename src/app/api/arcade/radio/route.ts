import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/catalog/query";
import { displayTitle } from "@/lib/catalog/display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type RadioStation = {
  id: number;
  title: string;
  name: string;
  durationMs: number | null;
};

export async function GET() {
  const result = searchCatalog({
    kind: "audio",
    page: 1,
    pageSize: 80,
    sort: "name",
    sortDir: "asc",
  });
  const stations: RadioStation[] = result.items.map((item) => ({
    id: item.id,
    title: displayTitle(item),
    name: item.name,
    durationMs: item.durationMs,
  }));
  return NextResponse.json({
    ok: true,
    stations,
    total: result.total,
  });
}
