/**
 * Night Moth height field, waterways, caves, rim.
 * Pure functions. Garden, flight, and collision consume this; they do not invent ground.
 */

import { ARENA_RADIUS } from "./catalog";
import { regionAt } from "./regions";

export type TerrainFeature =
  | "court"
  | "street"
  | "field"
  | "hill"
  | "ridge"
  | "water"
  | "cave"
  | "mouth";

export type Waterway = {
  id: string;
  /** Open polyline in XZ. Fish follow these. */
  pts: ReadonlyArray<readonly [number, number]>;
  half: number;
};

export type CaveDef = {
  id: string;
  mouth: readonly [number, number];
  end: readonly [number, number];
  half: number;
  chamberR: number;
  floor: number;
  ceiling: number;
};

/** Fen pool + irrigation + the two historic canals, now as one network. */
export const WATERWAYS: readonly Waterway[] = [
  {
    id: "fen-court",
    pts: [
      [-126, 6],
      [-118, 6],
      [-96, 10],
      [-80, 8],
      [-55, 8],
      [-20, 8],
      [4, 8],
    ],
    half: 3.6,
  },
  {
    id: "court-plaza",
    pts: [
      [4, 8],
      [4, -30],
      [4, -62],
      [4, -90],
      [4, -118],
    ],
    half: 3.4,
  },
  {
    id: "acre-ditch",
    pts: [
      [-48, 28],
      [-62, 22],
      [-78, 16],
      [-96, 10],
    ],
    half: 2.4,
  },
];

export const POOLS: ReadonlyArray<{
  id: string;
  x: number;
  z: number;
  r: number;
}> = [
  { id: "fen", x: -118, z: 6, r: 15 },
  { id: "grove", x: -92, z: -68, r: 7.2 },
  { id: "plaza-ring", x: 4, z: -118, r: 9 },
];

export const CAVES: readonly CaveDef[] = [
  {
    id: "hollow",
    mouth: [-102, 88],
    end: [-128, 112],
    half: 3.4,
    chamberR: 9.5,
    floor: 0.4,
    ceiling: 5.4,
  },
];

const RIM_START = 138;
const RIM_PEAK = ARENA_RADIUS - 2;

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in world metres. */
export function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x: number, z: number, octaves = 4): number {
  let amp = 0.55;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / (norm || 1);
}

function distToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function distToWaterway(x: number, z: number): { d: number; way: Waterway } {
  let best = WATERWAYS[0]!;
  let bestD = Infinity;
  for (const way of WATERWAYS) {
    for (let i = 0; i < way.pts.length - 1; i++) {
      const a = way.pts[i]!;
      const b = way.pts[i + 1]!;
      const d = distToSegment(x, z, a[0], a[1], b[0], b[1]);
      if (d < bestD) {
        bestD = d;
        best = way;
      }
    }
  }
  return { d: bestD, way: best };
}

export function poolDepthAt(x: number, z: number): number {
  let depth = 0;
  for (const p of POOLS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) {
      const k = 1 - d / p.r;
      depth = Math.max(depth, 0.18 + k * 0.55);
    }
  }
  return depth;
}

export function waterDepthAt(x: number, z: number): number {
  const pool = poolDepthAt(x, z);
  const { d, way } = distToWaterway(x, z);
  if (d >= way.half) return pool;
  const k = 1 - d / way.half;
  return Math.max(pool, 0.16 + k * 0.42);
}

export function isWater(x: number, z: number): boolean {
  return waterDepthAt(x, z) > 0.08;
}

function alongCave(
  x: number,
  z: number,
  cave: CaveDef,
): { t: number; d: number; inside: boolean } {
  const [ax, az] = cave.mouth;
  const [bx, bz] = cave.end;
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = ((x - ax) * dx + (z - az) * dz) / len2;
  const px = ax + dx * Math.max(0, Math.min(1, t));
  const pz = az + dz * Math.max(0, Math.min(1, t));
  const d = Math.hypot(x - px, z - pz);
  const inCorridor = t >= -0.04 && t <= 1.04 && d < cave.half;
  const inChamber = Math.hypot(x - bx, z - bz) < cave.chamberR;
  return { t, d, inside: inCorridor || inChamber };
}

export function caveAt(
  x: number,
  z: number,
): { cave: CaveDef; inside: boolean; mouth: boolean } | null {
  for (const cave of CAVES) {
    const hit = alongCave(x, z, cave);
    const mouthD = Math.hypot(x - cave.mouth[0], z - cave.mouth[1]);
    if (hit.inside || mouthD < cave.half + 1.6) {
      return { cave, inside: hit.inside, mouth: mouthD < cave.half + 2.4 && !hit.inside };
    }
  }
  return null;
}

function rimHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r < RIM_START) return 0;
  const u = fade(Math.min(1, (r - RIM_START) / (RIM_PEAK - RIM_START)));
  const peak = 14 + 10 * fbm(x * 0.035, z * 0.035, 3);
  const spikes = 4 * Math.pow(fbm(x * 0.08 + 20, z * 0.08 - 9, 2), 2);
  return u * (peak + spikes);
}

function hillHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const n = fbm(x * 0.045, z * 0.045, 4);
  let h = 0.08 + n * 0.55;

  if (x <= -20 && r > 34) {
    h += 0.35 + n * 1.8;
    const hollow = Math.hypot(x + 96, z - 86);
    if (hollow < 42) h += (1 - hollow / 42) * 5.4;
    const grove = Math.hypot(x + 92, z + 78);
    if (grove < 36) h += (1 - grove / 36) * 1.1;
  } else if (x >= 20 && r > 34) {
    h += 0.12 + n * 0.35;
    const terrace = Math.hypot(x - 98, z - 84);
    if (terrace < 22) h += (1 - terrace / 22) * 2.8;
  }

  const reg = regionAt(x, z);
  if (reg.id === "court") h *= 0.15;
  if (reg.id === "plaza") h = Math.min(h, 0.28);
  if (reg.id === "yard") h = Math.min(h, 0.35);
  if (reg.id === "fen") h = -0.35 - n * 0.2;

  return h;
}

/**
 * Ground surface Y. Water sits slightly below 0; court is near 0;
 * the rim rises into mountains so the arena edge is a ridge, not a cliff.
 * After `bakeHeightField()` this is an O(1) bilinear sample.
 */
export function computeHeightAt(x: number, z: number): number {
  const cave = caveAt(x, z);
  if (cave?.inside) return cave.cave.floor;

  const water = waterDepthAt(x, z);
  if (water > 0.08) return -water;

  const hill = hillHeight(x, z);
  const rim = rimHeight(x, z);
  let h = Math.max(hill, rim);

  if (cave?.mouth) {
    const d = Math.hypot(x - cave.cave.mouth[0], z - cave.cave.mouth[1]);
    const carve = Math.max(0, 1 - d / 6);
    h = Math.min(h, 0.55 + (1 - carve) * 1.4);
  }

  return h;
}

const FIELD_CELL = 2;
const FIELD_HALF = ARENA_RADIUS + 10;
const FIELD_N = Math.floor((FIELD_HALF * 2) / FIELD_CELL) + 1;
let field: Float32Array | null = null;

export function bakeHeightField(): void {
  const data = new Float32Array(FIELD_N * FIELD_N);
  for (let iz = 0; iz < FIELD_N; iz++) {
    for (let ix = 0; ix < FIELD_N; ix++) {
      const x = -FIELD_HALF + ix * FIELD_CELL;
      const z = -FIELD_HALF + iz * FIELD_CELL;
      data[iz * FIELD_N + ix] = computeHeightAt(x, z);
    }
  }
  field = data;
}

export function resetHeightField(): void {
  field = null;
}

export function heightAt(x: number, z: number): number {
  if (!field) return computeHeightAt(x, z);
  const u = (x + FIELD_HALF) / FIELD_CELL;
  const v = (z + FIELD_HALF) / FIELD_CELL;
  const x0 = Math.max(0, Math.min(FIELD_N - 2, Math.floor(u)));
  const z0 = Math.max(0, Math.min(FIELD_N - 2, Math.floor(v)));
  const fx = Math.max(0, Math.min(1, u - x0));
  const fz = Math.max(0, Math.min(1, v - z0));
  const i = z0 * FIELD_N + x0;
  const a = field[i]!;
  const b = field[i + 1]!;
  const c = field[i + FIELD_N]!;
  const d = field[i + FIELD_N + 1]!;
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function featureAt(x: number, z: number): TerrainFeature {
  const cave = caveAt(x, z);
  if (cave?.inside) return "cave";
  if (cave?.mouth) return "mouth";
  if (isWater(x, z)) return "water";
  if (rimHeight(x, z) > 3.5) return "ridge";
  if (hillHeight(x, z) > 2.4) return "hill";
  if (x >= 20 && Math.hypot(x, z) > 34) return "street";
  if (Math.hypot(x, z) < 34) return "court";
  return "field";
}

/** Lowest legal moth thorax Y. */
export function minFlyY(x: number, z: number): number {
  const cave = caveAt(x, z);
  if (cave?.inside) return cave.cave.floor + 1.05;
  const h = heightAt(x, z);
  if (h < -0.05) return 1.15;
  return h + 1.25;
}

/** Highest legal moth thorax Y. */
export function maxFlyY(x: number, z: number): number {
  const cave = caveAt(x, z);
  if (cave?.inside) return cave.cave.ceiling - 0.45;
  return 28;
}

/** Sample a waterway as a closed-open path for fish. u in [0, 1). */
export function waterwayPoint(
  way: Waterway,
  u: number,
): { x: number; z: number; heading: number } {
  const segs = way.pts.length - 1;
  if (segs <= 0) {
    const p = way.pts[0] ?? [0, 0];
    return { x: p[0], z: p[1], heading: 0 };
  }
  const t = ((u % 1) + 1) % 1;
  const scaled = t * segs;
  const i = Math.min(segs - 1, Math.floor(scaled));
  const f = scaled - i;
  const a = way.pts[i]!;
  const b = way.pts[i + 1]!;
  const x = a[0] + (b[0] - a[0]) * f;
  const z = a[1] + (b[1] - a[1]) * f;
  return { x, z, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

export const RETREAT = { x: -30, z: -8 } as const;
