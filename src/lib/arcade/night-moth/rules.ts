/**
 * Night Moth — scoring, unlocks, night composition.
 * Pure functions; unit-tested. Engine imports these; it does not invent numbers.
 */

import {
  ABILITIES,
  ABILITY_ORDER,
  LAMPS,
  STARTER_ABILITIES,
  type AbilityId,
  type LampKind,
} from "./catalog";
import { REGION_ORDER, homeRegionForLamp, type RegionId } from "./regions";

export type SipOutcome = {
  hp: number;
  nectar: number;
  xp: number;
  score: number;
  comboKeep: boolean;
  conditions: Array<{
    id:
      | "nectar-glow"
      | "moonlit"
      | "charged"
      | "dazed"
      | "burn"
      | "drawn"
      | "confused"
      | "heavy-pollen";
    duration?: number;
  }>;
  fatal?: boolean;
  message: string;
};

export type NightMix = {
  night: number;
  lamps: LampKind[];
  sparks: number;
};

export function isTrueLamp(kind: LampKind): boolean {
  return LAMPS[kind].alignment === "true";
}

export function isLure(kind: LampKind): boolean {
  return LAMPS[kind].alignment === "lure";
}

export function comboMultiplier(combo: number): number {
  if (combo <= 1) return 1;
  return 1 + Math.min(1.8, (combo - 1) * 0.18);
}

export function lampSipScore(
  kind: LampKind,
  night: number,
  combo: number,
): number {
  const base: Record<LampKind, number> = {
    circulation: 100,
    reading: 80,
    archive: 250,
    helix: 800,
    zapper: 0,
    furnace: 0,
    wisp: 0,
    "false-moon": 0,
    "nectar-trap": 0,
  };
  const n = Math.max(1, night);
  return Math.round(base[kind] * n * comboMultiplier(combo));
}

export function lureKillScore(
  kind: LampKind,
  night: number,
  combo: number,
): number {
  if (!isLure(kind)) return 0;
  const base: Record<LampKind, number> = {
    circulation: 0,
    reading: 0,
    archive: 0,
    helix: 0,
    zapper: 140,
    furnace: 160,
    wisp: 220,
    "false-moon": 180,
    "nectar-trap": 130,
  };
  return Math.round(base[kind] * Math.max(1, night) * comboMultiplier(combo));
}

export function nightClearScore(night: number): number {
  return 500 * Math.max(1, night);
}

export function sparkKillScore(night: number, combo: number): number {
  return Math.round(35 * Math.max(1, night) * comboMultiplier(combo));
}

export function xpForLamp(kind: LampKind): number {
  switch (kind) {
    case "circulation":
      return 12;
    case "reading":
      return 10;
    case "archive":
      return 28;
    case "helix":
      return 70;
    default:
      return 0;
  }
}

export function xpForLureKill(kind: LampKind): number {
  if (!isLure(kind)) return 0;
  return kind === "wisp" ? 18 : 10;
}

export function unlockedAbilities(xp: number): AbilityId[] {
  const have = new Set<AbilityId>(STARTER_ABILITIES);
  for (const id of ABILITY_ORDER) {
    if (xp >= ABILITIES[id].xp) have.add(id);
  }
  return ABILITY_ORDER.filter((id) => have.has(id));
}

export function nextUnlock(
  xp: number,
): { id: AbilityId; name: string; remaining: number; cost: number } | null {
  for (const id of ABILITY_ORDER) {
    const def = ABILITIES[id];
    if (xp < def.xp) {
      return {
        id,
        name: def.name,
        remaining: def.xp - xp,
        cost: def.xp,
      };
    }
  }
  return null;
}

export function applyCombo(
  prev: number,
  event: "true-sip" | "lure-kill" | "spark" | "hurt" | "miss-sip",
): number {
  if (event === "hurt" || event === "miss-sip") return 0;
  if (event === "spark") return prev + 1;
  return prev + 1;
}

export function sipOutcome(
  kind: LampKind,
  night: number,
  combo: number,
): SipOutcome {
  if (isTrueLamp(kind)) {
    const score = lampSipScore(kind, night, combo);
    const nectar =
      kind === "helix" ? 8 : kind === "archive" ? 4 : kind === "reading" ? 2 : 3;
    const conditions: SipOutcome["conditions"] = [
      { id: "nectar-glow" },
    ];
    if (kind === "reading") conditions.push({ id: "moonlit" });
    if (kind === "archive") conditions.push({ id: "charged" });
    if (kind === "helix") {
      conditions.push({ id: "moonlit" }, { id: "charged" });
    }
    return {
      hp: kind === "reading" ? 22 : kind === "helix" ? 16 : 6,
      nectar,
      xp: xpForLamp(kind),
      score,
      comboKeep: true,
      conditions,
      message:
        kind === "helix"
          ? "The mark drinks you back."
          : kind === "archive"
            ? "Cool light. The stacks approve."
            : kind === "reading"
              ? "Heat along the wing. Mended."
              : "True lamp. The nectar is clean.",
    };
  }

  switch (kind) {
    case "zapper":
      return {
        hp: -38,
        nectar: 0,
        xp: 0,
        score: 0,
        comboKeep: false,
        conditions: [{ id: "dazed" }],
        message: "The cage sings. You should not have answered.",
      };
    case "furnace":
      return {
        hp: -22,
        nectar: 0,
        xp: 0,
        score: 0,
        comboKeep: false,
        conditions: [{ id: "burn" }],
        message: "The mouth takes a taste.",
      };
    case "wisp":
      return {
        hp: -16,
        nectar: -5,
        xp: 0,
        score: 0,
        comboKeep: false,
        conditions: [{ id: "drawn" }],
        message: "It drinks what you gathered.",
      };
    case "false-moon":
      return {
        hp: -10,
        nectar: 0,
        xp: 0,
        score: 0,
        comboKeep: false,
        conditions: [{ id: "confused" }],
        message: "The sky is a lie. Your hands forget the garden.",
      };
    case "nectar-trap":
      return {
        hp: -8,
        nectar: 1,
        xp: 0,
        score: 0,
        comboKeep: false,
        conditions: [{ id: "heavy-pollen" }],
        message: "Off-beat. The pollen is heavy and wrong.",
      };
    default:
      return {
        hp: -12,
        nectar: 0,
        xp: 0,
        score: 0,
        comboKeep: false,
        conditions: [],
        message: "That light was not for you.",
      };
  }
}

