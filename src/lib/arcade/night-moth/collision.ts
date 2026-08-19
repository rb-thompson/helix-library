/**
 * Building / foliage colliders. Pure. Engine resolves the moth against these.
 */

import { LOTS, type PrefabId } from "./districts";
import { REGIONS } from "./regions";
import { heightAt } from "./terrain";

export type ColliderKind = "solid" | "soft";

export type Collider = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  kind: ColliderKind;
};

const PREFAB_BOX: Record<
  PrefabId,
  { hx: number; hz: number; hy: number; kind: ColliderKind } | null
> = {
  "row-house": { hx: 3.8, hz: 3.4, hy: 4.5, kind: "solid" },
  "walk-up": { hx: 4.5, hz: 3.9, hy: 8.2, kind: "solid" },
  shopfront: { hx: 4.3, hz: 3.3, hy: 3.4, kind: "solid" },
  warehouse: { hx: 5.9, hz: 4.4, hy: 3.8, kind: "solid" },
  farmhouse: { hx: 5.8, hz: 4.8, hy: 3.6, kind: "solid" },
  barn: { hx: 6.4, hz: 4.6, hy: 4.4, kind: "solid" },
  silo: { hx: 1.6, hz: 1.6, hy: 4.2, kind: "solid" },
  shed: { hx: 2.1, hz: 1.8, hy: 1.7, kind: "solid" },
  boiler: { hx: 4.4, hz: 3.5, hy: 3.2, kind: "solid" },
  retreat: { hx: 5.6, hz: 4.4, hy: 3.2, kind: "solid" },
  "street-lamp": { hx: 0.22, hz: 0.22, hy: 1.7, kind: "solid" },
  "orchard-tree": { hx: 1.0, hz: 1.0, hy: 2.4, kind: "solid" },
  hedgerow: { hx: 4.5, hz: 0.4, hy: 0.95, kind: "solid" },
  "crop-row": { hx: 4.6, hz: 0.35, hy: 0.45, kind: "solid" },
};

export function lampCollider(x: number, z: number, groundY: number): Collider {
  return {
    x,
    y: groundY + 1.35,
    z,
    hx: 0.68,
    hy: 1.45,
    hz: 0.68,
    yaw: 0,
    kind: "solid",
  };
}

export function colliderForLot(lot: {
  prefab: PrefabId;
  x: number;
  z: number;
  yaw: number;
}): Collider | null {
  const spec = PREFAB_BOX[lot.prefab];
  if (!spec) return null;
  const ground = heightAt(lot.x, lot.z);
  return {
    x: lot.x,
    y: ground + spec.hy,
    z: lot.z,
    hx: spec.hx,
    hy: spec.hy,
    hz: spec.hz,
    yaw: lot.yaw,
    kind: spec.kind,
  };
}

/** Habitat noir towers — not lots, still brick. */
const TOWERS: ReadonlyArray<{ x: number; z: number; floors: number }> = [
  { x: REGIONS.stacks.x + 18, z: REGIONS.stacks.z + 4, floors: 5 },
  { x: REGIONS.terrace.x - 16, z: REGIONS.terrace.z - 8, floors: 4 },
  { x: 22, z: -22, floors: 4 },
];

export function buildingColliders(): Collider[] {
  const out: Collider[] = [];
  for (const lot of LOTS) {
    const c = colliderForLot(lot);
    if (c) out.push(c);
  }
  for (const t of TOWERS) {
    const bodyH = 3.1 + t.floors * 3.4;
    const ground = heightAt(t.x, t.z);
    out.push({
      x: t.x,
      y: ground + bodyH * 0.5,
      z: t.z,
      hx: 3.95,
      hy: bodyH * 0.5 + 0.2,
      hz: 3.95,
      yaw: 0,
      kind: "solid",
    });
  }
  return out;
}

/**
 * Highest solid roof the moth is standing over.
 * `y` is thorax height; slack lets a descending moth catch the top face.
 */
export function supportY(
  x: number,
  y: number,
  z: number,
  radius: number,
  boxes: readonly Collider[],
  slack = 1.35,
): number | null {
  let best: number | null = null;
  for (const b of boxes) {
    if (b.kind !== "solid") continue;
    const c = Math.cos(-b.yaw);
    const s = Math.sin(-b.yaw);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) > b.hx + radius * 0.35) continue;
    if (Math.abs(lz) > b.hz + radius * 0.35) continue;
    const top = b.y + b.hy;
    if (y + radius < top - slack) continue;
    if (best == null || top > best) best = top;
  }
  return best;
}

export type ColliderIndex = {
  cell: number;
  buckets: Map<number, Collider[]>;
};

function cellKey(ix: number, iz: number): number {
  return ((ix + 512) << 16) | (iz + 512);
}

