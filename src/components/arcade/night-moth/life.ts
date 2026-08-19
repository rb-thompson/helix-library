/**
 * Living things that are not lamps: beetles, spiders, blooms, dragonflies, bosses.
 * Mites stay in the engine (combat already wired). This module owns the rest.
 */

import * as THREE from "three";
import {
  BEETLE,
  BLOOMS,
  BLOOM_SITES,
  BOSSES,
  DRAGONFLY,
  POLLINATE_RANGE,
  RETREAT,
  SPIDER,
  WATERWAYS,
  WEB_RADIUS,
  WEB_SITES,
  WEB_TRIGGER_Y,
  beetleScore,
  canEscapeBoss,
  composeEvents,
  composeFauna,
  heightAt,
  infestationCount,
  isBossEvent,
  minFlyY,
  spiderScore,
  waterwayPoint,
  type BloomDef,
  type BloomSite,
  type BossId,
  type EventPlan,
  type NightEventKind,
} from "@/lib/arcade/night-moth";
import { geo, mat, type ParticlePool, type Track } from "./voxels";

export type ExtraBlip = {
  dx: number;
  dz: number;
  tone: "mite" | "beetle" | "boss" | "bloom" | "web";
};

export type HudEvent = {
  kind: NightEventKind;
  title: string;
  line: string;
  remaining: number;
  trackable: boolean;
  x: number;
  z: number;
} | null;

export type LifeCtx = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  look: THREE.Vector3;
  night: number;
  t: number;
  veiled: boolean;
  invuln: number;
  rng: () => number;
  particles: ParticlePool;
  hurt: (n: number, msg: string) => void;
  apply: (id: "webbed" | "dazed" | "moonlit" | "nectar-glow", dur?: number) => void;
  say: (msg: string) => void;
  addScore: (n: number) => void;
  addXp: (n: number) => void;
  addNectar: (n: number) => void;
  combo: (e: "spark" | "lure-kill") => void;
  mash: boolean;
};

type BeetleEnt = {
  pos: THREE.Vector3;
  heading: number;
  hp: number;
  root: THREE.Group;
};

type WebEnt = {
  site: (typeof WEB_SITES)[number];
  revealed: boolean;
  done: boolean;
  escape: number;
  hits: number;
  group: THREE.Group;
  silk: THREE.Mesh;
  spider: THREE.Group;
};

type BloomEnt = {
  site: BloomSite;
  drunk: boolean;
  group: THREE.Group;
};

type FlyEnt = {
  u: number;
  way: number;
  phase: number;
  root: THREE.Group;
};

type BossEnt = {
  id: BossId;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  max: number;
  root: THREE.Group;
  left: THREE.Object3D;
  right: THREE.Object3D;
};

export type LifeWorld = {
  spawnNight: (night: number, rng: () => number) => void;
  clear: () => void;
  tick: (dt: number, ctx: LifeCtx) => void;
  applyRadius: (at: THREE.Vector3, radius: number, dmg: number) => boolean;
  applyCone: (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    range: number,
    cosMin: number,
    dmg: number,
  ) => boolean;
  applyRay: (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    radius: number,
    dmg: number,
  ) => boolean;
  pollinate: (pos: THREE.Vector3) => BloomDef | null;
  mashWeb: () => void;
  takeMiteSwarm: () => number;
  event: () => HudEvent;
  blips: (ox: number, oz: number) => ExtraBlip[];
  aurora: () => number;
  webProgress: () => number;
};

