import { desc, eq } from "drizzle-orm";
import { getItemById } from "@/lib/catalog/query";
import { getDb } from "@/lib/db/client";
import { insights } from "@/lib/db/schema";

export const INSIGHT_QUOTE_MAX = 4000;
export const INSIGHT_BODY_MAX = 8000;

export type Insight = {
  id: number;
  itemId: number;
  quoteText: string;
  body: string | null;
  source: string | null;
  startOffset: number | null;
  endOffset: number | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateInsightInput = {
  itemId: number;
  quoteText: string;
  body?: string | null;
  source?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
};

function stripControls(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
}

function cleanQuote(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return stripControls(raw).trim().replace(/\s+/g, " ").slice(0, INSIGHT_QUOTE_MAX);
}

function cleanBody(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const t = stripControls(raw).trim().slice(0, INSIGHT_BODY_MAX);
  return t || null;
}

function cleanSource(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const t = stripControls(raw).trim().slice(0, 64);
  return t || null;
}

function mapRow(row: {
  id: number;
  itemId: number;
  quoteText: string;
  body: string | null;
  source: string | null;
  startOffset: number | null;
  endOffset: number | null;
  createdAt: number;
  updatedAt: number;
}): Insight {
  return {
    id: row.id,
    itemId: row.itemId,
    quoteText: row.quoteText,
    body: row.body,
    source: row.source,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Create a durable insight bound to a catalog holding.
 * Throws if item id is invalid or quote is empty.
 */
export function createInsight(input: CreateInsightInput): Insight {
  const itemId = Math.floor(Number(input.itemId));
  if (!Number.isFinite(itemId) || itemId <= 0) {
    throw new Error("itemId must be a positive integer");
  }
  const item = getItemById(itemId);
  if (!item) {
    throw new Error(`No holding with id ${itemId}`);
  }

  const quoteText = cleanQuote(input.quoteText);
  if (!quoteText) {
    throw new Error("quoteText is required");
  }

  const body = cleanBody(input.body ?? null);
  const source = cleanSource(input.source ?? "manual");
  const now = Date.now();

  let startOffset: number | null = null;
  let endOffset: number | null = null;
  if (
    input.startOffset != null &&
    Number.isFinite(input.startOffset) &&
    input.endOffset != null &&
    Number.isFinite(input.endOffset)
  ) {
    startOffset = Math.max(0, Math.floor(input.startOffset));
    endOffset = Math.max(startOffset, Math.floor(input.endOffset));
  }

  const db = getDb();
  const inserted = db
    .insert(insights)
    .values({
      itemId,
      quoteText,
      body,
      source,
      startOffset,
      endOffset,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return mapRow(inserted);
}

/** List insights for a holding, newest first. */
export function listInsightsByItem(itemId: number): Insight[] {
  const id = Math.floor(Number(itemId));
  if (!Number.isFinite(id) || id <= 0) return [];

  const db = getDb();
  const rows = db
    .select()
    .from(insights)
    .where(eq(insights.itemId, id))
    .orderBy(desc(insights.createdAt), desc(insights.id))
    .all();

  return rows.map(mapRow);
}

export function getInsight(id: number): Insight | null {
  const n = Math.floor(Number(id));
  if (!Number.isFinite(n) || n <= 0) return null;
  const db = getDb();
  const row = db.select().from(insights).where(eq(insights.id, n)).get();
  return row ? mapRow(row) : null;
}

export function deleteInsight(id: number): boolean {
  const n = Math.floor(Number(id));
  if (!Number.isFinite(n) || n <= 0) return false;
  const db = getDb();
  const result = db.delete(insights).where(eq(insights.id, n)).run();
  return (result.changes ?? 0) > 0;
}
