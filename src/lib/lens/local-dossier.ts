import { formatBytes, formatDate } from "@/lib/format";
import { normalizeTagName } from "@/lib/collections/manage";
import type { LensContext } from "@/lib/lens/context";
import type { LensDossierV1 } from "@/lib/lens/dossier";
import { isVisionKind, loadLensExifFacts } from "@/lib/lens/vision";

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "notes",
  "files",
  "docs",
  "images",
  "video",
  "audio",
  "archive",
  "documents",
]);

function parentFolder(relPath: string): string {
  const n = relPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = n.lastIndexOf("/");
  if (i <= 0) return "";
  return n.slice(0, i).split("/").pop() ?? "";
}

function extractKeyPoints(body: string | null): string[] {
  if (!body) return [];
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && l.length < 200);
  const points: string[] = [];
  for (const line of lines) {
    // Headings or short bullets
    if (
      /^#{1,3}\s+/.test(line) ||
      /^[-*•]\s+/.test(line) ||
      /^[A-Z][^.!?]{10,80}[.!?]?$/.test(line)
    ) {
      const cleaned = line.replace(/^#{1,3}\s+/, "").replace(/^[-*•]\s+/, "");
      if (cleaned && !points.includes(cleaned)) points.push(cleaned);
    }
    if (points.length >= 5) break;
  }
  if (points.length === 0) {
    // Fall back to first non-empty paragraphs
    const paras = body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 20);
    for (const p of paras.slice(0, 3)) {
      points.push(p.length > 280 ? `${p.slice(0, 279)}…` : p);
    }
  }
  return points.slice(0, 5);
}

function sentenceTrim(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const last = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (last > max * 0.4) return slice.slice(0, last + 1).trim();
  return `${slice.trim()}…`;
}

/**
 * Extractive local dossier — never invents unread body text.
 * entities always [].
 */
export function buildLocalDossier(ctx: LensContext): LensDossierV1 {
  const { item, title, body, bodyTruncated, tags, collectionNames } = ctx;
  const folder = parentFolder(item.relPath);
  const contentHashMissing = !item.contentHash;

  let summary: string;
  if (body) {
    summary = sentenceTrim(body, 400);
  } else {
    summary = `No indexed text; metadata-only dossier for ${title} (${item.kind}).`;
  }

  const keyPoints = extractKeyPoints(body);
  if (keyPoints.length === 0) {
    keyPoints.push(
      `Kind: ${item.kind}`,
      `Size: ${formatBytes(item.sizeBytes)}`,
    );
    if (item.mime) keyPoints.push(`MIME: ${item.mime}`);
    if (item.durationMs != null) {
      keyPoints.push(`Duration: ${(item.durationMs / 1000).toFixed(1)}s`);
    }
    if (item.width != null && item.height != null) {
      keyPoints.push(`Dimensions: ${item.width}×${item.height}`);
    }
  }

  const themes = [item.kind, item.ext ?? "", folder]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 8);

  const contentFacts: LensDossierV1["contentFacts"] = [
    { label: "Kind", value: item.kind },
    { label: "Size", value: formatBytes(item.sizeBytes) },
    { label: "Location", value: item.locationName },
    { label: "Path", value: item.relPath },
    { label: "Indexed", value: formatDate(item.indexedAt) },
  ];
  if (item.mime) contentFacts.push({ label: "MIME", value: item.mime });
  if (item.ext) contentFacts.push({ label: "Extension", value: item.ext });
  if (item.width != null && item.height != null) {
    contentFacts.push({
      label: "Dimensions",
      value: `${item.width}×${item.height}`,
    });
  }
  if (item.durationMs != null) {
    contentFacts.push({
      label: "Duration",
      value: `${(item.durationMs / 1000).toFixed(1)}s`,
    });
  }
  contentFacts.push({
    label: "Content hash",
    value: item.contentHash
      ? `${item.contentHash.slice(0, 12)}…`
      : "missing",
  });
  if (item.isMissing) {
    contentFacts.push({ label: "Status", value: "Missing on disk" });
  }

  if (isVisionKind(item.kind)) {
    for (const f of loadLensExifFacts(item.id)) {
      if (!contentFacts.some((c) => c.label === f.label)) {
        contentFacts.push(f);
      }
    }
  }

  const suggestedRaw = [folder, item.kind, item.ext ?? "", ...tags.slice(0, 4)];
  const suggestedTags: string[] = [];
  for (const raw of suggestedRaw) {
    const n = normalizeTagName(raw);
    if (!n || STOP.has(n) || n.length < 2) continue;
    if (!suggestedTags.includes(n)) suggestedTags.push(n);
    if (suggestedTags.length >= 8) break;
  }

  const caveats: string[] = [
    "Local extractive analysis — not a generative model.",
  ];
  if (isVisionKind(item.kind)) {
    caveats.push(
      "Pixels were not sent to a vision model (local mode). Compile with Grok for a real look at the picture or video stills.",
    );
  }
  if (!body && !isVisionKind(item.kind)) {
    caveats.push("No indexed text body for this holding.");
  } else if (!body && isVisionKind(item.kind)) {
    caveats.push("No indexed text body — expected for image/video.");
  }
  if (bodyTruncated) caveats.push("Indexed text was truncated for analysis.");
  if (contentHashMissing) {
    caveats.push(
      "Content hash missing; fingerprint uses mtime and size (weaker identity).",
    );
  }
  if (item.isMissing) caveats.push("File is missing on disk; media unavailable.");
  if (tags.length === 0) caveats.push("No tags on this holding yet.");

  const usedItemText = Boolean(body);
  return {
    schemaVersion: 1,
    summary,
    keyPoints,
    themes,
    entities: [],
    contentFacts,
    suggestedTags,
    suggestedCollections: collectionNames.slice(0, 4),
    caveats,
    sources: {
      usedItemText,
      itemTextChars: body?.length ?? 0,
      truncated: bodyTruncated,
      usedVision: false,
      usedMetadataOnly: !usedItemText,
      contentHashMissing,
    },
  };
}
