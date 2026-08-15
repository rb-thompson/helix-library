import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { lensAnalyses } from "@/lib/db/schema";
import {
  parseLensDossier,
  type LensAnalysisRowView,
  type LensDossierV1,
} from "@/lib/lens/dossier";

export type UpsertLensAnalysisInput = {
  itemId: number;
  contentHash: string | null;
  fingerprint: string;
  mode: "local" | "xai";
  model: string | null;
  status: "completed" | "failed";
  payload: LensDossierV1 | null;
  error?: string | null;
};

function mapRow(row: {
  id: number;
  itemId: number;
  contentHash: string | null;
  fingerprint: string;
  mode: string;
  model: string | null;
  status: string;
  payloadJson: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}): LensAnalysisRowView {
  let payload: LensDossierV1 | null = null;
  if (row.payloadJson) {
    try {
      payload = parseLensDossier(JSON.parse(row.payloadJson));
    } catch {
      payload = null;
    }
  }
  const status: "completed" | "failed" =
    row.status === "failed" ? "failed" : "completed";
  return {
    id: row.id,
    itemId: row.itemId,
    contentHash: row.contentHash,
    fingerprint: row.fingerprint,
    mode: row.mode,
    model: row.model,
    status,
    payload: status === "completed" ? payload : payload,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getLensAnalysis(itemId: number): LensAnalysisRowView | null {
  const id = Math.floor(Number(itemId));
  if (!Number.isFinite(id) || id <= 0) return null;
  const db = getDb();
  const row = db
    .select()
    .from(lensAnalyses)
    .where(eq(lensAnalyses.itemId, id))
    .get();
  return row ? mapRow(row) : null;
}

export function upsertLensAnalysis(
  input: UpsertLensAnalysisInput,
): LensAnalysisRowView {
  const itemId = Math.floor(Number(input.itemId));
  if (!Number.isFinite(itemId) || itemId <= 0) {
    throw new Error("itemId must be a positive integer");
  }
  if (!input.fingerprint?.trim()) {
    throw new Error("fingerprint is required");
  }

  const now = Date.now();
  const payloadJson =
    input.payload != null ? JSON.stringify(input.payload) : null;

  const db = getDb();
  const existing = db
    .select()
    .from(lensAnalyses)
    .where(eq(lensAnalyses.itemId, itemId))
    .get();

  if (existing) {
    db.update(lensAnalyses)
      .set({
        contentHash: input.contentHash,
        fingerprint: input.fingerprint,
        mode: input.mode,
        model: input.model,
        status: input.status,
        payloadJson,
        error: input.error ?? null,
        schemaVersion: 1,
        updatedAt: now,
      })
      .where(eq(lensAnalyses.itemId, itemId))
      .run();
  } else {
    db.insert(lensAnalyses)
      .values({
        itemId,
        contentHash: input.contentHash,
        fingerprint: input.fingerprint,
        mode: input.mode,
        model: input.model,
        status: input.status,
        payloadJson,
        error: input.error ?? null,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const row = getLensAnalysis(itemId);
  if (!row) throw new Error("Failed to upsert lens analysis");
  return row;
}

export function deleteLensAnalysis(itemId: number): boolean {
  const id = Math.floor(Number(itemId));
  if (!Number.isFinite(id) || id <= 0) return false;
  const db = getDb();
  const result = db
    .delete(lensAnalyses)
    .where(eq(lensAnalyses.itemId, id))
    .run();
  return (result.changes ?? 0) > 0;
}
