/**
 * Night Moth life — mites, beetles, spiders, bloom, dragonflies, bosses.
 * Pure catalog + night composition. Engine / life.ts only consume these numbers.
 */

import { RETREAT } from "./terrain";

export type MiteHue = "green" | "purple" | "blue";

export type FoeId = "mite" | "beetle" | "spider";
export type FriendId = "honeysuckle" | "moonflower" | "dragonfly";
export type BossId = "bat" | "wasp";

export type MiteDef = {
  hue: MiteHue;
  name: string;
  color: number;
  hp: number;
  accel: number;
  contact: number;
  /** green darts, purple packs, blue figure-eights. */
  gait: "dart" | "pack" | "orbit";
};

export type BloomDef = {
  id: FriendId & ("honeysuckle" | "moonflower");
  name: string;
  nectar: number;
  score: number;
  xp: number;
  moonlit: number;
};

export const MITES: Record<MiteHue, MiteDef> = {
  green: {
    hue: "green",
    name: "Yard mite",
    color: 0xb8ff3a,
    hp: 18,
    accel: 4.2,
    contact: 9,
    gait: "dart",
  },
  purple: {
    hue: "purple",
    name: "Fen mite",
    color: 0xb44cff,
    hp: 22,
    accel: 3.1,
    contact: 11,
    gait: "pack",
  },
  blue: {
    hue: "blue",
    name: "Stack mite",
    color: 0x4aa8ff,
    hp: 26,
    accel: 2.6,
    contact: 8,
    gait: "orbit",
  },
};

export const MITE_ORDER: readonly MiteHue[] = ["green", "purple", "blue"];

export const BLOOMS: Record<"honeysuckle" | "moonflower", BloomDef> = {
  honeysuckle: {
    id: "honeysuckle",
    name: "Honeysuckle",
    nectar: 2,
    score: 80,
    xp: 6,
    moonlit: 0,
  },
  moonflower: {
    id: "moonflower",
    name: "Moonflower",
    nectar: 3,
    score: 140,
    xp: 10,
    moonlit: 6,
  },
};

export const BEETLE = {
  name: "Ground beetle",
  color: 0x2a1c10,
  gleam: 0xc47a3a,
  hp: 34,
  speed: 2.4,
  contact: 12,
  radius: 0.7,
} as const;

export const SPIDER = {
  name: "Web spider",
  color: 0x1a1014,
  gleam: 0xe8c48a,
  hp: 28,
  contact: 16,
  escapeHits: 6,
  escapeWindow: 3.2,
} as const;

export const DRAGONFLY = {
  name: "Night darner",
  color: 0x3a8860,
  gleam: 0x6ee7d0,
} as const;

export const BOSSES: Record<
  BossId,
  {
    id: BossId;
    name: string;
    color: number;
    hp: number;
    contact: number;
    escape: boolean;
    score: number;
    xp: number;
  }
> = {
  bat: {
    id: "bat",
    name: "Night bat",
    color: 0x6a4a88,
    hp: 180,
    contact: 18,
    escape: true,
    score: 900,
    xp: 40,
  },
  wasp: {
    id: "wasp",
    name: "Paper wasp",
    color: 0xf0c030,
    hp: 220,
    contact: 24,
    escape: false,
    score: 1400,
    xp: 55,
  },
};

export type WebSite = { x: number; z: number; hint: string };
export type BloomSite = {
  x: number;
  z: number;
  kind: "honeysuckle" | "moonflower";
};

/** Alleys, barn, cave mouth — invisible until you fly low into them. */
export const WEB_SITES: readonly WebSite[] = [
  { x: 54, z: -42, hint: "mid ward court" },
  { x: 76, z: 2, hint: "cross street" },
  { x: 50, z: 22, hint: "shop row" },
  { x: 28, z: 108, hint: "warehouse eave" },
  { x: -78, z: 50, hint: "barn loft" },
  { x: -86, z: 40, hint: "acre shed" },
  { x: -104, z: 90, hint: "cave mouth" },
  { x: -124, z: 110, hint: "cave chamber" },
  { x: 88, z: -74, hint: "archive alley" },
];

export const BLOOM_SITES: readonly BloomSite[] = [
  { x: -36, z: 18, kind: "honeysuckle" },
  { x: -62, z: 34, kind: "honeysuckle" },
  { x: -70, z: 64, kind: "honeysuckle" },
  { x: -40, z: 70, kind: "honeysuckle" },
  { x: -100, z: -50, kind: "honeysuckle" },
  { x: -78, z: -64, kind: "honeysuckle" },
  { x: 4, z: -110, kind: "moonflower" },
  { x: 14, z: -118, kind: "moonflower" },
  { x: -8, z: -124, kind: "moonflower" },
  { x: -118, z: 14, kind: "moonflower" },
  { x: -108, z: -4, kind: "moonflower" },
  { x: -30, z: -14, kind: "moonflower" },
];

export const POLLINATE_RANGE = 2.4;
export const WEB_TRIGGER_Y = 2.15;
export const WEB_RADIUS = 2.6;

export type FaunaMix = {
  mites: MiteHue[];
  beetles: number;
  dragonflies: number;
  webs: number;
};

export function miteForNight(night: number, rng: () => number): MiteHue {
  const n = Math.max(1, night);
  if (n >= 4 && rng() < 0.28) return "blue";
  if (n >= 2 && rng() < 0.34) return "purple";
  return "green";
}

export function composeFauna(night: number, rng: () => number): FaunaMix {
  const n = Math.max(1, Math.floor(night));
  const miteN = Math.min(22, 3 + n);
  const mites: MiteHue[] = [];
  for (let i = 0; i < miteN; i++) mites.push(miteForNight(n, rng));
  return {
    mites,
    beetles: Math.min(10, 1 + Math.floor(n / 2)),
    dragonflies: Math.min(14, 4 + n),
    webs: Math.min(WEB_SITES.length, 3 + Math.floor(n / 2)),
  };
}

export function beetleScore(night: number): number {
  return 70 * Math.max(1, night);
}

export function miteScore(hue: MiteHue, night: number, combo: number): number {
  const base = hue === "blue" ? 50 : hue === "purple" ? 42 : 35;
  const mult = combo <= 1 ? 1 : 1 + Math.min(1.8, (combo - 1) * 0.18);
  return Math.round(base * Math.max(1, night) * mult);
}

export function spiderScore(night: number): number {
  return 110 * Math.max(1, night);
}

export function canEscapeBoss(id: BossId, x: number, z: number): boolean {
  if (!BOSSES[id].escape) return false;
  return Math.hypot(x - RETREAT.x, z - RETREAT.z) < 9;
}

export function infestationCount(
  kind: "mite" | "beetle",
  night: number,
): number {
  if (kind === "beetle") return Math.min(8, 3 + Math.floor(night / 2));
  return Math.min(16, 6 + night);
}
