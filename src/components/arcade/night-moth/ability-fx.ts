/**
 * Per-ability bodies for Night Moth.
 * Numbers stay in catalog/rules; this is only what the visor sees.
 */

import * as THREE from "three";
import { geo, mat, type ParticlePool, type Track } from "./voxels";

type Ribbon = {
  line: THREE.Line;
  age: number;
  life: number;
};

type Sweep = {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  origin: THREE.Vector3;
  look: THREE.Vector3;
  kind: "slash" | "ring";
};

type After = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
};

type Plate = THREE.Mesh;

export type PollenMesh = {
  group: THREE.Group;
  sphere: THREE.Mesh;
};

export type AbilityFx = {
  tick: (dt: number, pos: THREE.Vector3, look: THREE.Vector3, moth: THREE.Object3D) => void;
  cleave: (pos: THREE.Vector3, look: THREE.Vector3) => void;
  pheromone: (from: THREE.Vector3, targets: THREE.Vector3[]) => void;
  veil: (moth: THREE.Object3D, on: boolean) => void;
  siphon: (from: THREE.Vector3, to: THREE.Vector3) => void;
  pulse: (pos: THREE.Vector3) => void;
  dive: (pos: THREE.Vector3, look: THREE.Vector3) => void;
  chitin: (moth: THREE.Object3D, on: boolean) => void;
  pollen: (pos: THREE.Vector3, radius: number) => PollenMesh;
  tickPollen: (mesh: PollenMesh, life: number, maxLife: number, pos: THREE.Vector3, dt: number) => void;
  dropPollen: (mesh: PollenMesh) => void;
  helix: (pos: THREE.Vector3, look: THREE.Vector3) => void;
};

