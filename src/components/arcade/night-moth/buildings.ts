/**
 * Authored building prefabs for Night Moth.
 * Written into the shared InstancedMesh so the Ward and Acre read as places.
 */

import { LOTS, heightAt, type Lot, type PrefabId } from "@/lib/arcade/night-moth";
import type { PropWriter } from "./props";

const BRICK_A = 0x3a3028;
const BRICK_B = 0x2e2824;
const BRICK_C = 0x443830;
const CLAP = 0x2a241c;
const CLAP_PALE = 0x3a3428;
const BARN = 0x3a2018;
const BARN_DARK = 0x241410;
const ROOF = 0x1c1816;
const ROOF_TEAL = 0x1a2828;
const TRIM = 0x4a4034;
const STONE = 0x3a3630;
const IRON = 0x22261c;
const SILVER = 0x4a5058;
const WINDOW_OFF = 0x121418;
const WINDOW_WARM = 0xe0a050;
const WINDOW_COOL = 0x88a0b8;
const CROP = 0x2a4020;
const CROP_B = 0x3a5028;
const LEAF_A = 0x1a3c24;
const LEAF_B = 0x245830;
const BARK = 0x2a1c12;
const HEDGE = 0x16301c;

function local(
  ox: number,
  oz: number,
  yaw: number,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: ox + lx * c + lz * s, z: oz - lx * s + lz * c };
}

function brickFor(variant: number): number {
  return variant === 1 ? BRICK_B : variant === 2 ? BRICK_C : BRICK_A;
}

function windowLit(rng: () => number, density: number): number {
  if (rng() > density) return WINDOW_OFF;
  return rng() > 0.72 ? WINDOW_COOL : WINDOW_WARM;
}

function pane(
  w: PropWriter,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
  rng: () => number,
  density = 0.42,
): void {
  w.add(x, y, z, sx, sy, sz, yaw, windowLit(rng, density));
}

function facadeWindows(
  w: PropWriter,
  ox: number,
  oz: number,
  yaw: number,
  floors: number,
  cols: number,
  width: number,
  floorH: number,
  baseY: number,
  depth: number,
  rng: () => number,
): void {
  const span = width - 1.4;
  const step = floors > 3 ? 2 : 1;
  for (let f = 0; f < floors; f += step) {
    for (let c = 0; c < cols; c++) {
      if (floors > 3 && c % 2 === 1) continue;
      const u = cols === 1 ? 0 : (c / (cols - 1) - 0.5) * span;
      const p = local(ox, oz, yaw, u, depth / 2 + 0.06);
      pane(w, p.x, baseY + f * floorH, p.z, 0.42, 0.55, 0.08, yaw, rng);
    }
  }
}

export function rowHouse(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw, variant } = lot;
  const brick = brickFor(variant);
  const wdt = 7.2 + variant * 0.4;
  const dpt = 6.4;
  const floors = 2 + (variant === 1 ? 1 : 0);
  const h = 2.4 + floors * 2.15;
  w.add(x, h * 0.45, z, wdt, h * 0.9, dpt, yaw, brick);
  const roof = local(x, z, yaw, 0, 0);
  w.add(roof.x, h + 0.15, roof.z, wdt + 0.4, 0.55, dpt + 0.35, yaw, variant === 2 ? ROOF_TEAL : ROOF);
  const stoop = local(x, z, yaw, 0, dpt / 2 + 0.45);
  w.add(stoop.x, 0.22, stoop.z, 1.6, 0.4, 0.7, yaw, STONE);
  const door = local(x, z, yaw, 0, dpt / 2 + 0.08);
  w.add(door.x, 1.05, door.z, 0.7, 1.5, 0.1, yaw, TRIM);
  facadeWindows(w, x, z, yaw, floors, 3, wdt, 2.15, 2.4, dpt, rng);
  const back = local(x, z, yaw, 0, -dpt / 2);
  facadeWindows(w, back.x, back.z, yaw + Math.PI, floors, 2, wdt - 1, 2.15, 2.4, 0.2, rng);
  if (variant === 0) {
    const chim = local(x, z, yaw, wdt * 0.28, -0.4);
    w.add(chim.x, h + 0.7, chim.z, 0.45, 1.1, 0.45, yaw, 0x2a201c);
  }
}

