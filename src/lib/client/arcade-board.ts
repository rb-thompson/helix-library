/**
 * Client ledger for Night Moth — localStorage backup if HTTP is busy.
 * Pure parse helpers are testable without window.
 */

import {
  ABILITY_ORDER,
  HIGH_SCORE_LIMIT,
  NIGHT_MOTH_GAME_ID,
  type AbilityId,
} from "@/lib/arcade/night-moth";
import type { ArcadeScore } from "@/lib/arcade/scores";

function parseAbilityList(raw: unknown): AbilityId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ABILITY_ORDER);
  const out: AbilityId[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !allowed.has(item)) continue;
    if (!out.includes(item as AbilityId)) out.push(item as AbilityId);
  }
  return out;
}

export const ARCADE_BOARD_KEY = "helix-arcade-night-moth-scores";

export function parseBoard(raw: string | null | undefined): ArcadeScore[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: ArcadeScore[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const score = Number(r.score);
      if (!Number.isFinite(score)) continue;
      out.push({
        id: Number(r.id) || out.length + 1,
        game: NIGHT_MOTH_GAME_ID,
        score,
        night: Number(r.night) || 1,
        nectar: Number(r.nectar) || 0,
        durationMs: Number(r.durationMs ?? r.duration_ms) || 0,
        abilities: parseAbilityList(r.abilities),
        createdAt: Number(r.createdAt ?? r.created_at) || Date.now(),
        initials: sanitizeInitials(r.initials),
      });
    }
    return rankBoard(out);
  } catch {
    return [];
  }
}

export function rankBoard(rows: ArcadeScore[]): ArcadeScore[] {
  return [...rows]
    .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
    .slice(0, HIGH_SCORE_LIMIT);
}

export function scoreDedupeKey(row: Pick<ArcadeScore, "score" | "night" | "nectar" | "durationMs" | "initials">): string {
  return [
    row.score,
    row.night,
    row.nectar,
    Math.round(row.durationMs / 1000),
    row.initials || "MTH",
  ].join(":");
}

export function mergeBoards(
  server: ArcadeScore[],
  local: ArcadeScore[],
): ArcadeScore[] {
  const seen = new Set<string>();
  const out: ArcadeScore[] = [];
  // Server first so catalog ids win; local optimistic copies collapse.
  for (const row of [...server, ...local]) {
    const key = scoreDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return rankBoard(out);
}

export function sanitizeInitials(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  return (cleaned || "MTH").padEnd(3, "X");
}

export function readLocalBoard(): ArcadeScore[] {
  if (typeof window === "undefined") return [];
  try {
    return parseBoard(window.localStorage.getItem(ARCADE_BOARD_KEY));
  } catch {
    return [];
  }
}

export function writeLocalBoard(rows: ArcadeScore[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ARCADE_BOARD_KEY, JSON.stringify(rankBoard(rows)));
  } catch {
    /* quota */
  }
}

export function rememberScore(row: ArcadeScore): ArcadeScore[] {
  const next = mergeBoards(readLocalBoard(), [row]);
  writeLocalBoard(next);
  return next;
}
