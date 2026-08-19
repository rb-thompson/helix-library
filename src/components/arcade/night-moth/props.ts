/**
 * Designed garden props — trees, shelves, hedges, fences, reeds.
 * Written into one InstancedMesh so the grounds read as places, not noise.
 */

import * as THREE from "three";
import { REGIONS, heightAt, type RegionId } from "@/lib/arcade/night-moth";

export type PropWriter = {
  add: (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotY: number,
    color: number,
  ) => void;
};

export function createWriter(cap: number): {
  writer: PropWriter;
  apply: (mesh: THREE.InstancedMesh) => number;
} {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const items: Array<{
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    rotY: number;
    color: number;
  }> = [];
  return {
    writer: {
      add(x, y, z, sx, sy, sz, rotY, hex) {
        if (items.length >= cap) return;
        items.push({ x, y, z, sx, sy, sz, rotY, color: hex });
      },
    },
    apply(mesh) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, it.rotY, 0);
        dummy.scale.set(it.sx, it.sy, it.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.setHex(it.color);
        mesh.setColorAt(i, color);
      }
      for (let i = items.length; i < cap; i++) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, -40, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.count = items.length;
      return items.length;
    },
  };
}

const BARK = 0x2a1c12;
const LEAF_A = 0x1a3c24;
const LEAF_B = 0x245830;
const LEAF_C = 0x0e2818;
const STONE = 0x3a3630;
const STONE_PALE = 0x4a4844;
const IRON = 0x22261c;
const SHELF = 0x3a3026;
const REED = 0x2a3420;
const HEDGE = 0x16301c;

export function tree(w: PropWriter, x: number, z: number, rng: () => number): void {
  const h = 2.2 + rng() * 1.4;
  w.add(x, h * 0.45, z, 0.32, h, 0.32, 0, BARK);
  const cy = h + 0.55;
  w.add(x, cy, z, 1.7 + rng() * 0.5, 1.2, 1.7 + rng() * 0.5, rng() * 0.4, LEAF_A);
  w.add(x + 0.7, cy - 0.15, z + 0.2, 1.1, 0.9, 1.1, 0.3, LEAF_B);
  w.add(x - 0.65, cy - 0.1, z - 0.25, 1.05, 0.85, 1.05, -0.2, LEAF_C);
  w.add(x + 0.15, cy + 0.7, z - 0.15, 1.15, 0.8, 1.15, 0.5, LEAF_B);
}

export function hedge(w: PropWriter, x: number, z: number, yaw: number, len: number): void {
  w.add(x, 0.7, z, len, 1.15, 0.42, yaw, HEDGE);
  w.add(x, 1.35, z, len * 0.92, 0.35, 0.5, yaw, LEAF_B);
}

export function bollard(w: PropWriter, x: number, z: number): void {
  w.add(x, 0.45, z, 0.22, 0.9, 0.22, 0, STONE);
  w.add(x, 0.95, z, 0.3, 0.12, 0.3, 0, 0xc4a05a);
}

export function shelf(w: PropWriter, x: number, z: number, yaw: number): void {
  w.add(x, 1.15, z, 0.18, 2.3, 0.7, yaw, SHELF);
  const side = 0.95;
  const dx = Math.cos(yaw) * side;
  const dz = Math.sin(yaw) * side;
  w.add(x + dx, 1.15, z + dz, 0.18, 2.3, 0.7, yaw, SHELF);
  for (const y of [0.35, 1.05, 1.75]) {
    w.add(x + dx * 0.5, y, z + dz * 0.5, 1.15, 0.1, 0.72, yaw, 0x4a3c30);
  }
}

export function fencePost(w: PropWriter, x: number, z: number): void {
  w.add(x, 0.85, z, 0.16, 1.7, 0.16, 0, IRON);
}

export function fenceRail(w: PropWriter, x: number, z: number, yaw: number, len: number): void {
  w.add(x, 0.55, z, len, 0.08, 0.08, yaw, IRON);
  w.add(x, 1.1, z, len, 0.08, 0.08, yaw, IRON);
}

export function reed(w: PropWriter, x: number, z: number, rng: () => number): void {
  for (let i = 0; i < 4; i++) {
    const ox = (rng() - 0.5) * 0.7;
    const oz = (rng() - 0.5) * 0.7;
    const h = 1.4 + rng() * 1.3;
    w.add(x + ox, h * 0.5, z + oz, 0.07, h, 0.07, 0, REED);
  }
}

export function rock(w: PropWriter, x: number, z: number, rng: () => number): void {
  w.add(x, 0.35 + rng() * 0.2, z, 0.9 + rng() * 0.6, 0.5 + rng() * 0.4, 0.7 + rng() * 0.5, rng() * Math.PI, STONE);
  if (rng() > 0.45) {
    w.add(x + 0.4, 0.25, z + 0.2, 0.5, 0.35, 0.45, rng(), STONE_PALE);
  }
}

export function chimney(w: PropWriter, x: number, z: number): void {
  w.add(x, 1.1, z, 0.7, 2.2, 0.7, 0, 0x2a201c);
  w.add(x, 2.3, z, 0.85, 0.2, 0.85, 0, 0x1c1612);
}

