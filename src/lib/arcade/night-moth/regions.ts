/**
 * Night Moth grounds — named regions on a large night garden.
 * Pure data. Engine places lamps; HUD names the soil under the wing.
 */

import type { LampKind } from "./catalog";

export type RegionId =
  | "court"
  | "grove"
  | "stacks"
  | "terrace"
  | "yard"
  | "hollow"
  | "fen"
  | "plaza";

export type RegionDef = {
  id: RegionId;
  name: string;
  /** World XZ center. */
  x: number;
  z: number;
  radius: number;
  /** Ground tint. */
  soil: number;
  accent: number;
  homeLamp: LampKind;
  blurb: string;
};

export const REGIONS: Record<RegionId, RegionDef> = {
  court: {
    id: "court",
    name: "Circulation court",
    x: 0,
    z: 0,
    radius: 32,
    soil: 0x1c1a16,
    accent: 0xe8a85a,
    homeLamp: "circulation",
    blurb: "The cart. Amber paths. Honest lamps, if you are lucky.",
  },
  grove: {
    id: "grove",
    name: "Reading grove",
    x: -92,
    z: -78,
    radius: 38,
    soil: 0x162016,
    accent: 0xc47a3a,
    homeLamp: "reading",
    blurb: "Copper cones under the canopy. Heat that mends.",
  },
  stacks: {
    id: "stacks",
    name: "Archive stacks",
    x: 96,
    z: -82,
    radius: 36,
    soil: 0x161820,
    accent: 0xc8d4e8,
    homeLamp: "archive",
    blurb: "Moon-silver columns. The shelves remember.",
  },
  terrace: {
    id: "terrace",
    name: "Helix terrace",
    x: 98,
    z: 84,
    radius: 34,
    soil: 0x121c1c,
    accent: 0x6ee7d0,
    homeLamp: "helix",
    blurb: "The building's mark, left out after Hours.",
  },
  yard: {
    id: "yard",
    name: "Cage yard",
    x: 8,
    z: 108,
    radius: 36,
    soil: 0x121610,
    accent: 0x6dff4a,
    homeLamp: "zapper",
    blurb: "A grid that sings. Nothing that drinks here leaves whole.",
  },
  hollow: {
    id: "hollow",
    name: "Furnace hollow",
    x: -96,
    z: 86,
    radius: 36,
    soil: 0x1c1410,
    accent: 0xff3a1a,
    homeLamp: "furnace",
    blurb: "A boiler door left ajar.",
  },
  fen: {
    id: "fen",
    name: "Wisp fen",
    x: -118,
    z: 6,
    radius: 40,
    soil: 0x16101c,
    accent: 0xb44cff,
    homeLamp: "wisp",
    blurb: "Violet hunger. If it hunts you, it is not a lamp.",
  },
  plaza: {
    id: "plaza",
    name: "Moon plaza",
    x: 4,
    z: -118,
    radius: 38,
    soil: 0x1a1a1c,
    accent: 0xf4f0e0,
    homeLamp: "false-moon",
    blurb: "Bone-white. Too round. No crater.",
  },
};

export const REGION_ORDER: readonly RegionId[] = [
  "court",
  "grove",
  "stacks",
  "terrace",
  "yard",
  "hollow",
  "fen",
  "plaza",
];

export function regionAt(x: number, z: number): RegionDef {
  let best = REGIONS.court;
  let bestD = Infinity;
  for (const id of REGION_ORDER) {
    const r = REGIONS[id];
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function homeRegionForLamp(kind: LampKind): RegionId {
  switch (kind) {
    case "circulation":
    case "nectar-trap":
      return "court";
    case "reading":
      return "grove";
    case "archive":
      return "stacks";
    case "helix":
      return "terrace";
    case "zapper":
      return "yard";
    case "furnace":
      return "hollow";
    case "wisp":
      return "fen";
    case "false-moon":
      return "plaza";
  }
}

export function compassLabel(bearingDeg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const i = Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8;
  return dirs[i]!;
}

export function bearingDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
  // 0° = north = −Z (Moon plaza). 90° = east = +X.
  const rad = Math.atan2(toX - fromX, -(toZ - fromZ));
  return ((rad * 180) / Math.PI + 360) % 360;
}