export function indexColliders(boxes: readonly Collider[], cell = 16): ColliderIndex {
  const buckets = new Map<number, Collider[]>();
  for (const b of boxes) {
    const pad = Math.max(b.hx, b.hz) + 1;
    const x0 = Math.floor((b.x - pad) / cell);
    const x1 = Math.floor((b.x + pad) / cell);
    const z0 = Math.floor((b.z - pad) / cell);
    const z1 = Math.floor((b.z + pad) / cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = cellKey(ix, iz);
        const list = buckets.get(k);
        if (list) list.push(b);
        else buckets.set(k, [b]);
      }
    }
  }
  return { cell, buckets };
}

export function nearbyColliders(
  index: ColliderIndex,
  x: number,
  z: number,
  radius = 8,
  dest?: Collider[],
): Collider[] {
  const out = dest ?? [];
  if (dest) dest.length = 0;
  const ix = Math.floor(x / index.cell);
  const iz = Math.floor(z / index.cell);
  const span = Math.max(1, Math.ceil(radius / index.cell));
  const seen = dest ? null : new Set<Collider>();
  for (let dx = -span; dx <= span; dx++) {
    for (let dz = -span; dz <= span; dz++) {
      const list = index.buckets.get(cellKey(ix + dx, iz + dz));
      if (!list) continue;
      for (const b of list) {
        if (seen) {
          if (seen.has(b)) continue;
          seen.add(b);
        } else if (out.includes(b)) {
          continue;
        }
        out.push(b);
      }
    }
  }
  return out;
}

export type HitResult = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hit: boolean;
  kind: ColliderKind | null;
};

function closestOnAabb(
  lx: number,
  ly: number,
  lz: number,
  hx: number,
  hy: number,
  hz: number,
): { x: number; y: number; z: number } {
  return {
    x: Math.max(-hx, Math.min(hx, lx)),
    y: Math.max(-hy, Math.min(hy, ly)),
    z: Math.max(-hz, Math.min(hz, lz)),
  };
}

/**
 * Push a sphere out of authored colliders. Soft bodies only slow/graze.
 */
export function resolveSphere(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  radius: number,
  boxes: readonly Collider[],
): HitResult {
  let hit = false;
  let kind: ColliderKind | null = null;
  let px = x;
  let py = y;
  let pz = z;
  let ovx = vx;
  let ovy = vy;
  let ovz = vz;

  for (const b of boxes) {
    const c = Math.cos(-b.yaw);
    const s = Math.sin(-b.yaw);
    const dx = px - b.x;
    const dz = pz - b.z;
    const lx = dx * c - dz * s;
    const ly = py - b.y;
    const lz = dx * s + dz * c;
    const top = b.y + b.hy;
    const overFoot =
      Math.abs(lx) <= b.hx + radius * 0.4 && Math.abs(lz) <= b.hz + radius * 0.4;
    if (
      b.kind === "solid" &&
      overFoot &&
      ovy <= 0.8 &&
      py >= top - 1.5 &&
      py <= top + radius + 0.35
    ) {
      py = top + radius;
      ovy = Math.max(0, ovy);
      hit = true;
      kind = "solid";
      continue;
    }
    const inside =
      Math.abs(lx) <= b.hx && Math.abs(ly) <= b.hy && Math.abs(lz) <= b.hz;
    let nx: number;
    let ny: number;
    let nz: number;
    if (inside) {
      const ox = b.hx - Math.abs(lx);
      const oy = b.hy - Math.abs(ly);
      const oz = b.hz - Math.abs(lz);
      if (ox <= oy && ox <= oz) {
        nx = (lx >= 0 ? 1 : -1) * (ox + radius);
        ny = 0;
        nz = 0;
      } else if (oy <= oz) {
        nx = 0;
        ny = (ly >= 0 ? 1 : -1) * (oy + radius);
        nz = 0;
      } else {
        nx = 0;
        ny = 0;
        nz = (lz >= 0 ? 1 : -1) * (oz + radius);
      }
    } else {
      const q = closestOnAabb(lx, ly, lz, b.hx, b.hy, b.hz);
      const ex = lx - q.x;
      const ey = ly - q.y;
      const ez = lz - q.z;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= radius * radius || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      nx = ex * push;
      ny = ey * push;
      nz = ez * push;
    }
    const wx = nx * c + nz * s;
    const wz = -nx * s + nz * c;

    if (b.kind === "soft") {
      ovx *= 0.72;
      ovz *= 0.72;
      px += wx * 0.35;
      py += ny * 0.35;
      pz += wz * 0.35;
      hit = true;
      kind = kind ?? "soft";
      continue;
    }

    px += wx;
    py += ny;
    pz += wz;
    const vn = ovx * wx + ovy * ny + ovz * wz;
    if (vn < 0) {
      const k = vn / Math.max(1e-6, wx * wx + ny * ny + wz * wz);
      ovx -= wx * k;
      ovy -= ny * k;
      ovz -= wz * k;
    }
    ovx *= 0.35;
    ovz *= 0.35;
    hit = true;
    kind = "solid";
  }

  return { x: px, y: py, z: pz, vx: ovx, vy: ovy, vz: ovz, hit, kind };
}
