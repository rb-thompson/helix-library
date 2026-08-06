import { NextResponse } from "next/server";
import { purgeMissingItems } from "@/lib/catalog/weed";
import {
  addItemsToCollection,
  addTagToItems,
} from "@/lib/collections/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkBody =
  | {
      action: "add_to_collection";
      itemIds: number[];
      collectionId: number;
    }
  | {
      action: "add_tag";
      itemIds: number[];
      tagName: string;
    }
  | {
      /** Remove missing holdings from catalog only (never deletes files). */
      action: "purge_missing";
      itemIds: number[];
    };

/**
 * Batch curation mutations (catalog multi-select / librarian approve).
 * Never mutates files on disk — only catalog shelves, tags, and missing-row purge.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BulkBody;
    if (!body?.action || !Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "action and itemIds[] are required" },
        { status: 400 },
      );
    }
    if (body.itemIds.length > 200) {
      return NextResponse.json(
        { ok: false, error: "At most 200 items per batch" },
        { status: 400 },
      );
    }

    if (body.action === "add_to_collection") {
      if (!body.collectionId) {
        return NextResponse.json(
          { ok: false, error: "collectionId is required" },
          { status: 400 },
        );
      }
      const result = addItemsToCollection(body.collectionId, body.itemIds);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "add_tag") {
      if (!body.tagName?.trim()) {
        return NextResponse.json(
          { ok: false, error: "tagName is required" },
          { status: 400 },
        );
      }
      const result = addTagToItems(body.itemIds, body.tagName);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "purge_missing") {
      const result = purgeMissingItems(body.itemIds);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action" },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
