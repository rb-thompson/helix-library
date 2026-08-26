/**
 * Meta / noise tags excluded from facets and knowledge graph by default.
 * Still visible on item detail and deletable via tag hygiene UI.
 *
 * Hidden if:
 * - name is in HIDDEN_FACET_TAGS (built-in), or
 * - tags.hidden = 1 in the database (user hide / seeded meta), or
 * - name matches EXIF/encoder junk (lavf*, lang-eng), or
 * - vision-only singleton (count === 1 and every apply is source=vision)
 */

export const HIDDEN_FACET_TAGS = new Set(["vision-tagged"]);

/** Encoder / container leftovers that are not human labels. */
const NOISE_TAG_NAME = /^(lavf[\d.]+|lang-[a-z]{2,3}|handler_name|compatible_brands)$/i;

export function isNoiseTagName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (HIDDEN_FACET_TAGS.has(n.toLowerCase())) return true;
  return NOISE_TAG_NAME.test(n);
}

export function isHiddenFacetTag(
  name: string,
  opts?: {
    hidden?: boolean | number | null;
    count?: number;
    visionCount?: number;
  },
): boolean {
  if (opts?.hidden === true || opts?.hidden === 1) return true;
  if (isNoiseTagName(name)) return true;
  if (
    opts?.count != null &&
    opts.visionCount != null &&
    opts.count <= 1 &&
    opts.visionCount >= opts.count
  ) {
    return true;
  }
  return HIDDEN_FACET_TAGS.has(name.trim().toLowerCase());
}

export function filterVisibleTags<
  T extends { name: string; hidden?: boolean | number | null },
>(tags: T[]): T[] {
  return tags.filter((t) => !isHiddenFacetTag(t.name, { hidden: t.hidden }));
}
