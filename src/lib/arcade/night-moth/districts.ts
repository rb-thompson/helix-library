/**
 * Authored Night Moth grounds — The Ward (east city) and The Acre (west farm).
 * Pure data. Engine and voxel builders consume this; they do not invent the map.
 */

import { ARENA_RADIUS } from "./catalog";
import { REGIONS, regionAt, type RegionId } from "./regions";
import { isWater, heightAt } from "./terrain";

export type DistrictId = "ward" | "acre" | "green";

export type DistrictDef = {
  id: DistrictId;
  name: string;
};

export type LandUse =
  | "asphalt"
  | "sidewalk"
  | "lot"
  | "dirt"
  | "field"
  | "orchard"
  | "plaza"
  | "park"
  | "reed"
  | "yard"
  | "stone"
  | "soil"
  | "water"
  | "ridge";

export type PrefabId =
  | "row-house"
  | "walk-up"
  | "shopfront"
  | "warehouse"
  | "farmhouse"
  | "barn"
  | "silo"
  | "shed"
  | "boiler"
  | "street-lamp"
  | "orchard-tree"
  | "hedgerow"
  | "crop-row"
  | "retreat";

export type Lot = {
  prefab: PrefabId;
  x: number;
  z: number;
  yaw: number;
  /** 0–2 massing / window variant. */
  variant: 0 | 1 | 2;
};

export type LampSocket = {
  x: number;
  z: number;
  region: RegionId;
  hint: string;
};

export const DISTRICT: Record<DistrictId, DistrictDef> = {
  ward: { id: "ward", name: "The Ward" },
  acre: { id: "acre", name: "The Acre" },
  green: { id: "green", name: "The grounds" },
};

/** North–south street centerlines (The Ward). Kenney-ish 22 m blocks. */
export const WARD_NS = [28, 50, 72, 94, 116, 138] as const;
/** East–west street centerlines (The Ward). */
export const WARD_EW = [-110, -88, -66, -44, -22, 0, 22, 44, 66, 88, 110] as const;

export const STREET_HALF = 3.8;
export const WALK_HALF = 5.8;

const COURT_KEEP = 34;

/** Dirt lanes on The Acre — farmhouse, barn, grove, hollow, fen. */
export const ACRE_LANES: ReadonlyArray<readonly [number, number, number, number]> = [
  [-18, 4, -48, 28],
  [-48, 28, -78, 50],
  [-78, 50, -96, 86],
  [-48, 28, -92, -78],
  [-48, 28, -118, 8],
  [-78, 50, -40, 70],
];

const LANE_HALF = 2.6;

export function districtAt(x: number, z: number): DistrictDef {
  const r = Math.hypot(x, z);
  if (r < COURT_KEEP) return DISTRICT.green;
  if (x >= 20) return DISTRICT.ward;
  if (x <= -20) return DISTRICT.acre;
  return DISTRICT.green;
}

export function districtLabel(x: number, z: number, regionName: string): string {
  const d = districtAt(x, z);
  if (d.id === "green") return regionName;
  return `${d.name} · ${regionName}`;
}

function onStreet(x: number, z: number): boolean {
  if (x < 20 || Math.hypot(x, z) < COURT_KEEP) return false;
  for (const s of WARD_NS) {
    if (Math.abs(x - s) < STREET_HALF && z > -124 && z < 124) return true;
  }
  for (const s of WARD_EW) {
    if (Math.abs(z - s) < STREET_HALF && x > 20 && x < 150) return true;
  }
  return false;
}

