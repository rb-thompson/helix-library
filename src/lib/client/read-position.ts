/**
 * Client-only reading position memory (localStorage).
 * Not imported from server modules.
 *
 * Pure helpers are exported for unit tests (no window required).
 */

export type ReadPosition = {
  itemId: number;
  /** 1-based PDF page; omit for pure scroll docs */
  page?: number;
  /** 0..1 scroll progress for continuous / text */
  scrollRatio?: number;
  updatedAt: number;
};

export const READ_POSITION_KEY = "helix-read-position";
export const READ_POSITION_CAP = 200;

function isReadPosition(e: unknown): e is ReadPosition {
  if (!e || typeof e !== "object") return false;
  const r = e as ReadPosition;
  if (typeof r.itemId !== "number" || !Number.isFinite(r.itemId) || r.itemId <= 0) {
    return false;
  }
  if (typeof r.updatedAt !== "number" || !Number.isFinite(r.updatedAt)) {
    return false;
  }
  if (r.page !== undefined) {
    if (typeof r.page !== "number" || !Number.isFinite(r.page) || r.page < 1) {
      return false;
    }
  }
  if (r.scrollRatio !== undefined) {
    if (
      typeof r.scrollRatio !== "number" ||
      !Number.isFinite(r.scrollRatio) ||
      r.scrollRatio < 0 ||
      r.scrollRatio > 1
    ) {
      return false;
    }
  }
  return true;
}

/** Parse stored JSON into a validated, capped list (MRU order). */
export function parseReadPositions(raw: string | null | undefined): ReadPosition[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReadPosition).slice(0, READ_POSITION_CAP);
  } catch {
    return [];
  }
}

export function serializeReadPositions(entries: ReadPosition[]): string {
  return JSON.stringify(entries.slice(0, READ_POSITION_CAP));
}

/**
 * Upsert one position: move item to front (MRU), clamp CAP.
 * Pure — no localStorage.
 */
export function upsertReadPosition(
  list: ReadPosition[],
  pos: ReadPosition,
  cap: number = READ_POSITION_CAP,
): ReadPosition[] {
  if (!Number.isFinite(pos.itemId) || pos.itemId <= 0) return list;
  const cleaned: ReadPosition = {
    itemId: pos.itemId,
    updatedAt: pos.updatedAt,
  };
  if (pos.page != null && Number.isFinite(pos.page) && pos.page >= 1) {
    cleaned.page = Math.floor(pos.page);
  }
  if (
    pos.scrollRatio != null &&
    Number.isFinite(pos.scrollRatio)
  ) {
    cleaned.scrollRatio = Math.min(1, Math.max(0, pos.scrollRatio));
  }
  const rest = list.filter((e) => e.itemId !== cleaned.itemId);
  return [cleaned, ...rest].slice(0, Math.max(1, cap));
}

export function getReadPositionFromList(
  list: ReadPosition[],
  itemId: number,
): ReadPosition | null {
  return list.find((e) => e.itemId === itemId) ?? null;
}

export function readAllPositions(): ReadPosition[] {
  if (typeof window === "undefined") return [];
  try {
    return parseReadPositions(localStorage.getItem(READ_POSITION_KEY));
  } catch {
    return [];
  }
}

export function getReadPosition(itemId: number): ReadPosition | null {
  return getReadPositionFromList(readAllPositions(), itemId);
}

export function setReadPosition(pos: ReadPosition): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(pos.itemId) || pos.itemId <= 0) return;
  try {
    const next = upsertReadPosition(readAllPositions(), {
      ...pos,
      updatedAt: pos.updatedAt || Date.now(),
    });
    localStorage.setItem(READ_POSITION_KEY, serializeReadPositions(next));
  } catch {
    // quota / private mode
  }
}

export function clearReadPosition(itemId: number): void {
  if (typeof window === "undefined") return;
  try {
    const next = readAllPositions().filter((e) => e.itemId !== itemId);
    localStorage.setItem(READ_POSITION_KEY, serializeReadPositions(next));
  } catch {
    // ignore
  }
}
