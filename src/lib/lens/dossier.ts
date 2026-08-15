/**
 * Versioned Deep Lens dossier payload (machine analysis only — not human insights).
 */

export type LensDossierSources = {
  usedItemText: boolean;
  itemTextChars: number;
  truncated: boolean;
  usedVision: boolean;
  usedMetadataOnly: boolean;
  contentHashMissing: boolean;
};

export type LensDossierV1 = {
  schemaVersion: 1;
  summary: string;
  keyPoints: string[];
  themes: string[];
  entities: Array<{ name: string; kind?: string }>;
  contentFacts: Array<{ label: string; value: string }>;
  suggestedTags: string[];
  suggestedCollections: string[];
  caveats: string[];
  sources: LensDossierSources;
};

export const DOSSIER_SUMMARY_MAX = 2_000;
export const DOSSIER_KEYPOINT_MAX = 400;
export const DOSSIER_KEYPOINTS_MAX = 12;
export const DOSSIER_THEME_MAX = 64;
export const DOSSIER_THEMES_MAX = 16;
export const DOSSIER_ENTITIES_MAX = 24;
export const DOSSIER_FACTS_MAX = 20;
export const DOSSIER_TAGS_MAX = 12;
export const DOSSIER_COLLECTIONS_MAX = 6;
export const DOSSIER_CAVEAT_MAX = 240;
export const DOSSIER_CAVEATS_MAX = 8;
export const DOSSIER_PAYLOAD_JSON_MAX = 48 * 1024;

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function stringList(
  raw: unknown,
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const c = clip(x, maxLen);
    if (!c) continue;
    out.push(c);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Validate and clamp a dossier payload. Returns null if unusable.
 */
export function parseLensDossier(raw: unknown): LensDossierV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1) return null;
  if (typeof o.summary !== "string") return null;

  const sourcesRaw =
    o.sources && typeof o.sources === "object" && !Array.isArray(o.sources)
      ? (o.sources as Record<string, unknown>)
      : {};

  const sources: LensDossierSources = {
    usedItemText: Boolean(sourcesRaw.usedItemText),
    itemTextChars: Math.max(0, Number(sourcesRaw.itemTextChars) || 0),
    truncated: Boolean(sourcesRaw.truncated),
    usedVision: Boolean(sourcesRaw.usedVision),
    usedMetadataOnly: Boolean(sourcesRaw.usedMetadataOnly),
    contentHashMissing: Boolean(sourcesRaw.contentHashMissing),
  };

  const entities: LensDossierV1["entities"] = [];
  if (Array.isArray(o.entities)) {
    for (const e of o.entities) {
      if (!e || typeof e !== "object") continue;
      const er = e as Record<string, unknown>;
      if (typeof er.name !== "string") continue;
      const name = clip(er.name, 120);
      if (!name) continue;
      entities.push({
        name,
        kind:
          typeof er.kind === "string" ? clip(er.kind, 32) || undefined : undefined,
      });
      if (entities.length >= DOSSIER_ENTITIES_MAX) break;
    }
  }

  const contentFacts: LensDossierV1["contentFacts"] = [];
  if (Array.isArray(o.contentFacts)) {
    for (const f of o.contentFacts) {
      if (!f || typeof f !== "object") continue;
      const fr = f as Record<string, unknown>;
      if (typeof fr.label !== "string" || typeof fr.value !== "string") continue;
      const label = clip(fr.label, 64);
      const value = clip(fr.value, 200);
      if (!label || !value) continue;
      contentFacts.push({ label, value });
      if (contentFacts.length >= DOSSIER_FACTS_MAX) break;
    }
  }

  const dossier: LensDossierV1 = {
    schemaVersion: 1,
    summary: clip(o.summary, DOSSIER_SUMMARY_MAX) || "No summary.",
    keyPoints: stringList(o.keyPoints, DOSSIER_KEYPOINTS_MAX, DOSSIER_KEYPOINT_MAX),
    themes: stringList(o.themes, DOSSIER_THEMES_MAX, DOSSIER_THEME_MAX),
    entities,
    contentFacts,
    suggestedTags: stringList(o.suggestedTags, DOSSIER_TAGS_MAX, 64),
    suggestedCollections: stringList(
      o.suggestedCollections,
      DOSSIER_COLLECTIONS_MAX,
      80,
    ),
    caveats: stringList(o.caveats, DOSSIER_CAVEATS_MAX, DOSSIER_CAVEAT_MAX),
    sources,
  };

  try {
    const json = JSON.stringify(dossier);
    if (json.length > DOSSIER_PAYLOAD_JSON_MAX) return null;
  } catch {
    return null;
  }

  return dossier;
}

export function lensFingerprint(item: {
  contentHash: string | null;
  mtimeMs: number;
  sizeBytes: number;
}): string {
  if (item.contentHash && item.contentHash.length > 0) return item.contentHash;
  return `mtime:${item.mtimeMs}:size:${item.sizeBytes}`;
}

export type LensAnalysisTopStatus =
  | "fresh"
  | "stale"
  | "missing"
  | "running"
  | "failed";

export type LensAnalysisRowView = {
  id: number;
  itemId: number;
  contentHash: string | null;
  fingerprint: string;
  mode: string;
  model: string | null;
  status: "completed" | "failed";
  payload: LensDossierV1 | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

/**
 * Resolve top-level analysis status for GET (design precedence order).
 */
export function resolveAnalysisTopStatus(opts: {
  activeJobId: number | null;
  row: LensAnalysisRowView | null;
  currentFingerprint: string;
}): LensAnalysisTopStatus {
  if (opts.activeJobId != null) return "running";
  if (!opts.row) return "missing";
  if (opts.row.fingerprint !== opts.currentFingerprint) return "stale";
  if (opts.row.status === "failed") return "failed";
  if (opts.row.status === "completed" && opts.row.payload) return "fresh";
  // completed but corrupt payload
  return "failed";
}

/** Whether POST may start analyze without force. */
export function canStartAnalyzeWithoutForce(
  status: LensAnalysisTopStatus,
): boolean {
  return (
    status === "missing" ||
    status === "failed" ||
    status === "stale"
  );
}
