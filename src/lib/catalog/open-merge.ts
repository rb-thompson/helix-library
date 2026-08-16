/**
 * Union local helix-open-history with server item_events.
 * Pure — safe for client and tests. Do not import server modules here.
 */

export type RecentOpen = {
  id: number;
  name: string;
  kind: string;
  openedAt: number;
};

export const RECENT_OPENS_CAP = 40;

export function mergeRecentOpens(
  server: readonly RecentOpen[],
  local: readonly RecentOpen[],
  cap = RECENT_OPENS_CAP,
): RecentOpen[] {
  const byId = new Map<number, RecentOpen>();
  for (const entry of [...server, ...local]) {
    if (!Number.isFinite(entry.id) || entry.id <= 0) continue;
    if (!Number.isFinite(entry.openedAt)) continue;
    const prev = byId.get(entry.id);
    if (!prev || entry.openedAt > prev.openedAt) {
      byId.set(entry.id, {
        id: entry.id,
        name: entry.name,
        kind: entry.kind,
        openedAt: entry.openedAt,
      });
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, cap);
}