function onSidewalk(x: number, z: number): boolean {
  if (x < 20 || Math.hypot(x, z) < COURT_KEEP) return false;
  for (const s of WARD_NS) {
    if (Math.abs(x - s) < WALK_HALF && z > -124 && z < 124) return true;
  }
  for (const s of WARD_EW) {
    if (Math.abs(z - s) < WALK_HALF && x > 20 && x < 150) return true;
  }
  return false;
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

function onLane(x: number, z: number): boolean {
  if (x > -8) return false;
  for (const [ax, az, bx, bz] of ACRE_LANES) {
    if (distToSegment(x, z, ax, az, bx, bz) < LANE_HALF) return true;
  }
  return false;
}

export function landUseAt(x: number, z: number): LandUse {
  const r = Math.hypot(x, z);
  if (r > ARENA_RADIUS - 2) return "ridge";
  if (isWater(x, z)) return "water";
  if (heightAt(x, z) > 8.5) return "ridge";
  if (onStreet(x, z)) return "asphalt";
  if (onSidewalk(x, z)) return "sidewalk";

  const reg = regionAt(x, z);
  const dReg = Math.hypot(x - reg.x, z - reg.z);

  if (reg.id === "plaza" && dReg < 22) return "plaza";
  if (reg.id === "court" && dReg < 28) return "park";
  if (reg.id === "yard" && dReg < 20) return "yard";
  if (reg.id === "fen" && dReg < 28) return "reed";
  if (reg.id === "grove" && dReg < 32) return "orchard";
  if (reg.id === "hollow" && dReg < 18) return "stone";
  if (onLane(x, z)) return "dirt";

  const d = districtAt(x, z);
  if (d.id === "ward") return "lot";
  if (d.id === "acre") {
    if (dReg < 14 && (reg.id === "hollow" || reg.id === "grove")) return "dirt";
    return "field";
  }
  return "soil";
}

export const LAND_COLOR: Record<LandUse, number> = {
  asphalt: 0x1a1c22,
  sidewalk: 0x2a2c30,
  lot: 0x18161a,
  dirt: 0x2a2218,
  field: 0x1a2014,
  orchard: 0x162016,
  plaza: 0x2a2a2c,
  park: 0x1c1a16,
  reed: 0x16101c,
  yard: 0x121610,
  stone: 0x1c1410,
  soil: 0x161410,
  water: 0x0a2430,
  ridge: 0x1a1816,
};

function yawToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function skipBlock(cx: number, cz: number): boolean {
  if (Math.hypot(cx, cz) < COURT_KEEP + 6) return true;
  if (cz < -100 && Math.abs(cx) < 28) return true;
  if (cz > 92 && Math.abs(cx) < 26) return true;
  if (Math.hypot(cx - 96, cz + 82) < 10) return true;
  return false;
}

function buildLots(): Lot[] {
  const lots: Lot[] = [];

  for (let i = 0; i < WARD_NS.length - 1; i++) {
    for (let j = 0; j < WARD_EW.length - 1; j++) {
      const x0 = WARD_NS[i]!;
      const x1 = WARD_NS[i + 1]!;
      const z0 = WARD_EW[j]!;
      const z1 = WARD_EW[j + 1]!;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (skipBlock(cx, cz)) continue;

      const inset = STREET_HALF + 3.4;
      const faces: Array<{ x: number; z: number; yaw: number; kind: PrefabId }> = [
        { x: cx, z: z0 + inset, yaw: 0, kind: "row-house" },
        { x: cx, z: z1 - inset, yaw: Math.PI, kind: "row-house" },
        { x: x0 + inset, z: cz, yaw: Math.PI / 2, kind: "row-house" },
        { x: x1 - inset, z: cz, yaw: -Math.PI / 2, kind: "row-house" },
      ];

      const tall = (i + j) % 4 === 0;
      const shop = (i + j) % 5 === 2;
      const ware = j >= 8 && i >= 1;

      faces.forEach((f, n) => {
        let prefab: PrefabId = f.kind;
        if (tall && n === 0) prefab = "walk-up";
        else if (shop && n === 2) prefab = "shopfront";
        else if (ware && n === 1) prefab = "warehouse";
        lots.push({
          prefab,
          x: f.x,
          z: f.z,
          yaw: f.yaw,
          variant: ((i * 3 + j + n) % 3) as 0 | 1 | 2,
        });
      });
    }
  }

  // Street lamps along Ward avenues — furniture, not sip-able.
  for (const x of WARD_NS) {
    for (let z = -104; z <= 104; z += 22) {
      if (Math.hypot(x, z) < COURT_KEEP + 4) continue;
      if (Math.abs(z) < 8 && x < 40) continue;
      lots.push({
        prefab: "street-lamp",
        x: x + 4.4,
        z,
        yaw: 0,
        variant: 0,
      });
    }
  }

  // The retreat — moth's house after Hours. Archive west, chill east.
  // Stand-in until the owner's photo ref is in; rooms stay two-up.
  lots.push({
    prefab: "retreat",
    x: -30,
    z: -8,
    yaw: yawToward(-30, -8, 0, 0),
    variant: 0,
  });

  // Landmark buildings — farmstead.
  lots.push(
    { prefab: "farmhouse", x: -48, z: 28, yaw: yawToward(-48, 28, -18, 4), variant: 0 },
    { prefab: "barn", x: -78, z: 50, yaw: yawToward(-78, 50, -48, 28), variant: 0 },
    { prefab: "silo", x: -70, z: 58, yaw: 0, variant: 0 },
    { prefab: "shed", x: -58, z: 38, yaw: 0.4, variant: 1 },
    { prefab: "shed", x: -86, z: 40, yaw: -0.3, variant: 2 },
    { prefab: "shed", x: -40, z: 42, yaw: 1.1, variant: 0 },
    { prefab: "boiler", x: -96, z: 86, yaw: 0.2, variant: 0 },
    { prefab: "shed", x: -108, z: 78, yaw: 0.6, variant: 1 },
    { prefab: "shed", x: -84, z: 94, yaw: -0.8, variant: 2 },
  );

  // Orchard in the reading grove.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + 0.18;
    const rad = 10 + (i % 3) * 7;
    lots.push({
      prefab: "orchard-tree",
      x: -92 + Math.cos(a) * rad,
      z: -78 + Math.sin(a) * rad,
      yaw: a,
      variant: (i % 3) as 0 | 1 | 2,
    });
  }
  lots.push({ prefab: "shed", x: -78, z: -64, yaw: -0.5, variant: 0 });

  // Hedgerows framing the acre lanes and paddock.
  lots.push(
    { prefab: "hedgerow", x: -36, z: 18, yaw: 0.9, variant: 0 },
    { prefab: "hedgerow", x: -62, z: 34, yaw: 0.55, variant: 0 },
    { prefab: "hedgerow", x: -70, z: 64, yaw: 0.1, variant: 1 },
    { prefab: "hedgerow", x: -52, z: 54, yaw: 1.2, variant: 0 },
    { prefab: "hedgerow", x: -100, z: -50, yaw: 1.4, variant: 1 },
  );

  // Crop rows in the open acre fields.
  for (let i = 0; i < 7; i++) {
    lots.push({
      prefab: "crop-row",
      x: -34 - i * 3.2,
      z: 62 + (i % 2) * 1.4,
      yaw: 0.15,
      variant: (i % 3) as 0 | 1 | 2,
    });
  }
  for (let i = 0; i < 6; i++) {
    lots.push({
      prefab: "crop-row",
      x: -58 - i * 2.8,
      z: -20 + i * 0.4,
      yaw: 1.35,
      variant: ((i + 1) % 3) as 0 | 1 | 2,
    });
  }

  // Industrial sheds boxing the cage yard.
  lots.push(
    { prefab: "warehouse", x: 28, z: 108, yaw: -Math.PI / 2, variant: 1 },
    { prefab: "warehouse", x: -16, z: 118, yaw: Math.PI / 2, variant: 2 },
    { prefab: "warehouse", x: 8, z: 132, yaw: Math.PI, variant: 0 },
  );

  return lots;
}

