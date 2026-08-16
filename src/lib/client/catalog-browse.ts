/**
 * Catalog j/k browse (look-feel craft PR8).
 * Pure helpers — CatalogResults owns the listener.
 */

export function nextBrowseIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return 0;
  const start = Number.isFinite(current) ? current : 0;
  return ((start + delta) % length + length) % length;
}

export function isBrowseBlockedTarget(target: EventTarget | null): boolean {
  if (target == null || typeof Element === "undefined") return false;
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target.closest(".sel-callout, .sel-sheet")) return true;
  return false;
}
