/**
 * Client-only recent-open history (localStorage).
 * Not imported from server modules.
 */

export type OpenHistoryEntry = {
  id: number;
  name: string;
  kind: string;
  openedAt: number;
};

const KEY = "helix-open-history";
const CAP = 40;

export function readOpenHistory(): OpenHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is OpenHistoryEntry =>
          e &&
          typeof e === "object" &&
          typeof (e as OpenHistoryEntry).id === "number" &&
          typeof (e as OpenHistoryEntry).name === "string",
      )
      .slice(0, CAP);
  } catch {
    return [];
  }
}

export function recordOpen(entry: {
  id: number;
  name: string;
  kind: string;
}): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(entry.id) || entry.id <= 0) return;
  try {
    const prev = readOpenHistory().filter((e) => e.id !== entry.id);
    const next: OpenHistoryEntry[] = [
      {
        id: entry.id,
        name: entry.name.slice(0, 200),
        kind: entry.kind,
        openedAt: Date.now(),
      },
      ...prev,
    ].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota / private mode
  }
}

export function clearOpenHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