export function lowWall(w: PropWriter, x: number, z: number, yaw: number, len: number, hex = STONE): void {
  w.add(x, 0.4, z, len, 0.7, 0.32, yaw, hex);
}

export function populateRegion(w: PropWriter, id: RegionId, rng: () => number): void {
  const ground: PropWriter = {
    add(x, y, z, sx, sy, sz, rotY, color) {
      w.add(x, y + heightAt(x, z), z, sx, sy, sz, rotY, color);
    },
  };
  populateRegionOn(ground, id, rng);
}

function populateRegionOn(w: PropWriter, id: RegionId, rng: () => number): void {
  const r = REGIONS[id];
  if (id === "grove") {
    // Orchard trees are authored in The Acre district. A few extra under the canopy.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      tree(w, r.x + Math.cos(a) * 6, r.z + Math.sin(a) * 6, rng);
    }
  } else if (id === "stacks") {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const x = r.x - 10 + col * 5.2;
        const z = r.z - 6 + row * 5.4;
        shelf(w, x, z, 0);
      }
    }
  } else if (id === "court") {
    const half = 14;
    hedge(w, r.x, r.z - half, 0, 22);
    hedge(w, r.x, r.z + half, 0, 22);
    hedge(w, r.x - half, r.z, Math.PI / 2, 22);
    hedge(w, r.x + half, r.z, Math.PI / 2, 22);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bollard(w, r.x + Math.cos(a) * 7, r.z + Math.sin(a) * 7);
    }
  } else if (id === "terrace") {
    for (let i = 0; i < 18; i++) {
      const a = i * 0.42;
      const rad = 6 + i * 0.85;
      lowWall(
        w,
        r.x + Math.cos(a) * rad,
        r.z + Math.sin(a) * rad,
        a + Math.PI / 2,
        2.4,
        0x2a3c3a,
      );
    }
  } else if (id === "yard") {
    const hw = 16;
    const hh = 12;
    for (let i = -4; i <= 4; i++) {
      fencePost(w, r.x + i * 3.6, r.z - hh);
      fencePost(w, r.x + i * 3.6, r.z + hh);
    }
    for (let i = -3; i <= 3; i++) {
      fencePost(w, r.x - hw, r.z + i * 3.4);
      fencePost(w, r.x + hw, r.z + i * 3.4);
    }
    fenceRail(w, r.x, r.z - hh, 0, 30);
    fenceRail(w, r.x, r.z + hh, 0, 30);
    fenceRail(w, r.x - hw, r.z, Math.PI / 2, 24);
    fenceRail(w, r.x + hw, r.z, Math.PI / 2, 24);
  } else if (id === "hollow") {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      rock(w, r.x + Math.cos(a) * 11, r.z + Math.sin(a) * 11, rng);
    }
  } else if (id === "fen") {
    for (let i = 0; i < 28; i++) {
      const a = rng() * Math.PI * 2;
      const rad = 4 + rng() * 22;
      reed(w, r.x + Math.cos(a) * rad, r.z + Math.sin(a) * rad, rng);
    }
  } else if (id === "plaza") {
    for (let ring = 0; ring < 2; ring++) {
      const rad = 8 + ring * 7;
      const n = 14 + ring * 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        lowWall(
          w,
          r.x + Math.cos(a) * rad,
          r.z + Math.sin(a) * rad,
          a + Math.PI / 2,
          2.6,
          STONE_PALE,
        );
      }
    }
  }
}

/** Fill empty soil so the rim and acre don't read as undeveloped. */
export function populateWilds(w: PropWriter, rng: () => number): void {
  const ground: PropWriter = {
    add(x, y, z, sx, sy, sz, rotY, color) {
      w.add(x, y + heightAt(x, z), z, sx, sy, sz, rotY, color);
    },
  };
  for (let i = 0; i < 36; i++) {
    const a = rng() * Math.PI * 2;
    const rad = 40 + rng() * 118;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (Math.hypot(x, z) < 28) continue;
    const feat = Math.hypot(x, z) > 138 ? "ridge" : rng() > 0.55 ? "tree" : "rock";
    if (feat === "ridge") {
      pine(ground, x, z, rng);
    } else if (feat === "tree") {
      if (x < -16) tree(ground, x, z, rng);
      else rock(ground, x, z, rng);
    } else {
      rock(ground, x, z, rng);
    }
  }
  // Cave mouth rubble.
  for (let i = 0; i < 8; i++) {
    rock(ground, -102 + (rng() - 0.5) * 8, 88 + (rng() - 0.5) * 6, rng);
  }
}

export function pine(w: PropWriter, x: number, z: number, rng: () => number): void {
  const h = 3.4 + rng() * 2.4;
  w.add(x, h * 0.45, z, 0.28, h, 0.28, 0, BARK);
  w.add(x, h * 0.55, z, 2.1, h * 0.55, 2.1, rng() * 0.4, LEAF_C);
  w.add(x, h * 0.85, z, 1.45, h * 0.35, 1.45, 0.2, LEAF_A);
  w.add(x, h + 0.35, z, 0.85, 0.7, 0.85, 0.1, LEAF_B);
}
