/**
 * Arcade persistence — high scores + Night Moth meta progress.
 * Local SQLite only. No holdings, no filesystem.
 */

import { getSqlite } from "@/lib/db/client";
import { ensureColumn } from "@/lib/db/migrate";
import {
  ABILITY_ORDER,
  HIGH_SCORE_LIMIT,
  NIGHT_MOTH_GAME_ID,
  SCORE_RETAIN,
  clampInt,
  unlockedAbilities,
  type AbilityId,
} from "@/lib/arcade/night-moth";

export const ARCADE_GAMES = [NIGHT_MOTH_GAME_ID] as const;
export type ArcadeGameId = (typeof ARCADE_GAMES)[number];

export function isArcadeGameId(value: unknown): value is ArcadeGameId {
  return value === NIGHT_MOTH_GAME_ID;
}

export type ArcadeScore = {
  id: number;
  game: ArcadeGameId;
  score: number;
  night: number;
  nectar: number;
  durationMs: number;
  abilities: AbilityId[];
  createdAt: number;
  initials: string;
};

export type ArcadeProgress = {
  game: ArcadeGameId;
  xp: number;
  unlocked: AbilityId[];
  tutorialDone: boolean;
  updatedAt: number;
};

export type SubmitScoreInput = {
  game: ArcadeGameId;
  score: number;
  night: number;
  nectar: number;
  durationMs: number;
  abilities?: unknown;
  initials?: unknown;
};

export function parseAbilityList(raw: unknown): AbilityId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ABILITY_ORDER);
  const out: AbilityId[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!allowed.has(item)) continue;
    if (!out.includes(item as AbilityId)) out.push(item as AbilityId);
  }
  return out;
}

/** Live HMR / long-lived singleton may have opened the DB before this column existed. */
function arcadeSqlite() {
  const sqlite = getSqlite();
  ensureColumn(sqlite, "arcade_scores", "initials", "TEXT");
  return sqlite;
}

export function listScores(
  game: ArcadeGameId,
  limit = HIGH_SCORE_LIMIT,
): ArcadeScore[] {
  const cap = clampInt(limit, 1, HIGH_SCORE_LIMIT, HIGH_SCORE_LIMIT);
  const sqlite = arcadeSqlite();
  const rows = sqlite
    .prepare(
      `SELECT id, game, score, night, nectar, duration_ms, abilities_json, created_at, initials
       FROM arcade_scores
       WHERE game = ? AND score > 0
       ORDER BY score DESC, created_at ASC
       LIMIT ?`,
    )
    .all(game, cap) as Array<{
    id: number;
    game: string;
    score: number;
    night: number;
    nectar: number;
    duration_ms: number;
    abilities_json: string | null;
    created_at: number;
    initials: string | null;
  }>;
  return rows.map(rowToScore);
}

export function submitScore(input: SubmitScoreInput): ArcadeScore {
  const game = input.game;
  const score = clampInt(input.score, 0, 10_000_000, 0);
  const night = clampInt(input.night, 1, 99, 1);
  const nectar = clampInt(input.nectar, 0, 99_999, 0);
  const durationMs = clampInt(input.durationMs, 0, 1000 * 60 * 60 * 6, 0);
  const abilities = parseAbilityList(input.abilities);
  const initials = clampInitials(input.initials);
  const createdAt = Date.now();
  if (score < 1) {
    return {
      id: 0,
      game,
      score,
      night,
      nectar,
      durationMs,
      abilities,
      createdAt,
      initials,
    };
  }

  const sqlite = arcadeSqlite();
  const inserted = sqlite.transaction(() => {
    const dup = sqlite
      .prepare(
        `SELECT id FROM arcade_scores
         WHERE game = ? AND score = ? AND night = ? AND nectar = ?
           AND CAST(duration_ms / 1000 AS INTEGER) = ?
           AND coalesce(initials, 'MTH') = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(game, score, night, nectar, Math.round(durationMs / 1000), initials) as
      | { id: number }
      | undefined;
    if (dup) return { id: dup.id, created: false };
    const info = sqlite
      .prepare(
        `INSERT INTO arcade_scores
          (game, score, night, nectar, duration_ms, abilities_json, created_at, initials)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        game,
        score,
        night,
        nectar,
        durationMs,
        JSON.stringify(abilities),
        createdAt,
        initials,
      );
    const id = Number(info.lastInsertRowid);
    pruneScores(sqlite, game);
    return { id, created: true };
  })();

  return {
    id: inserted.id,
    game,
    score,
    night,
    nectar,
    durationMs,
    abilities,
    createdAt,
    initials,
  };
}

