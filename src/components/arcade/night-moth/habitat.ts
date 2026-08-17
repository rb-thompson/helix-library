/**
 * Living grounds — canals, fish, fireflies, swaying plants, noir towers, bonuses.
 */

import * as THREE from "three";
import { REGIONS } from "@/lib/arcade/night-moth";
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
      color: 0x0a2430,
      emissive: 0x123848,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.55,
      transparent: true,
      opacity: 0.72,
    }),
  );

  function canal(x: number, z: number, sx: number, sz: number) {
    const mesh = new THREE.Mesh(geo(track, new THREE.BoxGeometry(sx, 0.16, sz)), waterMat);
    mesh.position.set(x, 0.02, z);
    group.add(mesh);
    const rim = mat(
      track,
      new THREE.MeshStandardMaterial({ color: 0x2a2824, roughness: 0.8, metalness: 0.1 }),
    );
    if (sx > sz) {
      group.add(edge(x, z - sz / 2, sx, 0.22, rim));
      group.add(edge(x, z + sz / 2, sx, 0.22, rim));
    } else {
      group.add(edge(x - sx / 2, z, 0.22, sz, rim));
      group.add(edge(x + sx / 2, z, 0.22, sz, rim));
    }
  }
  function edge(x: number, z: number, sx: number, sz: number, m: THREE.Material) {
    const e = new THREE.Mesh(geo(track, new THREE.BoxGeometry(sx, 0.28, sz)), m);
    e.position.set(x, 0.12, z);
    return e;
  }

  // Fen → court (east-west) and plaza → court (north-south)
  canal(-55, 8, 130, 7.2);
  canal(4, -62, 7.2, 112);

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
  type Fish = { mesh: THREE.Mesh; path: 0 | 1; u: number; speed: number; amp: number };
  const fish: Fish[] = [];
  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Mesh(fishGeo, fishMat);
    group.add(mesh);
    fish.push({
      mesh,
      path: i < 10 ? 0 : 1,
      u: Math.random(),
      speed: 0.04 + Math.random() * 0.05,
      amp: 0.35 + Math.random() * 0.3,
    });
  }

  const bugGeo = geo(track, new THREE.SphereGeometry(0.045, 6, 5));
  const bugMat = mat(
    track,
    new THREE.MeshBasicMaterial({ color: 0xc8ff7a, toneMapped: false }),
  );
  type Bug = { mesh: THREE.Mesh; ox: number; oy: number; oz: number; ph: number };
  const bugs: Bug[] = [];
  for (let i = 0; i < 56; i++) {
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
      new THREE.MeshStandardMaterial({ color: 0x12141a, roughness: 0.7, metalness: 0.25 }),
    );
    const edge = mat(
      track,
      new THREE.MeshStandardMaterial({
        color: neon,
        emissive: neon,
        emissiveIntensity: 0.85,
        roughness: 0.3,
      }),
    );
    for (let f = 0; f < floors; f++) {
      const y = 3.2 + f * 3.4;
      const plat = new THREE.Mesh(geo(track, new THREE.BoxGeometry(7.2, 0.18, 7.2)), dark);
      plat.position.set(tx, y, tz);
      group.add(plat);
      for (const [sx, sz] of [
        [-3.4, -3.4],
        [3.4, -3.4],
        [-3.4, 3.4],
        [3.4, 3.4],
      ] as const) {
        const post = new THREE.Mesh(geo(track, new THREE.BoxGeometry(0.16, 3.4, 0.16)), dark);
        post.position.set(tx + sx, y + 1.7, tz + sz);
        group.add(post);
        const strip = new THREE.Mesh(geo(track, new THREE.BoxGeometry(0.05, 3.4, 0.05)), edge);
        strip.position.set(tx + sx, y + 1.7, tz + sz);
        group.add(strip);
      }
      // Maze walls — gap on alternating sides
      const wallA = new THREE.Mesh(geo(track, new THREE.BoxGeometry(5.2, 1.6, 0.16)), dark);
      wallA.position.set(tx + (f % 2 === 0 ? -0.6 : 0.6), y + 0.9, tz + (f % 2 === 0 ? 1.8 : -1.8));
      group.add(wallA);
      const wallB = new THREE.Mesh(geo(track, new THREE.BoxGeometry(0.16, 1.6, 4.4)), dark);
      wallB.position.set(tx + (f % 2 === 0 ? 2.1 : -2.1), y + 0.9, tz);
      group.add(wallB);
    }
    const top = 3.2 + floors * 3.4;
    bonuses.push(makeBonus(track, group, glowTex, new THREE.Vector3(tx, top + 0.6, tz), neon));
    if (floors > 3) {
      bonuses.push(
        makeBonus(track, group, glowTex, new THREE.Vector3(tx + 2.2, 3.2 + 3.4 + 0.5, tz - 2), neon),
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
        f.u = (f.u + f.speed * 0.016) % 1;
        if (f.path === 0) {
          const x = -118 + f.u * 128;
          f.mesh.position.set(x, 0.18 + Math.sin(t * 3 + f.u * 8) * 0.05, 8 + Math.sin(f.u * 12) * f.amp);
          f.mesh.rotation.y = -Math.PI / 2;
        } else {
          const z = -118 + f.u * 112;
          f.mesh.position.set(4 + Math.sin(f.u * 10) * f.amp, 0.18 + Math.sin(t * 2.4 + f.u * 7) * 0.05, z);
          f.mesh.rotation.y = Math.PI;
        }
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
        (b.mesh.material as THREE.MeshBasicMaterial).color.setHSL(0.22, 0.85, 0.35 + pulse * 0.35);
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
