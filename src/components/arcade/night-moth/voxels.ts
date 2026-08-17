/**
 * Voxel builders for Night Moth — moth, garden, lamps, sky.
 * All geometries/materials are tracked for dispose.
 */

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import {
  ARENA_RADIUS,
  LAMPS,
  REGIONS,
  REGION_ORDER,
  regionAt,
  type LampKind,
} from "@/lib/arcade/night-moth";
import { createWriter, populateRegion } from "./props";

export type Track = {
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  tex: THREE.Texture[];
};

export function createTrack(): Track {
  return { geos: [], mats: [], tex: [] };
}

export function disposeTrack(track: Track): void {
  for (const g of track.geos) g.dispose();
  for (const m of track.mats) m.dispose();
  for (const t of track.tex) t.dispose();
  track.geos.length = 0;
  track.mats.length = 0;
  track.tex.length = 0;
}

export function geo(track: Track, g: THREE.BufferGeometry): THREE.BufferGeometry {
  track.geos.push(g);
  return g;
}

export function mat<T extends THREE.Material>(track: Track, m: T): T {
  track.mats.push(m);
  return m;
}

export function skyTexture(track: Track): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) {
    const t = new THREE.Texture();
    track.tex.push(t);
    return t;
  }
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#152038");
  g.addColorStop(0.42, "#0c1428");
  g.addColorStop(0.72, "#14182c");
  g.addColorStop(0.88, "#2a2438");
  g.addColorStop(1, "#3a2c28");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  track.tex.push(tex);
  return tex;
}

export function glowTexture(track: Track): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) {
    const t = new THREE.Texture();
    track.tex.push(t);
    return t;
  }
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(255,255,255,0.55)");
  g.addColorStop(0.62, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  track.tex.push(tex);
  return tex;
}

export type MothRig = {
  root: THREE.Group;
  leftFore: THREE.Object3D;
  rightFore: THREE.Object3D;
  leftHind: THREE.Object3D;
  rightHind: THREE.Object3D;
};

export function buildMoth(track: Track): MothRig {
  const root = new THREE.Group();
  const box = (w: number, h: number, d: number, color: number, opts?: {
    metal?: number;
    rough?: number;
    emissive?: number;
    em?: number;
  }) => {
    const mesh = new THREE.Mesh(
      geo(track, new THREE.BoxGeometry(w, h, d)),
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color,
          metalness: opts?.metal ?? 0.08,
          roughness: opts?.rough ?? 0.72,
          emissive: opts?.emissive ?? 0x000000,
          emissiveIntensity: opts?.em ?? 0,
        }),
      ),
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  };

  const thorax = box(0.55, 0.38, 0.72, 0x2a1c14);
  thorax.position.set(0, 0, 0);
  root.add(thorax);

  const skull = box(0.28, 0.06, 0.22, 0xd8c9a8, {
    emissive: 0x3a3428,
    em: 0.25,
    rough: 0.55,
  });
  skull.position.set(0, 0.22, 0.04);
  root.add(skull);

  const abdomen = box(0.42, 0.32, 0.85, 0x1c120c);
  abdomen.position.set(0, -0.04, -0.72);
  root.add(abdomen);
  const band = box(0.44, 0.08, 0.12, 0x4a3424);
  band.position.set(0, 0.02, -0.48);
  root.add(band);
  const band2 = box(0.4, 0.07, 0.1, 0x3a281c);
  band2.position.set(0, 0.0, -0.72);
  root.add(band2);

  const head = box(0.32, 0.28, 0.3, 0x24180f);
  head.position.set(0, 0.04, 0.48);
  root.add(head);

  const visorBand = box(0.38, 0.08, 0.16, 0x1a2228, {
    metal: 0.55,
    rough: 0.28,
    emissive: 0x3a5060,
    em: 0.35,
  });
  visorBand.position.set(0, 0.12, 0.58);
  root.add(visorBand);

  const lens = (x: number) => {
    const glass = box(0.16, 0.12, 0.05, 0x0a1820, {
      metal: 0.2,
      rough: 0.12,
      emissive: 0x4a88aa,
      em: 0.55,
    });
    glass.position.set(x, 0.1, 0.66);
    root.add(glass);
    const rim = box(0.18, 0.14, 0.03, 0xc4a05a, {
      metal: 0.6,
      rough: 0.3,
      emissive: 0x6a4a20,
      em: 0.4,
    });
    rim.position.set(x, 0.1, 0.63);
    root.add(rim);
  };
  lens(0.1);
  lens(-0.1);

  const antL = box(0.04, 0.04, 0.42, 0x1a120c);
  antL.position.set(0.1, 0.22, 0.68);
  antL.rotation.x = -0.55;
  antL.rotation.z = 0.35;
  root.add(antL);
  const antR = antL.clone();
  antR.position.x = -0.1;
  antR.rotation.z = -0.35;
  root.add(antR);

  const wingMat = (color: number, em = 0) =>
    mat(
      track,
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.04,
        roughness: 0.68,
        emissive: em ? color : 0x000000,
        emissiveIntensity: em,
        side: THREE.DoubleSide,
      }),
    );

  const foreGeo = geo(track, new THREE.BoxGeometry(1.55, 0.045, 0.85));
  const hindGeo = geo(track, new THREE.BoxGeometry(1.15, 0.04, 0.7));
  const ochre = wingMat(0x8a6a3a, 0.04);
  const dusk = wingMat(0x2a1c12);

  function wing(geoIn: THREE.BufferGeometry, material: THREE.Material, x: number, z: number) {
    const m = new THREE.Mesh(geoIn, material);
    m.position.set(x, 0.06, z);
    return m;
  }

  const leftFore = new THREE.Group();
  leftFore.add(wing(foreGeo, ochre, 0.95, 0.05));
  const lfBand = new THREE.Mesh(
    geo(track, new THREE.BoxGeometry(1.4, 0.05, 0.14)),
    dusk,
  );
  lfBand.position.set(0.95, 0.08, 0.22);
  leftFore.add(lfBand);

  const rightFore = new THREE.Group();
  rightFore.add(wing(foreGeo, ochre, -0.95, 0.05));
  const rfBand = lfBand.clone();
  rfBand.position.x = -0.95;
  rightFore.add(rfBand);

  const leftHind = new THREE.Group();
  leftHind.add(wing(hindGeo, wingMat(0x6a4e28), 0.72, -0.42));
  const rightHind = new THREE.Group();
  rightHind.add(wing(hindGeo, wingMat(0x6a4e28), -0.72, -0.42));

  root.add(leftFore, rightFore, leftHind, rightHind);
  root.scale.setScalar(1.05);
  return { root, leftFore, rightFore, leftHind, rightHind };
}