export function createLife(
  scene: THREE.Scene,
  track: Track,
  glowTex: THREE.Texture,
): LifeWorld {
  const beetles: BeetleEnt[] = [];
  const webs: WebEnt[] = [];
  const blooms: BloomEnt[] = [];
  const flies: FlyEnt[] = [];
  let boss: BossEnt | null = null;
  let plans: EventPlan[] = [];
  let fired = new Set<number>();
  let active: EventPlan | null = null;
  let activeT = 0;
  let auroraK = 0;
  let miteSwarm = 0;

  const beetleGeo = geo(track, new THREE.BoxGeometry(1, 1, 1));
  const silkGeo = geo(track, new THREE.PlaneGeometry(1, 1));
  const silkMat = mat(
    track,
    new THREE.MeshBasicMaterial({
      color: 0xd8d0c4,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  function clear() {
    for (const b of beetles) scene.remove(b.root);
    for (const w of webs) scene.remove(w.group);
    for (const p of blooms) scene.remove(p.group);
    for (const f of flies) scene.remove(f.root);
    if (boss) scene.remove(boss.root);
    beetles.length = 0;
    webs.length = 0;
    blooms.length = 0;
    flies.length = 0;
    boss = null;
    plans = [];
    fired = new Set();
    active = null;
    activeT = 0;
    auroraK = 0;
    miteSwarm = 0;
  }

  function spawnBeetle(x: number, z: number) {
    const root = new THREE.Group();
    const y = heightAt(x, z) + 0.22;
    const shell = new THREE.Mesh(
      beetleGeo,
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color: BEETLE.color,
          roughness: 0.55,
          metalness: 0.25,
          emissive: BEETLE.gleam,
          emissiveIntensity: 0.12,
        }),
      ),
    );
    shell.scale.set(0.55, 0.28, 0.85);
    root.add(shell);
    const horn = new THREE.Mesh(
      beetleGeo,
      mat(track, new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.5 })),
    );
    horn.position.set(0, 0.08, 0.42);
    horn.scale.set(0.08, 0.08, 0.35);
    root.add(horn);
    root.position.set(x, y, z);
    scene.add(root);
    beetles.push({
      pos: new THREE.Vector3(x, y, z),
      heading: Math.random() * Math.PI * 2,
      hp: BEETLE.hp,
      root,
    });
  }

  function spawnWeb(site: (typeof WEB_SITES)[number]) {
    const group = new THREE.Group();
    const y = heightAt(site.x, site.z) + 1.4;
    group.position.set(site.x, y, site.z);
    const silk = new THREE.Mesh(silkGeo, silkMat.clone());
    silk.scale.set(4.2, 4.2, 1);
    silk.visible = false;
    group.add(silk);
    const spider = new THREE.Group();
    const body = new THREE.Mesh(
      beetleGeo,
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color: SPIDER.color,
          roughness: 0.45,
          emissive: SPIDER.gleam,
          emissiveIntensity: 0.2,
        }),
      ),
    );
    body.scale.set(0.38, 0.22, 0.5);
    spider.add(body);
    for (let i = 0; i < 8; i++) {
      const leg = new THREE.Mesh(
        beetleGeo,
        mat(track, new THREE.MeshStandardMaterial({ color: 0x120c0c })),
      );
      const side = i < 4 ? 1 : -1;
      const k = i % 4;
      leg.scale.set(0.05, 0.05, 0.55);
      leg.position.set(side * 0.22, -0.02, (k - 1.5) * 0.12);
      leg.rotation.z = side * 0.7;
      spider.add(leg);
    }
    spider.visible = false;
    group.add(spider);
    scene.add(group);
    webs.push({
      site,
      revealed: false,
      done: false,
      escape: 0,
      hits: 0,
      group,
      silk,
      spider,
    });
  }

  function spawnBloom(site: BloomSite) {
    const group = new THREE.Group();
    const def = BLOOMS[site.kind];
    const y = heightAt(site.x, site.z);
    const stem = new THREE.Mesh(
      beetleGeo,
      mat(track, new THREE.MeshStandardMaterial({ color: 0x1a4020, roughness: 0.8 })),
    );
    stem.scale.set(0.08, 1.4, 0.08);
    stem.position.y = 0.7;
    group.add(stem);
    const color = site.kind === "moonflower" ? 0xf4f0e0 : 0xe8c48a;
    const bloom = new THREE.Mesh(
      geo(track, new THREE.ConeGeometry(0.45, 0.55, 7)),
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: site.kind === "moonflower" ? 0.7 : 0.4,
          roughness: 0.4,
        }),
      ),
    );
    bloom.position.y = 1.45;
    bloom.rotation.x = Math.PI;
    group.add(bloom);
    const spr = new THREE.Sprite(
      mat(
        track,
        new THREE.SpriteMaterial({
          map: glowTex,
          color,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.55,
        }),
      ),
    );
    spr.scale.set(1.8, 1.8, 1);
    spr.position.y = 1.5;
    group.add(spr);
    group.position.set(site.x, y, site.z);
    scene.add(group);
    void def;
    blooms.push({ site, drunk: false, group });
  }

  function spawnFly(way: number, u: number) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(
      beetleGeo,
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color: DRAGONFLY.color,
          emissive: DRAGONFLY.gleam,
          emissiveIntensity: 0.45,
          roughness: 0.35,
        }),
      ),
    );
    body.scale.set(0.08, 0.08, 0.42);
    root.add(body);
    const wing = new THREE.Mesh(
      beetleGeo,
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color: 0xa8e0d0,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        }),
      ),
    );
    wing.scale.set(0.55, 0.02, 0.16);
    wing.position.y = 0.04;
    root.add(wing);
    scene.add(root);
    flies.push({ u, way, phase: Math.random() * Math.PI * 2, root });
  }

  function spawnBoss(id: BossId, rng: () => number) {
    if (boss) {
      scene.remove(boss.root);
      boss = null;
    }
    const def = BOSSES[id];
    const root = new THREE.Group();
    const body = new THREE.Mesh(
      beetleGeo,
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color: def.color,
          roughness: 0.45,
          metalness: 0.15,
          emissive: def.color,
          emissiveIntensity: 0.25,
        }),
      ),
    );
    const isBat = id === "bat";
    body.scale.set(isBat ? 1.1 : 0.55, isBat ? 0.45 : 0.4, isBat ? 1.6 : 1.1);
    root.add(body);
    const left = new THREE.Group();
    const right = new THREE.Group();
    const wing = new THREE.Mesh(
      beetleGeo,
      mat(
        track,
        new THREE.MeshStandardMaterial({
          color: isBat ? 0x2a1828 : 0xf0c030,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          emissive: def.color,
          emissiveIntensity: 0.2,
        }),
      ),
    );
    wing.scale.set(isBat ? 2.4 : 1.4, 0.04, isBat ? 1.1 : 0.45);
    left.add(wing);
    const wing2 = wing.clone();
    right.add(wing2);
    left.position.set(0.6, 0.1, 0);
    right.position.set(-0.6, 0.1, 0);
    root.add(left, right);
    const glow = new THREE.Sprite(
      mat(
        track,
        new THREE.SpriteMaterial({
          map: glowTex,
          color: def.color,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.5,
        }),
      ),
    );
    glow.scale.set(3.2, 2.2, 1);
    root.add(glow);
    const ang = rng() * Math.PI * 2;
    const rad = 40 + rng() * 30;
    const pos = new THREE.Vector3(Math.cos(ang) * rad, 10 + rng() * 4, Math.sin(ang) * rad);
    root.position.copy(pos);
    scene.add(root);
    boss = {
      id,
      pos,
      vel: new THREE.Vector3(),
      hp: def.hp,
      max: def.hp,
      root,
      left,
      right,
    };
  }

  function killBoss(ctx: LifeCtx) {
    if (!boss) return;
    const def = BOSSES[boss.id];
    ctx.addScore(def.score * Math.max(1, ctx.night));
    ctx.addXp(def.xp);
    ctx.combo("lure-kill");
    ctx.say(`${def.name} falls.`);
    burst(ctx, boss.pos, def.color);
    scene.remove(boss.root);
    boss = null;
    active = null;
  }

  function burst(ctx: LifeCtx, at: THREE.Vector3, color: number) {
    for (let i = 0; i < 16; i++) {
      ctx.particles.spawn(
        at,
        color,
        new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6),
        0.6,
        0.12,
      );
    }
  }

  function damageFoe(at: THREE.Vector3, radius: number, dmg: number): boolean {
    let hit = false;
    for (const b of beetles) {
      if (b.hp > 0 && b.pos.distanceTo(at) < radius + 0.5) {
        b.hp -= dmg;
        hit = true;
      }
    }
    for (const w of webs) {
      if (w.revealed && !w.done && w.group.position.distanceTo(at) < radius + 0.8) {
        w.done = true;
        w.spider.visible = false;
        hit = true;
      }
    }
    if (boss && boss.pos.distanceTo(at) < radius + 1.4) {
      boss.hp -= dmg;
      hit = true;
    }
    return hit;
  }

  function reap(ctx: LifeCtx) {
    for (const b of beetles) {
      if (b.hp > 0) continue;
      if (!b.root.visible) continue;
      b.root.visible = false;
      scene.remove(b.root);
      ctx.addScore(beetleScore(ctx.night));
      ctx.combo("spark");
      burst(ctx, b.pos, BEETLE.gleam);
    }
    for (const w of webs) {
      if (w.done && w.spider.parent) {
        ctx.addScore(spiderScore(ctx.night));
        ctx.combo("lure-kill");
        burst(ctx, w.group.position, SPIDER.gleam);
        w.spider.removeFromParent();
      }
    }
    if (boss && boss.hp <= 0) killBoss(ctx);
  }

  return {
    spawnNight(n, rng) {
      clear();
      const mix = composeFauna(n, rng);
      plans = composeEvents(n, rng);
      for (let i = 0; i < mix.beetles; i++) {
        const a = rng() * Math.PI * 2;
        const rad = 18 + rng() * 90;
        spawnBeetle(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      const websPick = [...WEB_SITES].sort(() => rng() - 0.5).slice(0, mix.webs);
      for (const s of websPick) spawnWeb(s);
      for (const s of BLOOM_SITES) spawnBloom(s);
      for (let i = 0; i < mix.dragonflies; i++) {
        spawnFly(i % WATERWAYS.length, rng());
      }
    },
    clear,
    tick(dt, ctx) {
      const t = ctx.t;
      auroraK = Math.max(0, auroraK - dt * 0.08);

      if (active) {
        activeT -= dt;
        if (active.kind === "aurora") auroraK = Math.min(1, auroraK + dt * 0.4);
        if (activeT <= 0) {
          if (active.kind === "bat" && boss?.id === "bat") {
            ctx.say("The bat leaves the grounds.");
            scene.remove(boss.root);
            boss = null;
          }
          if (active.kind !== "wasp") {
            active = null;
          } else {
            activeT = 8;
          }
        }
      }

      const elapsed = t;
      for (let i = 0; i < plans.length; i++) {
        const p = plans[i]!;
        if (fired.has(i) || elapsed < p.at) continue;
        fired.add(i);
        active = p;
        activeT = p.duration;
        if (p.alert) ctx.say(`${p.title}. ${p.line}`.trim());
        if (p.kind === "aurora") auroraK = 0.2;
        if (isBossEvent(p.kind)) spawnBoss(p.kind, ctx.rng);
        if (p.kind === "mite-swarm") {
          miteSwarm += infestationCount("mite", ctx.night);
        }
        if (p.kind === "beetle-swarm") {
          const n = infestationCount("beetle", ctx.night);
          for (let k = 0; k < n; k++) {
            const a = ctx.rng() * Math.PI * 2;
            spawnBeetle(
              ctx.pos.x + Math.cos(a) * (8 + ctx.rng() * 14),
              ctx.pos.z + Math.sin(a) * (8 + ctx.rng() * 14),
            );
          }
        }
      }

      for (const b of beetles) {
        if (b.hp <= 0) continue;
        b.heading += (ctx.rng() - 0.5) * dt * 1.8;
        const gx = Math.sin(b.heading) * BEETLE.speed * dt;
        const gz = Math.cos(b.heading) * BEETLE.speed * dt;
        b.pos.x += gx;
        b.pos.z += gz;
        b.pos.y = heightAt(b.pos.x, b.pos.z) + 0.22;
        b.root.position.copy(b.pos);
        b.root.rotation.y = b.heading;
        if (ctx.pos.distanceTo(b.pos) < 1.15 && ctx.pos.y < b.pos.y + 1.1 && ctx.invuln <= 0) {
          ctx.hurt(BEETLE.contact, "A beetle snaps the tibia.");
        }
      }

      for (const w of webs) {
        if (w.done) continue;
        const d = Math.hypot(ctx.pos.x - w.site.x, ctx.pos.z - w.site.z);
        const low = ctx.pos.y < heightAt(w.site.x, w.site.z) + WEB_TRIGGER_Y;
        if (!w.revealed && d < WEB_RADIUS && low) {
          w.revealed = true;
          w.silk.visible = true;
          w.spider.visible = true;
          w.escape = SPIDER.escapeWindow;
          w.hits = 0;
          ctx.apply("webbed", SPIDER.escapeWindow);
          ctx.say("Silk. Mash Space — get out.");
        }
        if (w.revealed && !w.done) {
          w.escape -= dt;
          w.spider.position.y = Math.sin(t * 6) * 0.15;
          (w.silk.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.12 * Math.sin(t * 8);
          if (ctx.mash) w.hits += 1;
          if (w.hits >= SPIDER.escapeHits) {
            w.done = true;
            w.silk.visible = false;
            w.spider.visible = false;
            ctx.addScore(spiderScore(ctx.night));
            ctx.say("The web tears.");
          } else if (w.escape <= 0) {
            ctx.hurt(SPIDER.contact, "The spider finishes the wrap.");
            ctx.apply("dazed", 1.6);
            w.done = true;
            w.silk.visible = false;
          }
        }
      }

      for (const p of blooms) {
        if (p.drunk) continue;
        p.group.rotation.y = t * 0.4;
      }

      for (const f of flies) {
        f.u = (f.u + dt * 0.06) % 1;
        const way = WATERWAYS[f.way] ?? WATERWAYS[0]!;
        const p = waterwayPoint(way, f.u);
        const y = Math.max(minFlyY(p.x, p.z) + 0.4, 2.2 + Math.sin(t * 2 + f.phase) * 0.6);
        f.root.position.set(
          p.x + Math.sin(t + f.phase) * 1.4,
          y,
          p.z + Math.cos(t * 0.8 + f.phase) * 1.4,
        );
        f.root.rotation.y = p.heading;
        const wing = f.root.children[1];
        if (wing) wing.rotation.z = Math.sin(t * 40 + f.phase) * 0.5;
        if (ctx.pos.distanceTo(f.root.position) < 1.6) {
          ctx.apply("nectar-glow", 1.2);
        }
      }

      if (boss) {
        const def = BOSSES[boss.id];
        const d =
          Math.hypot(
            ctx.pos.x - boss.pos.x,
            ctx.pos.y - boss.pos.y,
            ctx.pos.z - boss.pos.z,
          ) || 1;
        const chase = boss.id === "wasp" ? 7.2 : 5.4;
        const k = 1 - Math.exp(-1.8 * dt);
        boss.vel.x += (((ctx.pos.x - boss.pos.x) / d) * chase - boss.vel.x) * k;
        boss.vel.y += (((ctx.pos.y - boss.pos.y) / d) * chase - boss.vel.y) * k;
        boss.vel.z += (((ctx.pos.z - boss.pos.z) / d) * chase - boss.vel.z) * k;
        if (ctx.veiled) boss.vel.multiplyScalar(0.4);
        boss.pos.addScaledVector(boss.vel, dt);
        boss.pos.y = Math.max(minFlyY(boss.pos.x, boss.pos.z) + 1.2, boss.pos.y);
        boss.root.position.copy(boss.pos);
        boss.root.lookAt(ctx.pos);
        const flap = Math.sin(t * (boss.id === "bat" ? 10 : 22)) * 0.55;
        boss.left.rotation.z = flap;
        boss.right.rotation.z = -flap;
        if (d < 1.8 && ctx.invuln <= 0) {
          ctx.hurt(def.contact, `${def.name} hits the thorax.`);
        }
        if (canEscapeBoss(boss.id, ctx.pos.x, ctx.pos.z)) {
          ctx.say("The retreat takes you in. The bat loses the scent.");
          scene.remove(boss.root);
          boss = null;
          active = null;
        } else if (Math.random() < dt * 8) {
          ctx.particles.spawn(
            boss.pos.clone(),
            def.color,
            new THREE.Vector3((Math.random() - 0.5) * 2, 0.4, (Math.random() - 0.5) * 2),
            0.3,
            0.1,
          );
        }
      }

      reap(ctx);
    },
    applyRadius(at, radius, dmg) {
      return damageFoe(at, radius, dmg);
    },
    applyCone(origin, dir, range, cosMin, dmg) {
      let hit = false;
      const consider = (p: THREE.Vector3) => {
        const w = p.clone().sub(origin);
        const d = w.length();
        if (d > range || d < 0.01) return;
        if (w.normalize().dot(dir) >= cosMin) {
          damageFoe(p, 0.8, dmg);
          hit = true;
        }
      };
      for (const b of beetles) if (b.hp > 0) consider(b.pos);
      if (boss) consider(boss.pos);
      return hit;
    },
    applyRay(origin, dir, len, radius, dmg) {
      const hitAt = (p: THREE.Vector3) => {
        const w = p.clone().sub(origin);
        const t = Math.max(0, w.dot(dir));
        const proj = origin.clone().addScaledVector(dir, t);
        return proj.distanceTo(p) < radius && origin.distanceTo(p) < len;
      };
      let hit = false;
      for (const b of beetles) {
        if (b.hp > 0 && hitAt(b.pos)) {
          b.hp -= dmg;
          hit = true;
        }
      }
      if (boss && hitAt(boss.pos)) {
        boss.hp -= dmg;
        hit = true;
      }
      return hit;
    },
    pollinate(pos) {
      for (const p of blooms) {
        if (p.drunk) continue;
        const d = Math.hypot(pos.x - p.site.x, pos.z - p.site.z);
        if (d > POLLINATE_RANGE) continue;
        if (pos.y > heightAt(p.site.x, p.site.z) + 3.2) continue;
        p.drunk = true;
        p.group.scale.setScalar(0.55);
        return BLOOMS[p.site.kind];
      }
      return null;
    },
    mashWeb() {
      for (const w of webs) {
        if (w.revealed && !w.done) w.hits += 1;
      }
    },
    takeMiteSwarm() {
      const n = miteSwarm;
      miteSwarm = 0;
      return n;
    },
    event() {
      if (!active || !active.alert) return null;
      const x = boss ? boss.pos.x : RETREAT.x;
      const z = boss ? boss.pos.z : RETREAT.z;
      return {
        kind: active.kind,
        title: active.title,
        line: active.line,
        remaining: Math.max(0, activeT),
        trackable: active.trackable,
        x,
        z,
      };
    },
    blips(ox, oz) {
      const out: ExtraBlip[] = [];
      for (const b of beetles) {
        if (b.hp <= 0) continue;
        out.push({ dx: b.pos.x - ox, dz: b.pos.z - oz, tone: "beetle" });
      }
      for (const w of webs) {
        if (!w.revealed || w.done) continue;
        out.push({ dx: w.site.x - ox, dz: w.site.z - oz, tone: "web" });
      }
      for (const p of blooms) {
        if (p.drunk) continue;
        out.push({ dx: p.site.x - ox, dz: p.site.z - oz, tone: "bloom" });
      }
      if (boss) out.push({ dx: boss.pos.x - ox, dz: boss.pos.z - oz, tone: "boss" });
      return out.slice(0, 24);
    },
    aurora() {
      return auroraK;
    },
    webProgress() {
      const w = webs.find((x) => x.revealed && !x.done);
      if (!w) return 0;
      return w.hits / SPIDER.escapeHits;
    },
  };
}

export function bloomReward(kind: BloomSite["kind"]) {
  return BLOOMS[kind];
}
