/**
 * Meta / noise tags excluded from facets and knowledge graph by default.
 * Still visible on item detail and deletable via tag hygiene UI.
 */
export const HIDDEN_FACET_TAGS = new Set(["vision-tagged"]);

export function isHiddenFacetTag(name: string): boolean {
  return HIDDEN_FACET_TAGS.has(name.trim().toLowerCase());
}

export function filterVisibleTags<T extends { name: string }>(tags: T[]): T[] {
  return tags.filter((t) => !isHiddenFacetTag(t.name));
}