export function flapMoth(rig: MothRig, t: number, effort: number): void {
  const amp = 0.42 + effort * 0.55;
  const hz = 14 + effort * 10;
  const a = Math.sin(t * hz) * amp;
  rig.leftFore.rotation.z = a;
  rig.rightFore.rotation.z = -a;
  rig.leftHind.rotation.z = a * 0.72;
  rig.rightHind.rotation.z = -a * 0.72;
}

export function buildStars(track: Track, count = 1800): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * 0.92;
    const r = 220 + Math.random() * 80;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = 18 + r * Math.cos(phi) * 0.62;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    if (Math.random() < 0.12) col.setHex(0xa8c8ff);
    else if (Math.random() < 0.08) col.setHex(0xffe0b0);
    else col.setHex(0xe8eef8);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  const g = geo(track, new THREE.BufferGeometry());
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const m = mat(
    track,
    new THREE.PointsMaterial({
      size: 0.85,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  return new THREE.Points(g, m);
}

export type SkyRig = {
  group: THREE.Group;
  stars: THREE.Points;
  clouds: THREE.Sprite[];
  tick: (t: number) => void;
};

/**
 * Night sky: three.js Preetham Sky (the engine's sky template),
 * star field, a photographed moon plate, and drifting cloud sprites.
 */
export function buildSky(track: Track, glowTex: THREE.Texture): SkyRig {
  const group = new THREE.Group();

  const sky = new Sky();
  sky.scale.setScalar(800);
  const u = (sky.material as THREE.ShaderMaterial).uniforms;
  u["turbidity"].value = 1.4;
  u["rayleigh"].value = 0.06;
  u["mieCoefficient"].value = 0.004;
  u["mieDirectionalG"].value = 0.75;
  u["showSunDisc"].value = 0;
  u["cloudCoverage"].value = 0.18;
  u["cloudDensity"].value = 0.22;
  u["cloudSpeed"].value = 0.00003;
  u["cloudScale"].value = 0.00018;
  u["cloudElevation"].value = 0.55;
  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - -6.5);
  const theta = THREE.MathUtils.degToRad(210);
  sun.setFromSphericalCoords(1, phi, theta);
  u["sunPosition"].value.copy(sun);
  group.add(sky);
  track.geos.push(sky.geometry);
  track.mats.push(sky.material);

  const stars = buildStars(track);
  stars.frustumCulled = false;
  group.add(stars);

  const moonHalo = new THREE.Sprite(
    mat(
      track,
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xd8dce8,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.55,
      }),
    ),
  );
  moonHalo.position.set(-92, 78, -168);
  moonHalo.scale.set(52, 52, 1);
  group.add(moonHalo);

  const moon = new THREE.Sprite(
    mat(
      track,
      new THREE.SpriteMaterial({
        color: 0xe8e4d8,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  moon.position.copy(moonHalo.position);
  moon.scale.set(22, 22, 1);
  group.add(moon);

  const clouds: THREE.Sprite[] = [];
  const loader = new THREE.TextureLoader();
  loader.load("/arcade/night-moth/moon.jpg", (tex) => {
    const punched = punchBlack(track, tex, 10);
    const sm = moon.material as THREE.SpriteMaterial;
    sm.map = punched;
    sm.needsUpdate = true;
  });

  function placeClouds(url: string, count: number, scale: number, y: number) {
    loader.load(url, (tex) => {
      const punched = punchBlack(track, tex, 8);
      for (let i = 0; i < count; i++) {
        const spr = new THREE.Sprite(
          mat(
            track,
            new THREE.SpriteMaterial({
              map: punched,
              color: 0xc8d0e0,
              transparent: true,
              opacity: 0.42,
              depthWrite: false,
              fog: false,
            }),
          ),
        );
        const ang = (i / count) * Math.PI * 2 + scale * 0.2;
        spr.position.set(
          Math.cos(ang) * (90 + i * 14),
          y + (i % 3) * 8,
          Math.sin(ang) * (100 + i * 10) - 20,
        );
        const s = scale * (0.85 + (i % 3) * 0.18);
        spr.scale.set(s * 1.7, s, 1);
        group.add(spr);
        clouds.push(spr);
      }
    });
  }
  placeClouds("/arcade/night-moth/cloud-cirrus.jpg", 5, 38, 48);
  placeClouds("/arcade/night-moth/cloud-bank.jpg", 4, 46, 36);

  return {
    group,
    stars,
    clouds,
    tick(t) {
      u["time"].value = t;
      const matStars = stars.material as THREE.PointsMaterial;
      matStars.opacity = 0.82 + Math.sin(t * 0.28) * 0.12;
      matStars.size = 0.78 + Math.sin(t * 0.5) * 0.12;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i]!;
        c.position.x += Math.sin(t * 0.03 + i) * 0.018;
        c.position.z += Math.cos(t * 0.025 + i * 0.6) * 0.014;
        const sm = c.material as THREE.SpriteMaterial;
        sm.opacity = 0.32 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.09 + i));
      }
      (moonHalo.material as THREE.SpriteMaterial).opacity =
        0.48 + 0.08 * Math.sin(t * 0.2);
    },
  };
}