export function walkUp(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw, variant } = lot;
  const brick = brickFor(variant);
  const wdt = 8.6;
  const dpt = 7.4;
  const floors = 4 + variant;
  const h = 2.2 + floors * 2.25;
  w.add(x, h * 0.48, z, wdt, h * 0.96, dpt, yaw, brick);
  w.add(x, h + 0.12, z, wdt + 0.3, 0.28, dpt + 0.3, yaw, ROOF);
  const cornice = local(x, z, yaw, 0, dpt / 2 + 0.08);
  w.add(cornice.x, h - 0.15, cornice.z, wdt + 0.2, 0.22, 0.18, yaw, TRIM);
  const door = local(x, z, yaw, 0, dpt / 2 + 0.08);
  w.add(door.x, 1.2, door.z, 1.1, 1.8, 0.12, yaw, 0x1a1612);
  facadeWindows(w, x, z, yaw, floors, 4, wdt, 2.25, 2.55, dpt, rng);
  const left = local(x, z, yaw, -wdt / 2, 0);
  facadeWindows(w, left.x, left.z, yaw - Math.PI / 2, floors, 3, dpt, 2.25, 2.55, 0.2, rng);
  const right = local(x, z, yaw, wdt / 2, 0);
  facadeWindows(w, right.x, right.z, yaw + Math.PI / 2, floors, 3, dpt, 2.25, 2.55, 0.2, rng);
  // Quiet rooftop water tank
  const tank = local(x, z, yaw, 1.4, -0.8);
  w.add(tank.x, h + 0.85, tank.z, 1.4, 1.4, 1.4, yaw, SILVER);
}

export function shopfront(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw, variant } = lot;
  const wdt = 8.2;
  const dpt = 6.2;
  const h = 5.4;
  w.add(x, h * 0.48, z, wdt, h * 0.96, dpt, yaw, variant === 1 ? CLAP_PALE : brickFor(variant));
  w.add(x, h + 0.2, z, wdt + 0.35, 0.4, dpt + 0.3, yaw, ROOF);
  const awning = local(x, z, yaw, 0, dpt / 2 + 0.55);
  w.add(awning.x, 2.35, awning.z, wdt - 0.4, 0.12, 1.1, yaw, 0x4a3020);
  const glass = local(x, z, yaw, 0, dpt / 2 + 0.06);
  pane(w, glass.x - 1.6, 1.15, glass.z, 2.2, 1.6, 0.08, yaw, rng, 0.85);
  pane(w, glass.x + 1.6, 1.15, glass.z, 2.2, 1.6, 0.08, yaw, rng, 0.85);
  facadeWindows(w, x, z, yaw, 1, 3, wdt, 2.2, 3.7, dpt, rng);
}

export function warehouse(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw, variant } = lot;
  const wdt = 11.5;
  const dpt = 8.4;
  const h = 5.8 + variant * 0.6;
  w.add(x, h * 0.48, z, wdt, h * 0.96, dpt, yaw, 0x2a2c30);
  w.add(x, h + 0.2, z, wdt + 0.4, 0.45, dpt + 0.3, yaw, 0x1c2024);
  const door = local(x, z, yaw, 0, dpt / 2 + 0.06);
  w.add(door.x, 1.8, door.z, 3.2, 3.4, 0.12, yaw, IRON);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const p = local(x, z, yaw, i * 2.1, dpt / 2 + 0.06);
    pane(w, p.x, 3.6, p.z, 0.7, 0.45, 0.08, yaw, rng, 0.28);
  }
  const vent = local(x, z, yaw, -3.4, -1);
  w.add(vent.x, h + 0.7, vent.z, 1.1, 0.8, 1.1, yaw, IRON);
}

export function farmhouse(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw } = lot;
  const wdt = 9.2;
  const dpt = 7.6;
  const h = 4.8;
  w.add(x, h * 0.48, z, wdt, h * 0.96, dpt, yaw, CLAP);
  w.add(x, h + 0.55, z, wdt + 0.8, 1.15, dpt + 0.5, yaw, ROOF);
  const wing = local(x, z, yaw, 5.4, 0.4);
  w.add(wing.x, 1.7, wing.z, 4.2, 3.2, 5.4, yaw, CLAP_PALE);
  w.add(wing.x, 3.55, wing.z, 4.8, 0.85, 6.0, yaw, ROOF);
  const porch = local(x, z, yaw, 0, dpt / 2 + 1.1);
  w.add(porch.x, 1.15, porch.z, 6.4, 0.14, 2.2, yaw, 0x3a3228);
  for (const s of [-2.6, 2.6]) {
    const post = local(x, z, yaw, s, dpt / 2 + 1.9);
    w.add(post.x, 1.7, post.z, 0.16, 2.2, 0.16, yaw, TRIM);
  }
  const door = local(x, z, yaw, 0, dpt / 2 + 0.08);
  w.add(door.x, 1.25, door.z, 0.85, 1.8, 0.1, yaw, 0x3a2818);
  facadeWindows(w, x, z, yaw, 2, 3, wdt, 1.9, 1.7, dpt, rng);
  const chim = local(x, z, yaw, -2.8, -1.2);
  w.add(chim.x, h + 1.3, chim.z, 0.7, 1.6, 0.7, yaw, 0x2a201c);
}