export function contactDamage(kind: LampKind): {
  hp: number;
  condition?: SipOutcome["conditions"][number]["id"];
} {
  switch (kind) {
    case "zapper":
      return { hp: -16, condition: "dazed" };
    case "furnace":
      return { hp: -10, condition: "burn" };
    case "wisp":
      return { hp: -8, condition: "drawn" };
    case "false-moon":
      return { hp: -6, condition: "confused" };
    case "nectar-trap":
      return { hp: -4, condition: "heavy-pollen" };
    default:
      return { hp: 0 };
  }
}

export function lampHp(kind: LampKind): number {
  switch (kind) {
    case "zapper":
      return 55;
    case "furnace":
      return 70;
    case "wisp":
      return 48;
    case "false-moon":
      return 60;
    case "nectar-trap":
      return 40;
    case "circulation":
    case "reading":
      return 80;
    case "archive":
      return 90;
    case "helix":
      return 120;
  }
}

/** Ability damage at the listed range band. Charged multiplies later. */
export function abilityDamage(id: AbilityId): number {
  switch (id) {
    case "scale-dust":
      return 16;
    case "wing-cleave":
      return 34;
    case "sonic-pulse":
      return 22;
    case "ashen-dive":
      return 40;
    case "pollen-bomb":
      return 8;
    case "helix-spiral":
      return 28;
    default:
      return 0;
  }
}

export function nightLampCount(night: number): number {
  return Math.min(28, 10 + night * 2);
}

export function nightSparkCount(night: number): number {
  return Math.min(16, 3 + night);
}

/**
 * Compose a night. Early nights teach; later nights lie more.
 * `rng` is [0, 1). Deterministic if the caller seeds it.
 */
export function composeNight(night: number, rng: () => number): NightMix {
  const n = Math.max(1, Math.floor(night));
  const count = nightLampCount(n);
  const lamps: LampKind[] = [];

  // Always one honest Circulation so a careful moth can live.
  lamps.push("circulation");
  if (n >= 2) lamps.push("reading");
  if (n >= 3) lamps.push("archive");
  if (n >= 5 && rng() < 0.35) lamps.push("helix");
  else if (n >= 8 && rng() < 0.55) lamps.push("helix");

  const lurePool: LampKind[] = ["zapper"];
  if (n >= 2) lurePool.push("nectar-trap");
  if (n >= 3) lurePool.push("furnace");
  if (n >= 4) lurePool.push("wisp");
  if (n >= 6) lurePool.push("false-moon");

  const lureTarget = Math.min(
    count - lamps.length,
    1 + Math.floor(n / 2) + (n >= 7 ? 1 : 0),
  );
  for (let i = 0; i < lureTarget; i++) {
    lamps.push(pick(lurePool, rng));
  }

  const trueFill: LampKind[] = ["circulation", "circulation", "reading"];
  if (n >= 3) trueFill.push("archive");
  while (lamps.length < count) {
    // Later nights: a third of fills are lures dressed as abundance.
    if (n >= 4 && rng() < 0.28) lamps.push(pick(lurePool, rng));
    else lamps.push(pick(trueFill, rng));
  }

  return { night: n, lamps, sparks: nightSparkCount(n) };
}

export function tutorialLamps(): LampKind[] {
  return ["circulation", "zapper", "nectar-trap"];
}

/** Most lamps wander. A minority still prefer their house region. */
export function scatterRegionId(kind: LampKind, rng: () => number): RegionId {
  if (rng() < 0.28) return homeRegionForLamp(kind);
  const i = Math.min(
    REGION_ORDER.length - 1,
    Math.max(0, Math.floor(rng() * REGION_ORDER.length)),
  );
  return REGION_ORDER[i]!;
}

export const BONUS_SCORE = 180;
export const BONUS_NECTAR = 2;
export const BONUS_XP = 8;

export function nextAbility(
  list: readonly AbilityId[],
  current: AbilityId,
  dir: 1 | -1,
): AbilityId {
  if (list.length === 0) return current;
  const i = list.indexOf(current);
  const from = i < 0 ? 0 : i;
  return list[(from + dir + list.length) % list.length]!;
}

function pick<T>(list: readonly T[], rng: () => number): T {
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
  return list[i]!;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function clampInt(n: unknown, min: number, max: number, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}