/** JPEG plates sit on black — lift luminance into alpha so sprites don't show a square. */
function punchBlack(track: Track, src: THREE.Texture, floor: number): THREE.CanvasTexture {
  const img = src.image as CanvasImageSource;
  const w = (img as HTMLImageElement).width || 512;
  const h = (img as HTMLImageElement).height || 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) {
    track.tex.push(src);
    return src as THREE.CanvasTexture;
  }
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    d[i + 3] = l <= floor ? 0 : Math.min(255, Math.round((l - floor) * 1.2));
  }
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace;
  track.tex.push(src, out);
  return out;
}

export type Garden = {
  ground: THREE.InstancedMesh;
  foliage: THREE.InstancedMesh;
};

export function buildGarden(track: Track, rng: () => number): Garden {
  const cell = 3.6;
  const half = ARENA_RADIUS + 8;
  const groundGeo = geo(track, new THREE.BoxGeometry(cell * 1.02, 0.55, cell * 1.02));
  const groundMat = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const n = Math.floor((half * 2) / cell);
  const ground = new THREE.InstancedMesh(groundGeo, groundMat, n * n);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let i = 0;
  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      const x = -half + ix * cell + cell * 0.5;
      const z = -half + iz * cell + cell * 0.5;
      const r = Math.hypot(x, z);
      dummy.position.set(x, -0.28 + rng() * 0.12, z);
      dummy.rotation.set(0, rng() * 0.08, 0);
      dummy.scale.set(1, 0.65 + rng() * 0.55, 1);
      dummy.updateMatrix();
      ground.setMatrixAt(i, dummy.matrix);
      if (r > ARENA_RADIUS - 2) color.setHex(0x0a0c12);
      else {
        const reg = regionAt(x, z);
        color.setHex(reg.soil);
        const plaza = Math.hypot(x - reg.x, z - reg.z);
        if (plaza < 9) color.lerp(new THREE.Color(reg.accent), 0.16);
        // Paths from the court to each region — readable roads, not noise.
        if (onPath(x, z)) color.setHex(0x2a2620);
      }
      ground.setColorAt(i, color);
      i += 1;
    }
  }
  ground.instanceMatrix.needsUpdate = true;
  if (ground.instanceColor) ground.instanceColor.needsUpdate = true;

  const folGeo = geo(track, new THREE.BoxGeometry(1, 1, 1));
  const folMat = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.06,
    }),
  );
  const folCount = 1800;
  const foliage = new THREE.InstancedMesh(folGeo, folMat, folCount);
  const { writer, apply } = createWriter(folCount);
  for (const id of REGION_ORDER) populateRegion(writer, id, rng);
  apply(foliage);

  return { ground, foliage };
}