export const LOTS: readonly Lot[] = buildLots();

function socket(x: number, z: number, hint: string): LampSocket {
  return { x, z, region: regionAt(x, z).id, hint };
}

export const LAMP_SOCKETS: readonly LampSocket[] = [
  // Court — park edge, keep the interior open for the tutorial.
  socket(0, -18, "south walk"),
  socket(14, 2, "east hedge"),
  socket(-14, 4, "west hedge"),
  socket(0, 18, "north walk"),
  socket(8, -12, "cart path"),
  socket(-8, -12, "cart path"),
  socket(10, 10, "corner"),
  socket(-10, 10, "corner"),

  // Grove / orchard
  socket(-80, -70, "orchard edge"),
  socket(-100, -88, "canopy"),
  socket(-78, -60, "reading shed"),
  socket(-108, -70, "west trees"),
  socket(-92, -52, "lane end"),
  socket(-70, -84, "south grove"),

  // Stacks / archive courtyard
  socket(96, -82, "shelf court"),
  socket(88, -74, "west alley"),
  socket(104, -90, "east stack"),
  socket(86, -88, "back court"),
  socket(108, -76, "front court"),
  socket(96, -68, "north alley"),
  socket(80, -82, "side street"),

  // Terrace / helix mid-rise
  socket(98, 84, "helix roof walk"),
  socket(90, 76, "south alley"),
  socket(108, 90, "east terrace"),
  socket(86, 88, "west court"),
  socket(110, 76, "corner lot"),
  socket(98, 70, "street front"),

  // Yard
  socket(8, 108, "cage center"),
  socket(18, 100, "east fence"),
  socket(-4, 116, "north lot"),
  socket(20, 116, "warehouse wall"),
  socket(-8, 100, "west fence"),
  socket(8, 94, "gate"),

  // Hollow / boiler
  socket(-96, 80, "boiler door"),
  socket(-88, 78, "coal yard"),
  socket(-104, 92, "stack side"),
  socket(-86, 94, "east shed"),
  socket(-108, 80, "west shed"),
  socket(-96, 98, "behind boiler"),

  // Fen
  socket(-118, 6, "wisp pool"),
  socket(-108, 14, "reed bank"),
  socket(-126, -4, "west fen"),
  socket(-110, -8, "south bank"),
  socket(-124, 16, "north reed"),
  socket(-100, 6, "lane to fen"),

  // Plaza
  socket(4, -118, "moon court"),
  socket(14, -110, "east ring"),
  socket(-8, -124, "west ring"),
  socket(16, -124, "far ring"),
  socket(-10, -110, "south ring"),
  socket(4, -104, "approach"),

  // Extra Ward interiors (hide-and-seek)
  socket(54, -42, "mid ward court"),
  socket(76, 2, "cross street"),
  socket(54, 46, "south ward"),
  socket(76, -64, "north ward"),
  socket(120, 24, "far avenue"),
  socket(50, -20, "near court street"),
  socket(72, 44, "walk-up stoop"),
  socket(94, -22, "archive street"),
  socket(116, 66, "terrace street"),
  socket(50, 22, "shop row"),

  // Extra Acre sockets
  socket(-44, 24, "farmhouse porch"),
  socket(-72, 48, "barn door"),
  socket(-60, 40, "paddock"),
  socket(-40, 70, "crop edge"),
  socket(-86, 58, "silo yard"),
  socket(-30, -4, "retreat stoop"),
  socket(-34, -14, "retreat garden"),
];

