/**
 * Living grounds — canals, fish, fireflies, swaying plants, noir towers, bonuses.
 */

import * as THREE from "three";
import {
  POOLS,
  REGIONS,
  WATERWAYS,
  heightAt,
  waterwayPoint,
} from "@/lib/arcade/night-moth";
import { geo, mat, type Track } from "./voxels";

export type BonusOrb = {
  pos: THREE.Vector3;
  mesh: THREE.Group;
  taken: boolean;
};

export type Habitat = {
  group: THREE.Group;
  bonuses: BonusOrb[];
  tick: (t: number, dt: number) => void;
};

export function buildHabitat(track: Track, glowTex: THREE.Texture): Habitat {
  const group = new THREE.Group();
  const bonuses: BonusOrb[] = [];

  const waterMat = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0x081820,
      emissive: 0x1a3040,
      emissiveIntensity: 0.22,
      roughness: 0.08,
      metalness: 0.72,
      transparent: true,
      opacity: 0.78,
    }),
  );

  function waterSlab(x: number, z: number, sx: number, sz: number, yaw: number) {
    const mesh = new THREE.Mesh(geo(track, new THREE.BoxGeometry(sx, 0.18, sz)), waterMat);
    mesh.position.set(x, heightAt(x, z) + 0.06, z);
    mesh.rotation.y = yaw;
    group.add(mesh);
  }

  for (const way of WATERWAYS) {
    for (let i = 0; i < way.pts.length - 1; i++) {
      const a = way.pts[i]!;
      const b = way.pts[i + 1]!;
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      waterSlab(mx, mz, way.half * 2, Math.max(1.2, len + 0.4), yaw);
    }
  }
  for (const p of POOLS) {
    const mesh = new THREE.Mesh(
      geo(track, new THREE.CylinderGeometry(p.r, p.r, 0.16, 16)),
      waterMat,
    );
    mesh.position.set(p.x, heightAt(p.x, p.z) + 0.05, p.z);
    group.add(mesh);
  }

  const moonGlint = new THREE.Mesh(
    geo(track, new THREE.CircleGeometry(7.5, 20)),
    mat(
      track,
      new THREE.MeshBasicMaterial({
        color: 0xc8d0e0,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    ),
  );
  moonGlint.rotation.x = -Math.PI / 2;
  moonGlint.position.set(4, heightAt(4, -62) + 0.12, -62);
  group.add(moonGlint);

  const fishGeo = geo(track, new THREE.ConeGeometry(0.12, 0.48, 6));
  const fishMat = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0x6aa0b8,
      emissive: 0x245060,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.3,
    }),
  );
  type Fish = {
    mesh: THREE.Mesh;
    way: number;
    u: number;
    speed: number;
    amp: number;
    phase: number;
  };
  const fish: Fish[] = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(fishGeo, fishMat);
    group.add(mesh);
    fish.push({
      mesh,
      way: i % WATERWAYS.length,
      u: Math.random(),
      speed: 0.035 + Math.random() * 0.05,
      amp: 0.28 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
    });
  }

  const bugGeo = geo(track, new THREE.SphereGeometry(0.045, 6, 5));
  const bugMat = mat(
    track,
    new THREE.MeshBasicMaterial({ color: 0xc8ff7a, toneMapped: false }),
  );
  type Bug = { mesh: THREE.Mesh; ox: number; oy: number; oz: number; ph: number };
  const bugs: Bug[] = [];
  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Mesh(bugGeo, bugMat);
    group.add(mesh);
    bugs.push({
      mesh,
      ox: (Math.random() - 0.5) * 240,
      oy: 1.4 + Math.random() * 8,
      oz: (Math.random() - 0.5) * 240,
      ph: Math.random() * Math.PI * 2,
    });
  }

  const plantGeo = geo(track, new THREE.CylinderGeometry(0.035, 0.05, 1.5, 5));
  const plantMat = mat(
    track,
    new THREE.MeshStandardMaterial({ color: 0x2a4024, roughness: 0.8 }),
  );
  type Plant = { mesh: THREE.Mesh; ph: number };
  const plants: Plant[] = [];
  const plantSites = [
    { x: -55, z: 14 },
    { x: -20, z: 14 },
    { x: 10, z: -62 },
    { x: 10, z: -30 },
    { x: REGIONS.fen.x, z: REGIONS.fen.z },
    { x: REGIONS.grove.x + 20, z: REGIONS.grove.z + 18 },
  ];
  for (const site of plantSites) {
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(plantGeo, plantMat);
      mesh.position.set(site.x + (Math.random() - 0.5) * 6, 0.75, site.z + (Math.random() - 0.5) * 6);
      group.add(mesh);
      plants.push({ mesh, ph: Math.random() * Math.PI * 2 });
    }
  }

  function tower(tx: number, tz: number, floors: number, neon: number) {
    const dark = mat(
      track,
      new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.72, metalness: 0.22 }),
    );
    const edge = mat(
      track,
      new THREE.MeshStandardMaterial({
        color: neon,
        emissive: neon,
        emissiveIntensity: 0.7,
        roughness: 0.3,
      }),
    );
    const pane = mat(
      track,
      new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.22 }),
    );
    const bodyH = 3.1 + floors * 3.4;
    const shell = new THREE.Mesh(geo(track, new THREE.BoxGeometry(7.6, bodyH, 7.6)), dark);
    shell.position.set(tx, bodyH * 0.5, tz);
    group.add(shell);
    const cap = new THREE.Mesh(geo(track, new THREE.BoxGeometry(8.0, 0.28, 8.0)), dark);
    cap.position.set(tx, bodyH + 0.12, tz);
    group.add(cap);
    for (let f = 0; f < floors; f++) {
      const y = 2.4 + f * 3.4;
      for (const [sx, sz, rx, rz] of [
        [0, 3.85, 5.2, 0.08],
        [0, -3.85, 5.2, 0.08],
        [3.85, 0, 0.08, 5.2],
        [-3.85, 0, 0.08, 5.2],
      ] as const) {
        const win = new THREE.Mesh(geo(track, new THREE.BoxGeometry(rx, 1.15, rz)), pane);
        win.position.set(tx + sx, y, tz + sz);
        group.add(win);
      }
      const strip = new THREE.Mesh(geo(track, new THREE.BoxGeometry(7.7, 0.06, 7.7)), edge);
      strip.position.set(tx, y + 1.4, tz);
      group.add(strip);
    }
    const top = bodyH + 0.4;
    bonuses.push(makeBonus(track, group, glowTex, new THREE.Vector3(tx, top + 0.6, tz), neon));
    if (floors > 3) {
      bonuses.push(
        makeBonus(track, group, glowTex, new THREE.Vector3(tx + 2.2, 6.2, tz - 2), neon),
      );
    }
  }

  tower(REGIONS.stacks.x + 18, REGIONS.stacks.z + 4, 5, 0x6ee7d0);
  tower(REGIONS.terrace.x - 16, REGIONS.terrace.z - 8, 4, 0xb44cff);
  tower(22, -22, 4, 0xe8a85a);

  return {
    group,
    bonuses,
    tick(t, dt) {
      void dt;
      for (const f of fish) {
        f.u = (f.u + f.speed * dt) % 1;
        const way = WATERWAYS[f.way] ?? WATERWAYS[0]!;
        const p = waterwayPoint(way, f.u);
        const side = Math.sin(t * 1.4 + f.phase) * f.amp;
        const hx = Math.cos(p.heading);
        const hz = -Math.sin(p.heading);
        const x = p.x + hx * side;
        const z = p.z + hz * side;
        f.mesh.position.set(x, heightAt(x, z) + 0.22 + Math.sin(t * 3 + f.phase) * 0.05, z);
        f.mesh.rotation.y = p.heading;
        f.mesh.rotation.z = Math.sin(t * 8 + f.u * 20) * 0.25;
      }
      for (const b of bugs) {
        const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(t * 3.2 + b.ph));
        b.mesh.position.set(
          b.ox + Math.sin(t * 0.35 + b.ph) * 6,
          b.oy + Math.sin(t * 0.8 + b.ph) * 0.8,
          b.oz + Math.cos(t * 0.28 + b.ph) * 6,
        );
        b.mesh.scale.setScalar(0.6 + pulse);
      }
      for (const p of plants) {
        p.mesh.rotation.z = Math.sin(t * 1.1 + p.ph) * 0.22;
        p.mesh.rotation.x = Math.cos(t * 0.8 + p.ph) * 0.08;
      }
      for (const o of bonuses) {
        if (o.taken) continue;
        o.mesh.rotation.y = t * 1.4;
        o.mesh.position.y = o.pos.y + Math.sin(t * 2.2) * 0.18;
      }
    },
  };
}

function makeBonus(
  track: Track,
  group: THREE.Group,
  glowTex: THREE.Texture,
  pos: THREE.Vector3,
  color: number,
): BonusOrb {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    geo(track, new THREE.OctahedronGeometry(0.28)),
    mat(
      track,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.2,
        roughness: 0.2,
        metalness: 0.4,
      }),
    ),
  );
  g.add(core);
  const spr = new THREE.Sprite(
    mat(
      track,
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.7,
      }),
    ),
  );
  spr.scale.set(1.6, 1.6, 1);
  g.add(spr);
  g.position.copy(pos);
  group.add(g);
  return { pos: pos.clone(), mesh: g, taken: false };
}