function onPath(x: number, z: number): boolean {
  for (const id of REGION_ORDER) {
    if (id === "court") continue;
    const r = REGIONS[id];
    const dx = r.x;
    const dz = r.z;
    const len = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, (x * dx + z * dz) / (len * len)));
    const px = dx * t;
    const pz = dz * t;
    if (Math.hypot(x - px, z - pz) < 2.4) return true;
  }
  return false;
}

export type LampRig = {
  root: THREE.Group;
  light: THREE.PointLight;
  glow: THREE.Sprite;
  shade?: THREE.Object3D;
  petals: THREE.Object3D[];
  glowBase: number;
};

export function buildLamp(
  track: Track,
  kind: LampKind,
  glowTex: THREE.Texture,
): LampRig {
  const def = LAMPS[kind];
  const root = new THREE.Group();
  const petals: THREE.Object3D[] = [];
  const brass = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0x6a4a28,
      roughness: 0.38,
      metalness: 0.72,
    }),
  );
  const iron = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0x1c1816,
      roughness: 0.58,
      metalness: 0.55,
    }),
  );
  const silver = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0x9aa4b4,
      roughness: 0.32,
      metalness: 0.7,
    }),
  );
  const emit = (color: number, em: number, extra?: Partial<THREE.MeshStandardMaterialParameters>) =>
    mat(
      track,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: em,
        roughness: 0.28,
        metalness: 0.12,
        ...extra,
      }),
    );

  const cyl = (rt: number, rb: number, h: number, segs = 10) =>
    geo(track, new THREE.CylinderGeometry(rt, rb, h, segs));
  const sph = (r: number) => geo(track, new THREE.SphereGeometry(r, 12, 10));

  let shade: THREE.Object3D | undefined;
  let lightY = 2.55;

  if (kind === "circulation" || kind === "nectar-trap") {
    root.add(meshAt(cyl(0.38, 0.42, 0.12, 12), brass, 0, 0.06, 0));
    root.add(meshAt(cyl(0.055, 0.06, 2.15, 8), brass, 0, 1.2, 0));
    const shadeMesh = new THREE.Mesh(
      geo(track, new THREE.ConeGeometry(0.82, 0.55, 12, 1, true)),
      emit(def.color, kind === "nectar-trap" ? 0.85 : 1.2, { side: THREE.DoubleSide }),
    );
    shadeMesh.position.y = 2.45;
    shadeMesh.rotation.x = Math.PI;
    if (kind === "nectar-trap") shadeMesh.rotation.z = 0.22;
    root.add(shadeMesh);
    root.add(meshAt(sph(0.13), emit(0xffe0a8, 1.6), 0, 2.22, 0));
    shade = shadeMesh;
    lightY = 2.3;
  } else if (kind === "reading") {
    root.add(meshAt(cyl(0.32, 0.36, 0.1, 12), brass, 0, 0.05, 0));
    const lower = new THREE.Mesh(cyl(0.045, 0.045, 1.15, 8), brass);
    lower.position.set(0.15, 0.75, 0);
    lower.rotation.z = 0.45;
    root.add(lower);
    const upper = new THREE.Mesh(cyl(0.04, 0.04, 0.95, 8), brass);
    upper.position.set(0.55, 1.55, 0);
    upper.rotation.z = -0.7;
    root.add(upper);
    const cone = new THREE.Mesh(
      geo(track, new THREE.ConeGeometry(0.55, 0.48, 12, 1, true)),
      emit(def.color, 1.1, { side: THREE.DoubleSide }),
    );
    cone.position.set(0.85, 1.85, 0);
    cone.rotation.x = Math.PI;
    root.add(cone);
    root.add(meshAt(sph(0.09), emit(0xffc878, 1.5), 0.85, 1.68, 0));
    shade = cone;
    lightY = 1.7;
  } else if (kind === "archive") {
    root.add(meshAt(cyl(0.22, 0.26, 0.1, 12), silver, 0, 0.05, 0));
    root.add(meshAt(cyl(0.07, 0.08, 2.8, 10), silver, 0, 1.45, 0));
    for (const y of [1.1, 1.85, 2.55]) {
      root.add(
        new THREE.Mesh(geo(track, new THREE.TorusGeometry(0.28, 0.035, 8, 16)), silver).translateY(y),
      );
    }
    const globe = new THREE.Mesh(sph(0.28), emit(def.color, 1.25));
    globe.position.y = 3.15;
    root.add(globe);
    shade = globe;
    lightY = 3.15;
  } else if (kind === "helix") {
    root.add(meshAt(cyl(0.2, 0.24, 0.1, 10), silver, 0, 0.05, 0));
    root.add(meshAt(cyl(0.05, 0.05, 2.4, 8), emit(def.color, 1.15), 0, 1.3, 0));
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const a = t * Math.PI * 4;
      const y = 0.5 + t * 2.1;
      const bead = new THREE.Mesh(sph(0.08), emit(0x9aefe0, 1.4));
      bead.position.set(Math.cos(a) * 0.32, y, Math.sin(a) * 0.32);
      root.add(bead);
      petals.push(bead);
      const bead2 = new THREE.Mesh(sph(0.08), emit(def.color, 1.2));
      bead2.position.set(Math.cos(a + Math.PI) * 0.32, y, Math.sin(a + Math.PI) * 0.32);
      root.add(bead2);
      petals.push(bead2);
    }
    shade = root;
    lightY = 2.2;
  } else if (kind === "zapper") {
    root.add(meshAt(cyl(0.48, 0.5, 0.1, 12), iron, 0, 0.06, 0));
    root.add(meshAt(cyl(0.06, 0.06, 1.1, 8), iron, 0, 0.65, 0));
    const cy = 2.15;
    root.add(meshAt(cyl(0.52, 0.52, 0.08, 12), iron, 0, cy - 0.7, 0));
    root.add(meshAt(cyl(0.52, 0.52, 0.08, 12), iron, 0, cy + 0.7, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bar = new THREE.Mesh(cyl(0.03, 0.03, 1.45, 6), iron);
      bar.position.set(Math.cos(a) * 0.46, cy, Math.sin(a) * 0.46);
      root.add(bar);
    }
    const tube = new THREE.Mesh(
      cyl(0.22, 0.22, 1.2, 10),
      emit(def.color, 1.35, { transparent: true, opacity: 0.72 }),
    );
    tube.position.y = cy;
    root.add(tube);
    shade = tube;
    lightY = cy;
  } else if (kind === "furnace") {
    root.add(meshAt(cyl(0.7, 0.78, 0.18, 12), iron, 0, 0.1, 0));
    root.add(meshAt(cyl(0.62, 0.68, 1.35, 12), iron, 0, 0.85, 0));
    const pit = new THREE.Mesh(cyl(0.38, 0.4, 0.9, 10), emit(0x1a0804, 0.2));
    pit.position.set(0, 0.85, 0.35);
    root.add(pit);
    const ember = new THREE.Mesh(sph(0.28), emit(def.color, 1.7));
    ember.position.set(0, 0.85, 0.38);
    root.add(ember);
    root.add(meshAt(cyl(0.16, 0.18, 0.7, 8), iron, 0.35, 1.75, -0.1));
    shade = ember;
    lightY = 0.95;
  } else if (kind === "wisp") {
    const core = new THREE.Mesh(sph(0.32), emit(def.color, 1.65));
    core.position.y = 2.2;
    root.add(core);
    shade = core;
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(sph(0.11), emit(0xd8a0ff, 1.2));
      p.position.set(Math.cos(i) * 0.45, 2.2, Math.sin(i) * 0.45);
      root.add(p);
      petals.push(p);
    }
    lightY = 2.2;
  } else {
    root.add(meshAt(cyl(0.04, 0.05, 3.1, 8), silver, 0, 1.55, 0));
    const orb = new THREE.Mesh(sph(0.72), emit(def.color, 1.45));
    orb.position.y = 3.35;
    root.add(orb);
    shade = orb;
    lightY = 3.35;
  }

  const pool = new THREE.Mesh(
    geo(track, new THREE.CircleGeometry(kind === "false-moon" ? 4.2 : 2.6, 20)),
    mat(
      track,
      new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    ),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.03;
  root.add(pool);

  const light = new THREE.PointLight(def.color, def.glow, 34, 1.35);
  light.position.y = lightY;
  root.add(light);

  const glow = new THREE.Sprite(
    mat(
      track,
      new THREE.SpriteMaterial({
        map: glowTex,
        color: def.color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  const s = kind === "false-moon" ? 7.2 : kind === "helix" ? 5.6 : kind === "wisp" ? 4.6 : 4.8;
  glow.scale.set(s, s, 1);
  glow.position.y = lightY;
  root.add(glow);

  return { root, light, glow, shade, petals, glowBase: s };
}

function meshAt(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

export function buildFriendMoth(track: Track): MothRig {
  const rig = buildMoth(track);
  rig.root.scale.setScalar(0.42);
  return rig;
}

export function makeFxRing(
  track: Track,
  glowTex: THREE.Texture,
  color: number,
): THREE.Sprite {
  const spr = new THREE.Sprite(
    mat(
      track,
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      }),
    ),
  );
  spr.scale.set(0.6, 0.6, 1);
  return spr;
}

export type ParticlePool = {
  mesh: THREE.InstancedMesh;
  spawn: (
    pos: THREE.Vector3,
    color: number,
    vel?: THREE.Vector3,
    life?: number,
    size?: number,
    endColor?: number,
  ) => void;
  tick: (dt: number) => void;
};

export function buildParticles(track: Track, cap = 720): ParticlePool {
  const g = geo(track, new THREE.OctahedronGeometry(0.55));
  const m = mat(
    track,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    }),
  );
  const mesh = new THREE.InstancedMesh(g, m, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();
  const lives = new Float32Array(cap);
  const maxL = new Float32Array(cap);
  const vx = new Float32Array(cap);
  const vy = new Float32Array(cap);
  const vz = new Float32Array(cap);
  const px = new Float32Array(cap);
  const py = new Float32Array(cap);
  const pz = new Float32Array(cap);
  const sz = new Float32Array(cap);
  const sr = new Float32Array(cap);
  const sg = new Float32Array(cap);
  const sb = new Float32Array(cap);
  const er = new Float32Array(cap);
  const eg = new Float32Array(cap);
  const eb = new Float32Array(cap);
  let cursor = 0;

  for (let i = 0; i < cap; i++) {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    lives[i] = 0;
  }

  return {
    mesh,
    spawn(pos, hex, vel, life = 0.7, size = 0.12, endColor) {
      const i = cursor;
      cursor = (cursor + 1) % cap;
      px[i] = pos.x;
      py[i] = pos.y;
      pz[i] = pos.z;
      vx[i] = vel?.x ?? (Math.random() - 0.5) * 2;
      vy[i] = vel?.y ?? Math.random() * 2;
      vz[i] = vel?.z ?? (Math.random() - 0.5) * 2;
      lives[i] = life;
      maxL[i] = life;
      sz[i] = size;
      c0.setHex(hex);
      c1.setHex(endColor ?? hex);
      sr[i] = c0.r;
      sg[i] = c0.g;
      sb[i] = c0.b;
      er[i] = c1.r;
      eg[i] = c1.g;
      eb[i] = c1.b;
      color.copy(c0);
      mesh.setColorAt(i, color);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    tick(dt) {
      for (let i = 0; i < cap; i++) {
        if (lives[i]! <= 0) {
          dummy.scale.setScalar(0);
          dummy.position.set(0, -40, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        lives[i]! -= dt;
        px[i]! += vx[i]! * dt;
        py[i]! += vy[i]! * dt;
        pz[i]! += vz[i]! * dt;
        vy[i]! -= 1.6 * dt;
        const k = Math.max(0, lives[i]! / Math.max(0.001, maxL[i]!));
        dummy.position.set(px[i]!, py[i]!, pz[i]!);
        dummy.rotation.y += dt * 4;
        dummy.scale.setScalar(sz[i]! * (0.35 + k));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.setRGB(
          er[i]! + (sr[i]! - er[i]!) * k,
          eg[i]! + (sg[i]! - eg[i]!) * k,
          eb[i]! + (sb[i]! - eb[i]!) * k,
        );
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