export function barn(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw } = lot;
  const wdt = 12.4;
  const dpt = 8.8;
  const h = 6.4;
  w.add(x, h * 0.46, z, wdt, h * 0.92, dpt, yaw, BARN);
  w.add(x, h + 0.7, z, wdt + 0.6, 1.5, dpt + 0.4, yaw, BARN_DARK);
  const door = local(x, z, yaw, 0, dpt / 2 + 0.08);
  w.add(door.x, 2.1, door.z, 3.6, 3.8, 0.12, yaw, 0x2a1812);
  const loft = local(x, z, yaw, 0, dpt / 2 + 0.08);
  pane(w, loft.x, 5.1, loft.z, 1.4, 1.1, 0.1, yaw, rng, 0.55);
  for (const s of [-4.2, 4.2]) {
    const p = local(x, z, yaw, s, dpt / 2 + 0.06);
    pane(w, p.x, 2.4, p.z, 0.7, 0.7, 0.08, yaw, rng, 0.3);
  }
}

export function silo(w: PropWriter, lot: Lot, _rng: () => number): void {
  const { x, z } = lot;
  w.add(x, 3.4, z, 2.6, 6.8, 2.6, 0, SILVER);
  w.add(x, 7.1, z, 2.9, 0.7, 2.9, 0, 0x3a4048);
  w.add(x, 7.7, z, 1.4, 0.55, 1.4, 0, IRON);
}

export function shed(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw, variant } = lot;
  const wdt = 3.6 + variant * 0.4;
  const dpt = 3.2;
  const h = 2.4;
  w.add(x, h * 0.5, z, wdt, h, dpt, yaw, variant === 2 ? BARN : CLAP);
  w.add(x, h + 0.25, z, wdt + 0.35, 0.45, dpt + 0.25, yaw, ROOF);
  const door = local(x, z, yaw, 0, dpt / 2 + 0.05);
  w.add(door.x, 0.95, door.z, 0.9, 1.5, 0.08, yaw, TRIM);
  const win = local(x, z, yaw, wdt * 0.28, dpt / 2 + 0.05);
  pane(w, win.x, 1.35, win.z, 0.45, 0.4, 0.06, yaw, rng, 0.35);
}

export function boiler(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw } = lot;
  w.add(x, 2.1, z, 8.4, 4.0, 6.6, yaw, 0x2a2420);
  w.add(x, 4.3, z, 8.8, 0.4, 7.0, yaw, IRON);
  const stack = local(x, z, yaw, 2.2, -1.2);
  w.add(stack.x, 5.6, stack.z, 1.1, 3.4, 1.1, yaw, 0x1c1612);
  w.add(stack.x, 7.4, stack.z, 1.3, 0.25, 1.3, yaw, IRON);
  const mouth = local(x, z, yaw, 0, 3.4);
  w.add(mouth.x, 1.15, mouth.z, 2.2, 1.8, 0.2, yaw, 0x1a0804);
  pane(w, mouth.x, 1.15, mouth.z + 0.08, 1.4, 1.1, 0.08, yaw, rng, 0.9);
  const coal = local(x, z, yaw, -3.2, 2.4);
  w.add(coal.x, 0.35, coal.z, 2.4, 0.55, 1.8, yaw, 0x121010);
}

export function streetLamp(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z } = lot;
  w.add(x, 1.55, z, 0.1, 3.1, 0.1, 0, 0x2a2824);
  w.add(x, 3.15, z, 0.55, 0.16, 0.55, 0, 0x3a3228);
  // Dim furniture light — occupancy, not a true lamp.
  w.add(x, 3.02, z, 0.28, 0.12, 0.28, 0, rng() > 0.18 ? 0xc4a060 : 0x3a3428);
}

