/**
 * Meta / noise tags excluded from facets and knowledge graph by default.
 * Still visible on item detail and deletable via tag hygiene UI.
 *
 * Hidden if:
 * - name is in HIDDEN_FACET_TAGS (built-in), or
 * - tags.hidden = 1 in the database (user hide / seeded meta)
 */

export const HIDDEN_FACET_TAGS = new Set(["vision-tagged"]);

export function isHiddenFacetTag(
  name: string,
  opts?: { hidden?: boolean | number | null },
): boolean {
  if (opts?.hidden === true || opts?.hidden === 1) return true;
  return HIDDEN_FACET_TAGS.has(name.trim().toLowerCase());
}

export function filterVisibleTags<
  T extends { name: string; hidden?: boolean | number | null },
>(tags: T[]): T[] {
  return tags.filter((t) => !isHiddenFacetTag(t.name, { hidden: t.hidden }));
}
