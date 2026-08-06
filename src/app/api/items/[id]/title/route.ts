import { NextResponse } from "next/server";
import { getItemById, setItemCatalogTitle } from "@/lib/catalog/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH body: { title: string } — set display title (title_source=manual).
 * Empty title resets to filename.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id: raw } = await ctx.params;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid item id" },
        { status: 400 },
      );
    }
    const item = getItemById(id);
    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Item not found" },
        { status: 404 },
      );
    }
    const body = (await req.json()) as { title?: string };
    const title = (body.title ?? "").trim();
    if (!title) {
      setItemCatalogTitle(id, item.name, "filename");
      return NextResponse.json({
        ok: true,
        title: item.name,
        titleSource: "filename",
      });
    }
    if (title.length > 500) {
      return NextResponse.json(
        { ok: false, error: "Title too long (max 500)" },
        { status: 400 },
      );
    }
    setItemCatalogTitle(id, title, "manual");
    return NextResponse.json({
      ok: true,
      title,
      titleSource: "manual",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