export function orchardTree(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, variant } = lot;
  const h = 2.4 + variant * 0.45;
  w.add(x, h * 0.45, z, 0.32, h, 0.32, 0, BARK);
  const cy = h + 0.55;
  w.add(x, cy, z, 1.8 + rng() * 0.3, 1.25, 1.8, rng() * 0.4, LEAF_A);
  w.add(x + 0.65, cy - 0.1, z + 0.15, 1.05, 0.85, 1.05, 0.3, LEAF_B);
}

export function hedgerow(w: PropWriter, lot: Lot, _rng: () => number): void {
  const { x, z, yaw, variant } = lot;
  const len = 8 + variant * 2;
  w.add(x, 0.7, z, len, 1.15, 0.48, yaw, HEDGE);
  w.add(x, 1.35, z, len * 0.92, 0.35, 0.55, yaw, LEAF_B);
}

/** Archive west, chill east — the moth's house after Hours. */
export function retreat(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw } = lot;
  const archive = local(x, z, yaw, -2.6, 0);
  const chill = local(x, z, yaw, 2.8, 0.2);
  w.add(archive.x, 2.15, archive.z, 5.6, 4.1, 7.2, yaw, 0x2a3038);
  w.add(archive.x, 4.35, archive.z, 6.0, 0.45, 7.6, yaw, 0x1a2228);
  w.add(chill.x, 1.85, chill.z, 5.2, 3.5, 6.4, yaw, CLAP_PALE);
  w.add(chill.x, 3.85, chill.z, 5.7, 0.7, 6.9, yaw, ROOF);
  const porch = local(x, z, yaw, 2.6, 4.1);
  w.add(porch.x, 0.85, porch.z, 4.4, 0.14, 2.0, yaw, 0x3a3228);
  for (const s of [-1.6, 1.6]) {
    const post = local(x, z, yaw, 2.6 + s * 0.1, 4.9);
    w.add(post.x, 1.5, post.z, 0.14, 1.8, 0.14, yaw, TRIM);
  }
  const door = local(x, z, yaw, 0.4, 3.7);
  w.add(door.x, 1.2, door.z, 0.8, 1.7, 0.1, yaw, 0x3a2818);
  facadeWindows(w, archive.x, archive.z, yaw, 2, 3, 5.2, 1.7, 1.5, 7.2, rng);
  facadeWindows(w, chill.x, chill.z, yaw, 1, 2, 4.4, 1.8, 1.5, 6.4, rng);
  // Cool archive panes vs warm chill lamp.
  const cool = local(x, z, yaw, -2.6, 3.65);
  pane(w, cool.x, 2.1, cool.z, 1.6, 1.1, 0.08, yaw, rng, 0.95);
  const warm = local(x, z, yaw, 2.8, 3.35);
  pane(w, warm.x, 1.7, warm.z, 1.4, 1.0, 0.08, yaw, rng, 0.95);
  const stacks = local(x, z, yaw, -3.6, -1.4);
  w.add(stacks.x, 1.4, stacks.z, 0.35, 2.4, 2.6, yaw, 0x3a3026);
  w.add(stacks.x + 0.5, 1.4, stacks.z, 0.35, 2.4, 2.6, yaw, 0x322820);
}

export function cropRow(w: PropWriter, lot: Lot, rng: () => number): void {
  const { x, z, yaw } = lot;
  for (let i = -5; i <= 5; i++) {
    const p = local(x, z, yaw, i * 0.85, (rng() - 0.5) * 0.2);
    const h = 0.45 + rng() * 0.35;
    w.add(p.x, h * 0.5, p.z, 0.22, h, 0.22, yaw, rng() > 0.5 ? CROP : CROP_B);
  }
}

const BUILDERS: Record<PrefabId, (w: PropWriter, lot: Lot, rng: () => number) => void> = {
  "row-house": rowHouse,
  "walk-up": walkUp,
  shopfront,
  warehouse,
  farmhouse,
  barn,
  silo,
  shed,
  boiler,
  "street-lamp": streetLamp,
  "orchard-tree": orchardTree,
  hedgerow,
  "crop-row": cropRow,
  retreat,
};

export function populateDistricts(w: PropWriter, rng: () => number): void {
  const lifted: PropWriter = {
    add(x, y, z, sx, sy, sz, rotY, color) {
      w.add(x, y + heightAt(x, z), z, sx, sy, sz, rotY, color);
    },
  };
  for (const lot of LOTS) {
    BUILDERS[lot.prefab](lifted, lot, rng);
  }
}