export function createAbilityFx(
  track: Track,
  scene: THREE.Scene,
  glowTex: THREE.Texture,
  particles: ParticlePool,
): AbilityFx {
  const ribbons: Ribbon[] = [];
  const sweeps: Sweep[] = [];
  const afters: After[] = [];
  const plates: Plate[] = [];
  const saved = new Map<THREE.MeshStandardMaterial, { em: THREE.Color; emI: number }>();
  let veilOn = false;
  let chitinOn = false;
  let afterT = 0;
  const tmp = new THREE.Vector3();

  const lineMat = (color: number, opacity: number) =>
    mat(
      track,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );

  function addRibbon(from: THREE.Vector3, to: THREE.Vector3, color: number, life: number): void {
    const g = geo(track, new THREE.BufferGeometry());
    g.setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(g, lineMat(color, 0.85));
    scene.add(line);
    ribbons.push({ line, age: 0, life });
  }

  function makeSlash(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      geo(track, new THREE.TorusGeometry(2.15, 0.07, 6, 18, Math.PI * 0.95)),
      mat(
        track,
        new THREE.MeshBasicMaterial({
          color: 0xf2e6c8,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    return mesh;
  }

  function attachPlates(moth: THREE.Object3D): void {
    if (plates.length) return;
    const plateMat = mat(
      track,
      new THREE.MeshStandardMaterial({
        color: 0x3a342c,
        metalness: 0.35,
        roughness: 0.4,
        emissive: 0x6a5840,
        emissiveIntensity: 0.45,
      }),
    );
    const specs: Array<[number, number, number, number, number, number]> = [
      [0.38, 0.06, 0.08, 0.42, 0.55, 0.18],
      [-0.38, 0.06, 0.08, 0.42, 0.55, 0.18],
      [0, -0.06, -0.55, 0.55, 0.28, 0.7],
      [0, 0.22, 0.05, 0.5, 0.12, 0.38],
    ];
    for (const [x, y, z, sx, sy, sz] of specs) {
      const m = new THREE.Mesh(geo(track, new THREE.BoxGeometry(sx, sy, sz)), plateMat);
      m.position.set(x, y, z);
      m.visible = false;
      moth.add(m);
      plates.push(m);
    }
  }

  function setVeilMats(moth: THREE.Object3D, on: boolean): void {
    moth.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const matIn = mesh.material;
      if (!matIn || Array.isArray(matIn)) return;
      if (!(matIn instanceof THREE.MeshStandardMaterial)) return;
      if (on) {
        if (!saved.has(matIn)) {
          saved.set(matIn, { em: matIn.emissive.clone(), emI: matIn.emissiveIntensity });
        }
        matIn.emissive.setHex(0xb8d4e8);
        matIn.emissiveIntensity = 0.85;
      } else {
        const prev = saved.get(matIn);
        if (prev) {
          matIn.emissive.copy(prev.em);
          matIn.emissiveIntensity = prev.emI;
        }
      }
    });
    if (!on) saved.clear();
  }

  return {
    tick(dt, pos, look, moth) {
      for (let i = ribbons.length - 1; i >= 0; i--) {
        const r = ribbons[i]!;
        r.age += dt;
        const k = 1 - r.age / r.life;
        (r.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, k);
        if (r.age >= r.life) {
          scene.remove(r.line);
          ribbons.splice(i, 1);
        }
      }
      for (let i = sweeps.length - 1; i >= 0; i--) {
        const s = sweeps[i]!;
        s.age += dt;
        const k = s.age / s.life;
        if (s.kind === "slash") {
          const ang = -0.7 + k * 1.6;
          s.mesh.position.copy(s.origin).addScaledVector(s.look, 1.4);
          s.mesh.lookAt(s.origin.clone().add(s.look));
          s.mesh.rotateZ(ang);
          s.mesh.scale.setScalar(0.85 + k * 0.55);
        } else {
          s.mesh.position.copy(s.origin);
          s.mesh.scale.setScalar(1 + k * 7.2);
        }
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k);
        if (s.age >= s.life) {
          scene.remove(s.mesh);
          sweeps.splice(i, 1);
        }
      }
      for (let i = afters.length - 1; i >= 0; i--) {
        const a = afters[i]!;
        a.age += dt;
        (a.sprite.material as THREE.SpriteMaterial).opacity = 0.45 * (1 - a.age / a.life);
        if (a.age >= a.life) {
          scene.remove(a.sprite);
          afters.splice(i, 1);
        }
      }
      if (veilOn) {
        afterT -= dt;
        if (afterT <= 0) {
          afterT = 0.07;
          const spr = new THREE.Sprite(
            mat(
              track,
              new THREE.SpriteMaterial({
                map: glowTex,
                color: 0xc8dce8,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.4,
              }),
            ),
          );
          spr.position.copy(pos);
          spr.scale.set(2.4, 1.6, 1);
          scene.add(spr);
          afters.push({ sprite: spr, age: 0, life: 0.28 });
        }
      }
      if (chitinOn) {
        for (const p of plates) {
          p.rotation.z = Math.sin(pos.x * 0.4 + p.position.x) * 0.04;
        }
      }
      void look;
      void moth;
    },

    cleave(pos, look) {
      const mesh = makeSlash();
      mesh.position.copy(pos).addScaledVector(look, 1.4);
      scene.add(mesh);
      sweeps.push({
        mesh,
        age: 0,
        life: 0.2,
        origin: pos.clone(),
        look: look.clone(),
        kind: "slash",
      });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI - 0.4;
        const dir = new THREE.Vector3(
          look.x * Math.cos(a) - look.z * Math.sin(a),
          0.2,
          look.z * Math.cos(a) + look.x * Math.sin(a),
        ).multiplyScalar(8);
        particles.spawn(pos.clone().addScaledVector(look, 1.6), 0xf0e0c0, dir, 0.32, 0.1, 0xffffff);
      }
    },

    pheromone(from, targets) {
      for (const to of targets) {
        const dest = to.clone();
        dest.y += 2.2;
        addRibbon(from, dest, 0x6ee7d0, 1.15);
        const n = 7;
        for (let i = 0; i < n; i++) {
          const k = (i + 1) / (n + 1);
          tmp.copy(from).lerp(dest, k);
          particles.spawn(
            tmp.clone(),
            0x6ee7d0,
            new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.4, (Math.random() - 0.5) * 0.6),
            0.7,
            0.08,
            0xe8fff8,
          );
        }
      }
    },

    veil(moth, on) {
      veilOn = on;
      setVeilMats(moth, on);
      if (on) afterT = 0;
    },

    siphon(from, to) {
      const dest = to.clone();
      dest.y += 2.2;
      addRibbon(from, dest, 0xe8a85a, 0.55);
      for (let i = 0; i < 12; i++) {
        const k = i / 12;
        tmp.copy(from).lerp(dest, k);
        const v = dest.clone().sub(from).normalize().multiplyScalar(-2.4);
        v.y += 0.4;
        particles.spawn(tmp.clone(), 0xffd080, v, 0.45, 0.09, 0xfff6d8);
      }
    },

    pulse(pos) {
      const mesh = new THREE.Mesh(
        geo(track, new THREE.TorusGeometry(1.1, 0.08, 8, 32)),
        mat(
          track,
          new THREE.MeshBasicMaterial({
            color: 0xa8c4e8,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      mesh.position.copy(pos);
      mesh.rotation.x = Math.PI / 2;
      scene.add(mesh);
      sweeps.push({
        mesh,
        age: 0,
        life: 0.45,
        origin: pos.clone(),
        look: new THREE.Vector3(0, 1, 0),
        kind: "ring",
      });
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        particles.spawn(
          pos,
          0xa8c4e8,
          new THREE.Vector3(Math.cos(a) * 10, 0.6, Math.sin(a) * 10),
          0.5,
          0.12,
          0xffffff,
        );
      }
    },

    dive(pos, look) {
      for (let i = 0; i < 16; i++) {
        const p = pos.clone().addScaledVector(look, i * 0.95);
        particles.spawn(
          p,
          0xff6a3a,
          look.clone().multiplyScalar(-2).add(new THREE.Vector3(0, 1.2, 0)),
          0.55,
          0.14,
          0xffe0a0,
        );
      }
    },

    chitin(moth, on) {
      attachPlates(moth);
      chitinOn = on;
      for (const p of plates) p.visible = on;
      if (!on) {
        for (const p of plates) {
          const world = new THREE.Vector3();
          p.getWorldPosition(world);
          particles.spawn(
            world,
            0xc4a060,
            new THREE.Vector3((Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4),
            0.5,
            0.12,
          );
        }
      }
    },

    pollen(pos, radius) {
      const group = new THREE.Group();
      const sphere = new THREE.Mesh(
        geo(track, new THREE.SphereGeometry(1, 16, 12)),
        mat(
          track,
          new THREE.MeshBasicMaterial({
            color: 0xd4b46a,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            toneMapped: false,
          }),
        ),
      );
      sphere.scale.setScalar(radius);
      group.add(sphere);
      for (let i = 0; i < 14; i++) {
        const mote = new THREE.Mesh(
          geo(track, new THREE.OctahedronGeometry(0.14)),
          mat(
            track,
            new THREE.MeshBasicMaterial({
              color: i % 2 ? 0xe8c878 : 0xc4a050,
              transparent: true,
              opacity: 0.85,
              toneMapped: false,
            }),
          ),
        );
        const a = (i / 14) * Math.PI * 2;
        mote.position.set(Math.cos(a) * radius * 0.55, (i % 3) * 0.35, Math.sin(a) * radius * 0.55);
        group.add(mote);
      }
      group.position.copy(pos);
      scene.add(group);
      return { group, sphere };
    },

    tickPollen(mesh, life, maxLife, pos, dt) {
      const k = Math.max(0, life / Math.max(0.001, maxLife));
      mesh.group.position.copy(pos);
      mesh.group.rotation.y += dt * 0.9;
      (mesh.sphere.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.18 * k;
      mesh.group.scale.setScalar(0.85 + 0.15 * k);
    },

    dropPollen(mesh) {
      scene.remove(mesh.group);
    },

    helix(pos, look) {
      const right = new THREE.Vector3(look.z, 0, -look.x).normalize();
      const up = new THREE.Vector3().crossVectors(look, right).normalize();
      for (let i = 0; i < 28; i++) {
        const t = i / 28;
        const ang = t * Math.PI * 6;
        const along = pos.clone().addScaledVector(look, t * 15);
        const a = along
          .clone()
          .addScaledVector(right, Math.cos(ang) * 0.7)
          .addScaledVector(up, Math.sin(ang) * 0.7);
        const b = along
          .clone()
          .addScaledVector(right, Math.cos(ang + Math.PI) * 0.7)
          .addScaledVector(up, Math.sin(ang + Math.PI) * 0.7);
        particles.spawn(a, 0x6ee7d0, look.clone().multiplyScalar(2), 0.7, 0.1, 0xe8fff8);
        particles.spawn(b, 0x9aefe0, look.clone().multiplyScalar(2), 0.7, 0.1, 0xffffff);
      }
    },
  };
}