function pruneScores(
  sqlite: ReturnType<typeof getSqlite>,
  game: ArcadeGameId,
): void {
  sqlite
    .prepare(
      `DELETE FROM arcade_scores
       WHERE game = ?
         AND id NOT IN (
           SELECT id FROM arcade_scores
           WHERE game = ?
           ORDER BY score DESC, created_at ASC
           LIMIT ?
         )`,
    )
    .run(game, game, SCORE_RETAIN);
}

export function getProgress(game: ArcadeGameId): ArcadeProgress {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT game, xp, unlocked_json, tutorial_done, updated_at
       FROM arcade_progress WHERE game = ?`,
    )
    .get(game) as
    | {
        game: string;
        xp: number;
        unlocked_json: string | null;
        tutorial_done: number;
        updated_at: number;
      }
    | undefined;

  if (!row) {
    return {
      game,
      xp: 0,
      unlocked: unlockedAbilities(0),
      tutorialDone: false,
      updatedAt: 0,
    };
  }

  const xp = clampInt(row.xp, 0, 1_000_000, 0);
  const stored = parseAbilityList(safeJson(row.unlocked_json));
  const derived = unlockedAbilities(xp);
  const unlocked = uniqueAbilities([...derived, ...stored]);
  return {
    game,
    xp,
    unlocked,
    tutorialDone: row.tutorial_done === 1,
    updatedAt: row.updated_at,
  };
}

export function saveProgress(input: {
  game: ArcadeGameId;
  xp: number;
  unlocked?: unknown;
  tutorialDone?: boolean;
}): ArcadeProgress {
  const xp = clampInt(input.xp, 0, 1_000_000, 0);
  const derived = unlockedAbilities(xp);
  const extra = parseAbilityList(input.unlocked);
  const unlocked = uniqueAbilities([...derived, ...extra]);
  const tutorialDone = Boolean(input.tutorialDone);
  const updatedAt = Date.now();

  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO arcade_progress (game, xp, unlocked_json, tutorial_done, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(game) DO UPDATE SET
         xp = excluded.xp,
         unlocked_json = excluded.unlocked_json,
         tutorial_done = excluded.tutorial_done,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.game,
      xp,
      JSON.stringify(unlocked),
      tutorialDone ? 1 : 0,
      updatedAt,
    );

  return {
    game: input.game,
    xp,
    unlocked,
    tutorialDone,
    updatedAt,
  };
}

function uniqueAbilities(list: AbilityId[]): AbilityId[] {
  const have = new Set<AbilityId>(list);
  return ABILITY_ORDER.filter((id) => have.has(id));
}

function safeJson(raw: string | null): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
}

function clampInitials(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  return (cleaned || "MTH").padEnd(3, "X");
}

function rowToScore(row: {
  id: number;
  game: string;
  score: number;
  night: number;
  nectar: number;
  duration_ms: number;
  abilities_json: string | null;
  created_at: number;
  initials?: string | null;
}): ArcadeScore {
  return {
    id: row.id,
    game: isArcadeGameId(row.game) ? row.game : NIGHT_MOTH_GAME_ID,
    score: row.score,
    night: row.night,
    nectar: row.nectar,
    durationMs: row.duration_ms,
    abilities: parseAbilityList(safeJson(row.abilities_json)),
    createdAt: row.created_at,
    initials: clampInitials(row.initials),
  };
}
