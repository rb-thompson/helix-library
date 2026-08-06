import { addTagToItem } from "@/lib/collections/manage";
import { readExifRaw } from "@/lib/media/exif";
import type { AcquireJobKind } from "@/lib/acquire/jobs";
import type { TagSource } from "@/lib/tags/source";
import { ACQUIRE_TAG_NAMES } from "@/lib/tags/backfill-source";

const ACQUIRE_LABELS = new Set<string>(ACQUIRE_TAG_NAMES);

/** EXIF/metadata keys that make good catalog labels (short, human). */
const TAG_SOURCE_KEYS = [
  "Artist",
  "AlbumArtist",
  "Author",
  "Composer",
  "Genre",
  "Album",
  "Make",
  "Model",
  "Software",
  "Encoder",
  "Copyright",
  "MediaLanguageCode",
  "Language",
  "ContentCreateDate",
  // yt-dlp / QuickTime often use these after --embed-metadata
  "Title",
  "Description",
  "Comment",
  "HandlerDescription",
] as const;

/**
 * Map free-text metadata values into safe Helix tag names (≤48 chars).
 */
export function valueToTagName(raw: string): string | null {
  let s = raw.normalize("NFKC").trim();
  if (!s) return null;
  // Drop long descriptions / comments as tags
  if (s.length > 80) {
    // Keep short first clause for title-like fields only if ≤80; else skip
    const clause = s.split(/[.;\n|]/)[0]?.trim() ?? "";
    if (clause.length < 3 || clause.length > 48) return null;
    s = clause;
  }
  s = s
    .toLowerCase()
    .replace(/[^\w\s.+#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (s.length < 2) return null;
  if (s.length > 48) s = s.slice(0, 48).replace(/-$/, "");
  // Skip pure noise / resolution-like
  if (/^\d+(\.\d+)?$/.test(s)) return null;
  if (/^\d+x\d+$/i.test(s)) return null;
  return s || null;
}

/**
 * Build catalog tag names from an exiftool row + acquire source.
 */
export function tagsFromExifAndSource(
  row: Record<string, unknown> | null,
  source: AcquireJobKind,
): string[] {
  const out = new Set<string>();
  out.add("acquired");
  if (source === "youtube") out.add("youtube");
  if (source === "arxiv") out.add("arxiv");
  if (source === "image") out.add("grok-image");

  if (!row) return [...out];

  for (const key of TAG_SOURCE_KEYS) {
    const val = row[key];
    if (val == null || val === "") continue;
    // Title/Description often too long — only take short titles
    if (key === "Title" || key === "Description" || key === "Comment") {
      const t = valueToTagName(String(val));
      if (t && t.length <= 40 && !t.includes("http")) out.add(t);
      continue;
    }
    if (key === "HandlerDescription") {
      // "ISO Media file produced by Google Inc. …" → youtube already tagged
      if (/google/i.test(String(val))) out.add("youtube");
      continue;
    }
    if (key === "Encoder") {
      const e = String(val).toLowerCase();
      if (e.includes("google")) out.add("youtube");
      else {
        const t = valueToTagName(String(val));
        if (t) out.add(t);
      }
      continue;
    }
    if (key === "MediaLanguageCode" || key === "Language") {
      const lang = String(val).toLowerCase().replace(/[^a-z-]/g, "");
      if (lang.length >= 2 && lang.length <= 12) out.add(`lang-${lang}`);
      continue;
    }
    const t = valueToTagName(String(val));
    if (t) out.add(t);
  }

  // Cap to avoid tag spam from verbose metadata
  return [...out].slice(0, 24);
}

/**
 * After reindex, attach source + EXIF-derived tags to the catalog item.
 * Returns tag names applied (best-effort; never throws).
 */
export function applyAcquireTags(
  itemId: number,
  filePath: string,
  source: AcquireJobKind,
): string[] {
  const applied: string[] = [];
  try {
    const row = readExifRaw(filePath);
    const names = tagsFromExifAndSource(row, source);
    for (const name of names) {
      try {
        const tagSource: TagSource = ACQUIRE_LABELS.has(name)
          ? "acquire"
          : "exif";
        addTagToItem(itemId, name, tagSource);
        applied.push(name);
      } catch {
        // skip invalid individual tags
      }
    }
  } catch {
    // still try minimal source tags
    try {
      addTagToItem(itemId, "acquired", "acquire");
      applied.push("acquired");
      if (source === "youtube") {
        addTagToItem(itemId, "youtube", "acquire");
        applied.push("youtube");
      }
      if (source === "arxiv") {
        addTagToItem(itemId, "arxiv", "acquire");
        applied.push("arxiv");
      }
      if (source === "image") {
        addTagToItem(itemId, "grok-image", "acquire");
        applied.push("grok-image");
      }
    } catch {
      // ignore
    }
  }
  return applied;
}