export function pickLampSocket(
  used: ReadonlyArray<{ x: number; z: number }>,
  regionId: RegionId,
  rng: () => number,
  minSep = 10,
): { x: number; z: number; socket: boolean } {
  const pool = LAMP_SOCKETS.filter((s) => s.region === regionId);
  const free = pool.filter((s) =>
    used.every((u) => Math.hypot(u.x - s.x, u.z - s.z) > minSep),
  );
  if (free.length > 0) {
    const s = free[Math.min(free.length - 1, Math.floor(rng() * free.length))]!;
    return { x: s.x, z: s.z, socket: true };
  }
  const home = REGIONS[regionId];
  const ox = home.x;
  const oz = home.z;
  for (let tries = 0; tries < 28; tries++) {
    const ang = rng() * Math.PI * 2;
    const rad = 5 + rng() * (home.radius * 0.78);
    const x = ox + Math.cos(ang) * rad;
    const z = oz + Math.sin(ang) * rad;
    if (used.every((u) => Math.hypot(u.x - x, u.z - z) > minSep)) {
      return { x, z, socket: false };
    }
  }
  return {
    x: ox + (rng() - 0.5) * 16,
    z: oz + (rng() - 0.5) * 16,
    socket: false,
  };
}

/** Coarse building masses for the minimap (not live meshes). */
export function mapMasses(): Array<{ x: number; z: number; s: number }> {
  const out: Array<{ x: number; z: number; s: number }> = [];
  for (const lot of LOTS) {
    if (lot.prefab === "street-lamp" || lot.prefab === "crop-row") continue;
    if (lot.prefab === "orchard-tree" || lot.prefab === "hedgerow") continue;
    const s =
      lot.prefab === "walk-up" || lot.prefab === "warehouse" || lot.prefab === "barn"
        ? 3.4
        : lot.prefab === "farmhouse" || lot.prefab === "boiler"
          ? 3.0
          : 2.2;
    out.push({ x: lot.x, z: lot.z, s });
  }
  return out;
}

export const MAP_MASSES = mapMasses();
