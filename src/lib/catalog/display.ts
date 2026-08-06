/**
 * Prefer enriched catalog title for OPAC chrome; basename remains path identity.
 */
export function displayTitle(item: {
  name: string;
  title: string;
  titleSource?: string | null;
}): string {
  const title = item.title?.trim() ?? "";
  if (
    item.titleSource &&
    item.titleSource !== "filename" &&
    title
  ) {
    return title;
  }
  if (title && title !== item.name) return title;
  return item.name;
}
