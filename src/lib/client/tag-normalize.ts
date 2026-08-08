/**
 * Client-safe tag normalize (mirrors server normalizeTagName rules).
 * No DB imports.
 */

export const TAG_NAME_MAX = 64;

export function normalizeTagName(raw: string): string | null {
  const n = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!n) return null;
  return n.length > TAG_NAME_MAX ? n.slice(0, TAG_NAME_MAX) : n;
}

/**
 * Probe whether a tag already exists via list API.
 * Falls back to "does not exist" (forces confirm) on network errors.
 */
export async function tagExistsByNameClient(name: string): Promise<boolean> {
  const n = normalizeTagName(name);
  if (!n) return false;
  try {
    const res = await fetch("/api/tags");
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tags?: Array<{ name: string }>;
    };
    const tags = data.tags ?? [];
    return tags.some((t) => t.name.toLowerCase() === n);
  } catch {
    return false;
  }
}
