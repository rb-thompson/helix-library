/**
 * Night Moth — client game loop.
 * Three.js scene + flight + lamps + combat. Snapshot is the React HUD contract.
 */

import * as THREE from "three";
import {
  ABILITIES,
  ABILITY_ORDER,
  ARENA_RADIUS,
  CONDITIONS,
  DASH_STAMINA,
  INSPECT_RANGE,
  LAMPS,
  MAX_HP,
  MAX_STAMINA,
  SIPHON_RANGE,
  SIP_RANGE,
  abilityDamage,
  applyCombo,
  composeNight,
  contactDamage,
  isLure,
  isTrueLamp,
  lampHp,
  lureKillScore,
  nightClearScore,
  sipOutcome,
  scatterRegionId,
  sparkKillScore,
  nextAbility,
  nextUnlock,
  unlockedAbilities,
  xpForLureKill,
  BONUS_NECTAR,
  BONUS_SCORE,
  BONUS_XP,
  bearingDeg,
  compassLabel,
  regionAt,
  REGIONS,
  type AbilityId,
  type ConditionId,
  type LampKind,
} from "@/lib/arcade/night-moth";
import { createMothAudio, type MothAudio } from "./audio";
import {
  buildFriendMoth,
  buildGarden,
  buildLamp,
  buildMoth,
  buildParticles,
  buildSky,
  createTrack,
  disposeTrack,
  flapMoth,
  glowTexture,
  makeFxRing,
  type LampRig,
  type MothRig,
  type ParticlePool,
  type SkyRig,
  type Track,
} from "./voxels";
import { buildHabitat, type Habitat } from "./habitat";

export type HudCondition = {
  id: ConditionId;
  name: string;
  tone: "boon" | "bane" | "mixed";
  remaining: number;
};

export type HudAbility = {
  id: AbilityId;
  name: string;
  key: string;
  ready: boolean;
  cooldown: number;
  maxCooldown: number;
  unlocked: boolean;
  selected: boolean;
  kind: AbilityId extends never ? never : (typeof ABILITIES)[AbilityId]["kind"];
};

export type HudLamp = {
  name: string;
  kind: LampKind | "unknown";
  tell: string;
  known: boolean;
  safe: boolean | null;
  range: number;
  canSip: boolean;
};

export type HudBlip = {
  dx: number;
  dz: number;
  known: boolean;
  safe: boolean | null;
  drunk: boolean;
  lure: boolean;
};

export type EngineMode = "boot" | "title" | "playing" | "paused" | "dead";

export type EngineSnapshot = {
  mode: EngineMode;
  tutorial: boolean;
  tutorialStep: number;
  tutorialHint: string;
  hp: number;
  maxHp: number;
  stamina: number;
  nectar: number;
  score: number;
  combo: number;
  xp: number;
  runXp: number;
  night: number;
  timeMs: number;
  conditions: HudCondition[];
  nearest: HudLamp | null;
  abilities: HudAbility[];
  selected: AbilityId;
  message: string | null;
  flash: number;
  pointerLocked: boolean;
  region: string;
  heading: string;
  objective: string;
  trueLeft: number;
  pipDeg: number | null;
  pipDist: number | null;
  blips: HudBlip[];
};

export type RunResult = {
  score: number;
  night: number;
  nectar: number;
  durationMs: number;
  xp: number;
  abilities: AbilityId[];
};

export type EngineHooks = {
  onSnapshot: (s: EngineSnapshot) => void;
  onDeath: (result: RunResult) => void;
  onProgress: (xp: number, tutorialDone: boolean) => void;
};

export type StartOpts = {
  tutorial: boolean;
  xp: number;
  unlocked: AbilityId[];
};

type LampEnt = {
  id: number;
  kind: LampKind;
  pos: THREE.Vector3;
  hp: number;
  drunk: boolean;
  inert: number;
  known: boolean;
  rig: LampRig;
  hunt: THREE.Vector3;
  collapse: number;
  sipFlash: number;
  relocating: number;
};

type FriendEnt = {
  rig: MothRig;
  home: LampEnt;
  angle: number;
  radius: number;
  height: number;
  scare: number;
};

type FxRing = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  max: number;
};

type SparkEnt = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  mesh: THREE.Mesh;
};

type CloudEnt = {
  pos: THREE.Vector3;
  radius: number;
  life: number;
  damage: number;
};

type DustBolt = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  radius: number;
  group: THREE.Group;
  trail: number;
};

const TUTORIAL_HINTS = [
  "Look with the mouse. Hold W — you fly where the visor points.",
  "The steady amber ahead is Circulation. Close in and press E to drink.",
  "Green flicker is a cage. Click to dust it. Do not drink.",
  "The last amber misses a beat — a painted lantern. Leave it.",
  "The grounds open. The visor names the region. Follow the pip to the next true lamp.",
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NightMothEngine {
  private hooks: EngineHooks;
  private mountEl: HTMLElement;
  private track: Track;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private moth: MothRig;
  private glowTex: THREE.Texture;
  private sky: SkyRig;
  private habitat: Habitat;
  private visorLight: THREE.SpotLight;
  private visorTarget: THREE.Object3D;
  private particles: ParticlePool;
  private meteorT = 0;
  private audio: MothAudio;
  private lamps: LampEnt[] = [];
  private sparks: SparkEnt[] = [];
  private clouds: CloudEnt[] = [];
  private bolts: DustBolt[] = [];
  private friends: FriendEnt[] = [];
  private rings: FxRing[] = [];
  private sparkGeo: THREE.BufferGeometry;
  private sparkMat: THREE.MeshBasicMaterial;
  private dustGeo: THREE.BoxGeometry;
  private dustMat: THREE.MeshBasicMaterial;
  private dustTipMat: THREE.SpriteMaterial;

  private keys = new Set<string>();
  private yaw = 0;
  private pitch = -0.12;
  private pos = new THREE.Vector3(0, 3.2, 10);
  private vel = new THREE.Vector3();
  private look = new THREE.Vector3(0, 0, -1);
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private dummy = new THREE.Object3D();

  private mode: EngineMode = "title";
  private tutorial = false;
  private tutorialStep = 0;
  private hp = MAX_HP;
  private stamina = MAX_STAMINA;
  private nectar = 0;
  private score = 0;
  private combo = 0;
  private xp = 0;
  private runXp = 0;
  private night = 1;
  private timeMs = 0;
  private conditions = new Map<ConditionId, number>();
  private cds = new Map<AbilityId, number>();
  private selected: AbilityId = "scale-dust";
  private unlocked: AbilityId[] = unlockedAbilities(0);
  private message: string | null = null;
  private messageT = 0;
  private flash = 0;
  private pointerLocked = false;
  private invuln = 0;
  private nightClosing = 0;
  private titleT = 0;
  private lastSnap = 0;
  private relocateT = 18;
  private dragging = false;
  private lastPx = 0;
  private lastPy = 0;
  private dragMoved = 0;

  private raf = 0;
  private last = 0;
  private disposed = false;
  private lampSeq = 1;
  private rng = mulberry32(0x51a7);

  constructor(mount: HTMLElement, hooks: EngineHooks) {
    this.mountEl = mount;
    this.hooks = hooks;
    this.track = createTrack();

    const w = Math.max(16, mount.clientWidth);
    const h = Math.max(16, mount.clientHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10182c);
    this.scene.fog = new THREE.Fog(0x141c30, 55, 240);

    this.camera = new THREE.PerspectiveCamera(64, w / h, 0.15, 1800);
    this.camera.position.set(0, 6, 16);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.42;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.outline = "none";
    this.renderer.domElement.style.cursor = "crosshair";

    const hemi = new THREE.HemisphereLight(0x6a88b8, 0x1a1410, 0.72);
    this.scene.add(hemi);
    const moonKey = new THREE.DirectionalLight(0xc8d4e8, 0.55);
    moonKey.position.set(-40, 50, -20);
    this.scene.add(moonKey);
    this.scene.add(new THREE.AmbientLight(0x3a4860, 0.42));

    this.glowTex = glowTexture(this.track);
    this.sky = buildSky(this.track, this.glowTex);
    this.scene.add(this.sky.group);
    const garden = buildGarden(this.track, this.rng);
    this.scene.add(garden.ground);
    this.scene.add(garden.foliage);
    this.habitat = buildHabitat(this.track, this.glowTex);
    this.scene.add(this.habitat.group);

    this.moth = buildMoth(this.track);
    this.scene.add(this.moth.root);

    this.visorTarget = new THREE.Object3D();
    this.scene.add(this.visorTarget);
    this.visorLight = new THREE.SpotLight(0xb8d4e8, 3.4, 36, 0.48, 0.45, 1.15);
    this.visorLight.position.set(0, 3.6, 10);
    this.visorLight.target = this.visorTarget;
    this.scene.add(this.visorLight);

    this.particles = buildParticles(this.track);
    this.scene.add(this.particles.mesh);

    this.sparkGeo = new THREE.SphereGeometry(0.22, 8, 6);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xb8ff6a,
      toneMapped: false,
    });
    this.dustGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0xe8b86a,
      toneMapped: false,
    });
    this.dustTipMat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: 0xffd080,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.95,
    });
    this.track.geos.push(this.sparkGeo, this.dustGeo);
    this.track.mats.push(this.sparkMat, this.dustMat, this.dustTipMat);

    this.audio = createMothAudio();

    this.bind();
    this.placeTitleLamp();
    this.emit();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  start(opts: StartOpts): void {
    this.xp = opts.xp;
    this.unlocked = unique(unlockedAbilities(opts.xp).concat(opts.unlocked));
    this.selected = this.unlocked.includes("scale-dust")
      ? "scale-dust"
      : (this.unlocked[0] ?? "scale-dust");
    this.tutorial = opts.tutorial;
    this.tutorialStep = 0;
    this.hp = MAX_HP;
    this.stamina = MAX_STAMINA;
    this.nectar = 0;
    this.score = 0;
    this.combo = 0;
    this.runXp = 0;
    this.night = opts.tutorial ? 0 : 1;
    this.timeMs = 0;
    this.conditions.clear();
    this.cds.clear();
    this.pos.set(0, 4.6, 16);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = -0.06;
    this.invuln = 1;
    this.nightClosing = 0;
    this.mode = "playing";
    this.say(
      opts.tutorial
        ? "First night. The lamp on the cart is honest. The others are not."
        : "The grounds are open. Judge the light.",
    );
    this.clearEntities();
    for (const b of this.habitat.bonuses) {
      b.taken = false;
      b.mesh.visible = true;
    }
    this.relocateT = 16;
    if (opts.tutorial) this.spawnTutorial();
    else this.spawnNight(1);
    this.requestLock();
    this.emit();
  }

  pause(): void {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    this.releaseLock();
    this.emit();
  }

  resume(): void {
    if (this.mode !== "paused") return;
    this.mode = "playing";
    this.requestLock();
    this.emit();
  }

  togglePause(): void {
    if (this.mode === "playing") this.pause();
    else if (this.mode === "paused") this.resume();
  }

  toTitle(): void {
    this.mode = "title";
    this.tutorial = false;
    this.releaseLock();
    this.clearEntities();
    this.placeTitleLamp();
    this.pos.set(0, 3.2, 10);
    this.emit();
  }

  selectAbility(id: AbilityId): void {
    const have = this.liveUnlocks();
    if (!have.includes(id)) {
      this.say("That art is still locked. Gather more XP.");
      this.emit();
      return;
    }
    this.unlocked = have;
    this.selected = id;
    this.say(`${ABILITIES[id].name} — ${ABILITIES[id].how}`);
    this.emit();
  }

  cycleAbility(dir: 1 | -1): void {
    const list = this.liveUnlocks();
    this.unlocked = list;
    const next = nextAbility(list, this.selected, dir);
    if (list.length <= 1) {
      const more = nextUnlock(this.xp + this.runXp);
      this.say(
        more
          ? `${ABILITIES[this.selected].name} is the only art open. ${more.remaining} XP to ${more.name}.`
          : `${ABILITIES[this.selected].name} is equipped.`,
      );
      this.emit();
      return;
    }
    this.selected = next;
    this.say(`${ABILITIES[next].name} — ${ABILITIES[next].how}`);
    this.emit();
  }

  snapshotRun(): RunResult {
    const xp = this.xp + this.runXp;
    return {
      score: this.score,
      night: Math.max(1, this.night),
      nectar: this.nectar,
      durationMs: Math.round(this.timeMs),
      xp,
      abilities: this.liveUnlocks(),
    };
  }

  private liveUnlocks(): AbilityId[] {
    return unique(unlockedAbilities(this.xp + this.runXp).concat(this.unlocked));
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.releaseLock();
    this.audio.dispose();
    this.clearEntities();
    this.renderer.dispose();
    disposeTrack(this.track);
    this.renderer.domElement.remove();
  }

  resize(): void {
    const w = Math.max(16, this.mountEl.clientWidth);
    const h = Math.max(16, this.mountEl.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private bind(): void {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouse = this.onMouse.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onLock = this.onLock.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onContext = this.onContext.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouse);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerlockchange", this.onLock);
    this.renderer.domElement.addEventListener("click", this.onClick);
    this.renderer.domElement.addEventListener("contextmenu", this.onContext);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private unbind(): void {
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouse);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onLock);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContext);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);
  }

  private onContext(e: Event): void {
    e.preventDefault();
  }

  private onResize(): void {
    this.resize();
  }

  private onLock(): void {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emit();
  }

  private requestLock(): void {
    if (typeof this.renderer.domElement.requestPointerLock === "function") {
      void this.renderer.domElement.requestPointerLock();
    }
  }

  private releaseLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  private onClick(e: MouseEvent): void {
    if (this.mode === "title" || this.mode === "dead") return;
    if (this.mode === "paused") {
      this.resume();
      return;
    }
    if (!this.pointerLocked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.fire(this.selected);
  }

  private onMouse(e: MouseEvent): void {
    if (this.mode !== "playing") return;
    if (!this.pointerLocked) return;
    this.lookBy(e.movementX, e.movementY);
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.mode !== "playing" || this.pointerLocked) return;
    if (e.button !== 0 && e.pointerType !== "touch") return;
    this.dragging = true;
    this.dragMoved = 0;
    this.lastPx = e.clientX;
    this.lastPy = e.clientY;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging || this.pointerLocked || this.mode !== "playing") return;
    const dx = e.clientX - this.lastPx;
    const dy = e.clientY - this.lastPy;
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    this.lookBy(dx, dy);
    this.lastPx = e.clientX;
    this.lastPy = e.clientY;
  }

  private onPointerUp(): void {
    if (this.dragging && !this.pointerLocked && this.dragMoved < 8 && this.mode === "playing") {
      this.fire(this.selected);
    }
    this.dragging = false;
  }

  private onWheel(e: WheelEvent): void {
    if (this.mode !== "playing") return;
    e.preventDefault();
    this.cycleAbility(e.deltaY > 0 ? 1 : -1);
  }

  private lookBy(dx: number, dy: number): void {
    const sens = 0.00215;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-1.2, Math.min(1.15, this.pitch));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat && e.key !== " ") return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }
    if (e.key === "Escape") {
      if (this.mode === "playing") {
        e.preventDefault();
        this.pause();
      }
      return;
    }
    if (this.mode === "paused" && (e.key === "p" || e.key === "P")) {
      this.resume();
      return;
    }
    if (this.mode !== "playing") return;

    const k = normalizeKey(e.key);
    this.keys.add(k);

    if (k === " " || k === "e") e.preventDefault();

    if (k === "e" || k === "r") this.trySip(false);
    if (k === "shift") this.dash();
    if (k === "f") this.fire(this.selected);
    if (e.key === "Tab" || k === "tab") {
      e.preventDefault();
      e.stopPropagation();
      this.cycleAbility(e.shiftKey ? -1 : 1);
      return;
    }
    if (k === "q" || k === ",") {
      e.preventDefault();
      this.cycleAbility(-1);
      return;
    }
    if (k === ".") {
      e.preventDefault();
      this.cycleAbility(1);
      return;
    }

    const byKey = ABILITY_ORDER.find((id) => ABILITIES[id].key === e.key);
    if (byKey) this.selectAbility(byKey);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(normalizeKey(e.key));
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private tick(dt: number): void {
    this.titleT += dt;
    this.particles.tick(dt);
    this.sky.tick(this.titleT + this.timeMs / 1000);
    this.habitat.tick(this.titleT + this.timeMs / 1000, dt);
    this.tickMeteors(dt);
    this.animateLamps(dt);
    this.tickRelocate(dt);
    this.tickBonuses();

    if (this.mode === "title") {
      this.tickTitle(dt);
      return;
    }
    if (this.mode === "paused" || this.mode === "dead" || this.mode === "boot") {
      this.holdCamera(dt);
      return;
    }

    this.timeMs += dt * 1000;
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.messageT = Math.max(0, this.messageT - dt);
    if (this.messageT <= 0) this.message = null;

    this.tickConditions(dt);
    this.tickCds(dt);
    this.tickFlight(dt);
    this.tickSparks(dt);
    this.tickBolts(dt);
    this.tickFriends(dt);
    this.tickRings(dt);
    this.tickClouds(dt);
    this.tickLureContact(dt);
    this.tickNight(dt);
    this.tickTutorial();

    const effort =
      this.keys.has("w") || this.keys.has("arrowup") || this.keys.has("shift")
        ? 1
        : 0.35;
    flapMoth(this.moth, this.timeMs / 1000, effort);
    this.audio.setEffort(effort);

    if (this.timeMs - this.lastSnap > 80) {
      this.lastSnap = this.timeMs;
      this.emit();
    }
  }

  private tickTitle(dt: number): void {
    const t = this.titleT;
    this.pos.set(Math.sin(t * 0.28) * 7.2, 4.1 + Math.sin(t * 0.55) * 0.5, 9);
    this.yaw = -t * 0.22;
    this.pitch = -0.08;
    this.updateLook();
    this.orientMoth();
    this.aimVisor();
    flapMoth(this.moth, t, 0.45);
    this.camera.position.lerp(
      this.tmp.set(this.pos.x + 5.4, this.pos.y + 2.4, this.pos.z + 8.2),
      1 - Math.exp(-2 * dt),
    );
    this.camera.lookAt(this.pos.x, this.pos.y + 0.25, this.pos.z);
    this.audio.setEffort(0.25);
  }

  private tickFlight(dt: number): void {
    this.updateLook();
    const confused = this.has("confused");
    const sign = confused ? -1 : 1;
    const right = this.tmp2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const glow = this.has("nectar-glow") ? 1.18 : 1;
    const pollen = this.has("heavy-pollen") ? 0.68 : 1;
    const dazed = this.has("dazed") ? 0.62 : 1;
    const accel = 36 * glow * pollen * dazed;

    const thrusting = this.keys.has("w") || this.keys.has("arrowup");
    const braking = this.keys.has("s") || this.keys.has("arrowdown");
    if (thrusting) {
      this.vel.addScaledVector(this.look, accel * sign * dt);
    }
    if (braking) {
      this.vel.addScaledVector(this.look, -accel * 0.45 * sign * dt);
    }
    if (this.keys.has("d") || this.keys.has("arrowright")) {
      this.vel.addScaledVector(right, accel * 0.7 * sign * dt);
    }
    if (this.keys.has("a") || this.keys.has("arrowleft")) {
      this.vel.addScaledVector(right, -accel * 0.7 * sign * dt);
    }
    if (this.keys.has(" ")) this.vel.y += 18 * dt;

    // Hover: moths do not fall out of the night unless you dive.
    if (!thrusting && Math.abs(this.pitch) < 0.12) {
      this.vel.y += (4.4 - this.pos.y) * 1.6 * dt;
    } else if (!thrusting) {
      this.vel.y -= 3.2 * dt;
    }

    this.vel.multiplyScalar(Math.exp(-1.55 * dt));
    const spd = this.vel.length();
    if (spd > 26) this.vel.multiplyScalar(26 / spd);

    if (this.has("drawn")) {
      const wisp = this.lamps.find((l) => l.kind === "wisp" && !l.drunk && l.inert <= 0);
      if (wisp) {
        this.tmp.copy(wisp.pos).sub(this.pos).normalize().multiplyScalar(7 * dt);
        this.vel.add(this.tmp);
      }
    }

    this.pos.addScaledVector(this.vel, dt);

    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS) {
      const k = ARENA_RADIUS / r;
      this.pos.x *= k;
      this.pos.z *= k;
      this.vel.x *= -0.25;
      this.vel.z *= -0.25;
      this.say("The grounds end. Turn back.");
    }
    this.pos.y = Math.max(1.35, Math.min(28, this.pos.y));

    this.stamina = Math.min(MAX_STAMINA, this.stamina + 17 * dt);
    if (this.has("heavy-pollen")) this.hp = Math.min(MAX_HP, this.hp + 3.2 * dt);
    if (this.has("burn")) this.hurt(9 * dt, "The heat stays.");

    this.orientMoth();
    this.aimVisor();

    const camOff = this.tmp
      .copy(this.look)
      .multiplyScalar(-8.2)
      .add(new THREE.Vector3(0, 2.15, 0));
    const desired = this.tmp2.copy(this.pos).add(camOff);
    this.camera.position.lerp(desired, 1 - Math.exp(-6.2 * dt));
    this.camera.lookAt(
      this.pos.x + this.look.x * 3.2,
      this.pos.y + 0.25 + this.look.y * 3.2,
      this.pos.z + this.look.z * 3.2,
    );
  }

  private orientMoth(): void {
    const lat = Math.cos(this.yaw) * this.vel.x + -Math.sin(this.yaw) * this.vel.z;
    const bank = Math.max(-0.5, Math.min(0.5, -lat * 0.07));
    this.moth.root.position.copy(this.pos);
    // Model faces +Z; look is +Z at yaw 0. Do not add PI — that flew the moth backwards.
    this.moth.root.rotation.set(this.pitch * 0.7, this.yaw, bank);
  }

  private aimVisor(): void {
    this.visorLight.position.copy(this.pos).addScaledVector(this.look, 0.6);
    this.visorLight.position.y += 0.15;
    this.visorTarget.position.copy(this.pos).addScaledVector(this.look, 14);
    this.visorLight.target.updateMatrixWorld();
  }

  private tickMeteors(dt: number): void {
    this.meteorT -= dt;
    if (this.meteorT > 0) return;
    this.meteorT = 5 + Math.random() * 7;
    const origin = new THREE.Vector3(
      this.pos.x + (Math.random() - 0.5) * 80,
      36 + Math.random() * 18,
      this.pos.z + (Math.random() - 0.5) * 80,
    );
    const vel = new THREE.Vector3(-18 - Math.random() * 10, -8, 6 + Math.random() * 8);
    for (let i = 0; i < 10; i++) {
      this.particles.spawn(
        origin.clone().addScaledVector(vel, i * 0.04),
        0xe8f0ff,
        vel.clone().multiplyScalar(0.15),
        0.7,
        0.18,
      );
    }
  }

  private holdCamera(dt: number): void {
    this.updateLook();
    this.moth.root.position.copy(this.pos);
    this.camera.position.lerp(
      this.tmp.copy(this.pos).add(new THREE.Vector3(0, 2, 7)),
      1 - Math.exp(-3 * dt),
    );
    this.camera.lookAt(this.pos);
  }

  private updateLook(): void {
    this.look.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  private tickConditions(dt: number): void {
    for (const [id, t] of [...this.conditions.entries()]) {
      const next = t - dt;
      if (next <= 0) this.conditions.delete(id);
      else this.conditions.set(id, next);
    }
  }

  private tickCds(dt: number): void {
    for (const [id, t] of [...this.cds.entries()]) {
      const next = t - dt;
      if (next <= 0) this.cds.delete(id);
      else this.cds.set(id, next);
    }
  }

  private tickSparks(dt: number): void {
    for (const s of this.sparks) {
      if (this.has("veiled")) {
        s.vel.multiplyScalar(Math.exp(-1.2 * dt));
      } else {
        this.tmp.copy(this.pos).sub(s.pos);
        const d = this.tmp.length() || 1;
        this.tmp.multiplyScalar((4.2 / d) * dt);
        s.vel.add(this.tmp);
      }
      s.vel.multiplyScalar(Math.exp(-0.8 * dt));
      s.pos.addScaledVector(s.vel, dt);
      s.pos.y = Math.max(1.2, s.pos.y);
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.y += dt * 4;
      if (s.pos.distanceTo(this.pos) < 1.05 && this.invuln <= 0) {
        this.hurt(9, "A spark finds the wing.");
        this.apply("dazed", 1.2);
      }
    }
  }

  private tickClouds(dt: number): void {
    for (const c of this.clouds) {
      c.life -= dt;
      for (const s of this.sparks) {
        if (s.pos.distanceTo(c.pos) < c.radius) s.hp -= c.damage * dt;
      }
      for (const l of this.lamps) {
        if (!isLure(l.kind) || l.drunk) continue;
        if (l.pos.distanceTo(c.pos) < c.radius + 0.6) l.hp -= c.damage * dt;
      }
    }
    this.reapSparks();
    this.reapLamps();
    this.clouds = this.clouds.filter((c) => c.life > 0);
  }

  private tickLureContact(dt: number): void {
    void dt;
    for (const l of this.lamps) {
      if (l.drunk || l.inert > 0) continue;
      if (isTrueLamp(l.kind)) continue;
      const d = this.pos.distanceTo(l.pos);
      const reach = l.kind === "wisp" ? 2.1 : 2.4;
      if (d < reach && this.invuln <= 0) {
        const hit = contactDamage(l.kind);
        this.hurt(-hit.hp, `${LAMPS[l.kind].name} bites.`);
        if (hit.condition) this.apply(hit.condition);
        this.invuln = 0.55;
      }
      if (l.kind === "wisp" && l.inert <= 0 && !this.has("veiled")) {
        this.tmp.copy(this.pos).sub(l.pos);
        const dist = this.tmp.length() || 1;
        l.pos.addScaledVector(this.tmp.normalize(), Math.min(3.6, 14 / dist) * 0.016);
        l.rig.root.position.copy(l.pos);
      }
    }
  }

  private tickNight(dt: number): void {
    if (this.tutorial) return;
    const trues = this.lamps.filter((l) => isTrueLamp(l.kind) && !l.drunk);
    if (this.lamps.length && trues.length === 0 && this.nightClosing <= 0) {
      this.nightClosing = 2.2;
      const bonus = nightClearScore(Math.max(1, this.night));
      this.score += bonus;
      this.say(`Night ${this.night} folds. The next lamps wake.`);
      this.audio.night();
      this.hp = Math.min(MAX_HP, this.hp + 18);
    }
    if (this.nightClosing > 0) {
      this.nightClosing -= dt;
      if (this.nightClosing <= 0) {
        this.night += 1;
        this.clearEntities();
        this.spawnNight(this.night);
      }
    }
  }

  private tickTutorial(): void {
    if (!this.tutorial) return;
    const circ = this.lamps.find((l) => l.kind === "circulation");
    const cage = this.lamps.find((l) => l.kind === "zapper");
    if (this.tutorialStep === 0 && circ && this.pos.distanceTo(circ.pos) < 8) {
      this.tutorialStep = 1;
    }
    if (this.tutorialStep === 1 && circ?.drunk) this.tutorialStep = 2;
    if (this.tutorialStep === 2 && cage && (cage.hp < lampHp("zapper") || cage.inert > 0)) {
      this.tutorialStep = 3;
    }
    if (this.tutorialStep === 3) {
      const trap = this.lamps.find((l) => l.kind === "nectar-trap");
      if (trap && (trap.known || trap.drunk || this.pos.distanceTo(trap.pos) < 5)) {
        this.tutorialStep = 4;
        this.hooks.onProgress(this.xp + this.runXp, true);
      }
    }
  }

  private dash(): void {
    if (this.stamina < DASH_STAMINA) return;
    this.stamina -= DASH_STAMINA;
    this.vel.addScaledVector(this.look, 16);
    this.burst(this.pos, 0xc8b48a, 10, 0.35);
  }

  private trySip(fromSiphon: boolean): void {
    const range = fromSiphon ? SIPHON_RANGE : SIP_RANGE;
    const lamp = this.nearestLamp(range);
    if (!lamp || lamp.drunk) return;
    if (lamp.inert > 0 && isLure(lamp.kind)) {
      this.say("Inert. The light is only furniture now.");
      return;
    }
    const out = sipOutcome(lamp.kind, Math.max(1, this.night), Math.max(1, this.combo));
    this.audio.sip(isTrueLamp(lamp.kind));
    if (isTrueLamp(lamp.kind)) {
      lamp.drunk = true;
      lamp.sipFlash = 1;
      lamp.rig.light.intensity = 0.15;
      this.hp = Math.min(MAX_HP, this.hp + out.hp);
      this.nectar = Math.max(0, this.nectar + out.nectar);
      this.score += out.score;
      this.runXp += out.xp;
      this.combo = applyCombo(this.combo, "true-sip");
      for (const c of out.conditions) this.apply(c.id);
      this.say(out.message);
      this.fxSip(lamp);
      if (this.tutorial && lamp.kind === "circulation") this.tutorialStep = Math.max(this.tutorialStep, 2);
    } else {
      this.combo = applyCombo(this.combo, "miss-sip");
      this.hurt(-out.hp, out.message);
      this.nectar = Math.max(0, this.nectar + out.nectar);
      for (const c of out.conditions) this.apply(c.id);
    }
    this.emit();
  }

  private fire(id: AbilityId): void {
    this.unlocked = this.liveUnlocks();
    if (!this.unlocked.includes(id)) return;
    const def = ABILITIES[id];
    const cd = this.cds.get(id) ?? 0;
    if (cd > 0) return;
    if (this.stamina < def.stamina) {
      this.say("The wing will not take that yet.");
      return;
    }
    this.stamina -= def.stamina;
    this.cds.set(id, def.cooldown);
    this.selected = id;
    this.audio.strike();

    const charged = this.has("charged");
    const dmg = abilityDamage(id) * (charged ? 1.4 : 1);
    if (charged && dmg > 0) this.conditions.delete("charged");

    switch (id) {
      case "scale-dust":
        this.launchDust(dmg);
        break;
      case "wing-cleave":
        this.sphereHit(this.pos.clone().addScaledVector(this.look, 2.1), 2.6, dmg);
        this.spray(0xd8c9a8, 10);
        break;
      case "pheromone-read":
        this.apply("moonlit", 8);
        for (const l of this.lamps) l.known = true;
        this.say("The air tells on every lamp.");
        break;
      case "lunar-veil":
        this.apply("veiled");
        this.invuln = Math.max(this.invuln, 0.4);
        this.say("Unread.");
        break;
      case "siphon":
        this.trySip(true);
        break;
      case "sonic-pulse":
        this.sphereHit(this.pos.clone(), 8.2, dmg);
        this.conditions.delete("drawn");
        this.burst(this.pos, 0xa8c4e8, 28, 1.2);
        break;
      case "ashen-dive": {
        this.vel.addScaledVector(this.look, 18);
        this.lineHit(this.pos, this.look, 15, 1.3, dmg);
        this.hurt(7, "Recoil along the thorax.");
        this.spray(0xff6a3a, 20);
        break;
      }
      case "night-chitin":
        this.apply("chitin");
        this.say("The shell takes the next bite.");
        break;
      case "pollen-bomb": {
        const at = this.pos.clone().addScaledVector(this.look, 5);
        this.clouds.push({ pos: at, radius: 4.2, life: 5.5, damage: dmg });
        this.burst(at, 0xd4b46a, 22, 1);
        break;
      }
      case "helix-spiral": {
        this.vel.addScaledVector(this.look, 14);
        let threaded = 0;
        for (const l of this.lamps) {
          const d = distPointRay(l.pos, this.pos, this.look);
          if (d < 4.5 && this.pos.distanceTo(l.pos) < 16) {
            if (isLure(l.kind) && !l.drunk) {
              l.inert = 8;
              l.known = true;
              threaded += 1;
              this.score += 60 * Math.max(1, this.night);
              this.fxInert(l);
            }
            if (isTrueLamp(l.kind) && !l.drunk) {
              this.score += 40 * Math.max(1, this.night);
            }
          }
        }
        this.sphereHit(this.pos.clone(), 5.5, dmg);
        this.say(
          threaded
            ? `Spiral through ${threaded}. The lures forget themselves.`
            : "A helix with nothing to thread.",
        );
        this.burst(this.pos, 0x6ee7d0, 36, 1.4);
        break;
      }
    }
    this.emit();
  }

  private launchDust(dmg: number): void {
    const muzzle = this.pos.clone().addScaledVector(this.look, 1.35);
    this.burst(muzzle, 0xffd080, 18, 0.28);
    this.spray(0xe8b86a, 10);
    // One tight bolt down the reticle, two flanking motes so the swarm is readable.
    const spreads = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.09, 0.03, 0),
      new THREE.Vector3(-0.08, -0.04, 0),
    ];
    for (let i = 0; i < spreads.length; i++) {
      const dir = this.look.clone();
      const right = this.tmp2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      dir.addScaledVector(right, spreads[i]!.x);
      dir.y += spreads[i]!.y;
      dir.normalize();
      const group = new THREE.Group();
      for (let m = 0; m < 7; m++) {
        const mote = new THREE.Mesh(this.dustGeo, this.dustMat);
        mote.position.set(
          (Math.random() - 0.5) * 0.55,
          (Math.random() - 0.5) * 0.55,
          (Math.random() - 0.5) * 0.7,
        );
        mote.scale.setScalar(0.7 + Math.random() * 0.8);
        group.add(mote);
      }
      const tip = new THREE.Sprite(this.dustTipMat);
      tip.scale.set(1.8, 1.8, 1);
      group.add(tip);
      const start = muzzle.clone().addScaledVector(right, spreads[i]!.x * 0.8);
      group.position.copy(start);
      this.scene.add(group);
      this.bolts.push({
        pos: start,
        vel: dir.multiplyScalar(i === 0 ? 52 : 46),
        life: 1.35,
        dmg: i === 0 ? dmg : dmg * 0.7,
        radius: i === 0 ? 1.25 : 0.95,
        group,
        trail: 0,
      });
    }
  }

  private tickBolts(dt: number): void {
    const keep: DustBolt[] = [];
    for (const b of this.bolts) {
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.group.position.copy(b.pos);
      b.group.rotation.x += dt * 8;
      b.group.rotation.y += dt * 11;
      b.trail -= dt;
      if (b.trail <= 0) {
        b.trail = 0.028;
        this.particles.spawn(
          b.pos.clone(),
          0xe0a050,
          b.vel.clone().multiplyScalar(-0.08).add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 2,
            ),
          ),
          0.28,
          0.1,
        );
      }

      let hit = false;
      for (const s of this.sparks) {
        if (s.pos.distanceTo(b.pos) < b.radius + 0.4) {
          s.hp -= b.dmg;
          s.vel.addScaledVector(b.vel, 0.04);
          hit = true;
        }
      }
      for (const l of this.lamps) {
        if (!isLure(l.kind) || l.drunk) continue;
        const lampPt = l.pos.clone();
        lampPt.y += 2.4;
        if (lampPt.distanceTo(b.pos) < b.radius + 1.1) {
          l.hp -= b.dmg;
          l.known = true;
          hit = true;
        }
      }
      if (hit || b.life <= 0 || b.pos.y < 0.4) {
        if (hit) this.fxHit(b.pos, 0xffc060);
        else this.burst(b.pos, 0xc4a05a, 10, 0.3);
        this.scene.remove(b.group);
        if (hit) this.audio.strike();
        continue;
      }
      keep.push(b);
    }
    this.bolts = keep;
    this.reapSparks();
    this.reapLamps();
  }

  private coneHit(range: number, cosMin: number, dmg: number): void {
    for (const s of this.sparks) {
      this.tmp.copy(s.pos).sub(this.pos);
      const d = this.tmp.length();
      if (d > range || d < 0.01) continue;
      if (this.tmp.normalize().dot(this.look) >= cosMin) {
        s.hp -= dmg;
        s.vel.addScaledVector(this.look, 6);
      }
    }
    for (const l of this.lamps) {
      if (!isLure(l.kind) || l.drunk) continue;
      this.tmp.copy(l.pos).sub(this.pos);
      const d = this.tmp.length();
      if (d > range || d < 0.01) continue;
      if (this.tmp.normalize().dot(this.look) >= cosMin) l.hp -= dmg;
    }
    this.reapSparks();
    this.reapLamps();
  }

  private sphereHit(at: THREE.Vector3, radius: number, dmg: number): void {
    for (const s of this.sparks) {
      if (s.pos.distanceTo(at) <= radius) {
        s.hp -= dmg;
        s.vel.addScaledVector(s.pos.clone().sub(at).normalize(), 5);
      }
    }
    for (const l of this.lamps) {
      if (!isLure(l.kind) || l.drunk) continue;
      if (l.pos.distanceTo(at) <= radius + 0.8) l.hp -= dmg;
    }
    this.reapSparks();
    this.reapLamps();
  }

  private lineHit(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    radius: number,
    dmg: number,
  ): void {
    for (const s of this.sparks) {
      if (distPointRay(s.pos, origin, dir) < radius && origin.distanceTo(s.pos) < len) {
        s.hp -= dmg;
      }
    }
    for (const l of this.lamps) {
      if (!isLure(l.kind) || l.drunk) continue;
      if (distPointRay(l.pos, origin, dir) < radius + 0.6 && origin.distanceTo(l.pos) < len) {
        l.hp -= dmg;
      }
    }
    this.reapSparks();
    this.reapLamps();
  }

  private reapSparks(): void {
    const keep: SparkEnt[] = [];
    for (const s of this.sparks) {
      if (s.hp > 0) {
        keep.push(s);
        continue;
      }
      this.scene.remove(s.mesh);
      this.score += sparkKillScore(Math.max(1, this.night), Math.max(1, this.combo));
      this.combo = applyCombo(this.combo, "spark");
      this.fxDeath(s.pos, 0xb8ff6a, "spark");
    }
    this.sparks = keep;
  }

  private reapLamps(): void {
    for (const l of this.lamps) {
      if (l.hp > 0 || l.drunk) continue;
      if (!isLure(l.kind)) {
        l.hp = 1;
        continue;
      }
      l.drunk = true;
      l.inert = 99;
      l.known = true;
      l.collapse = 0.001;
      l.rig.light.intensity = 0.05;
      this.score += lureKillScore(l.kind, Math.max(1, this.night), Math.max(1, this.combo));
      this.runXp += xpForLureKill(l.kind);
      this.combo = applyCombo(this.combo, "lure-kill");
      this.say(`${LAMPS[l.kind].name} goes dark.`);
      this.fxDeath(l.pos.clone().setY(l.pos.y + 2.2), LAMPS[l.kind].color, "lure");
    }
  }

  private hurt(amount: number, msg: string): void {
    if (amount <= 0) return;
    if (this.has("chitin")) {
      this.conditions.delete("chitin");
      this.say("The shell takes it.");
      this.invuln = 0.4;
      return;
    }
    if (this.has("veiled") && amount < 20) {
      this.say("The veil spends itself.");
      return;
    }
    this.hp -= amount;
    this.combo = applyCombo(this.combo, "hurt");
    this.flash = 1;
    this.invuln = Math.max(this.invuln, 0.35);
    this.say(msg);
    this.audio.zap();
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    if (this.mode === "dead") return;
    this.hp = 0;
    this.mode = "dead";
    this.releaseLock();
    this.audio.death();
    this.say("The light that took you was never Circulation.");
    const xp = this.xp + this.runXp;
    const abilities = unlockedAbilities(xp);
    this.hooks.onProgress(xp, this.tutorial ? this.tutorialStep >= 4 : false);
    this.hooks.onDeath({
      score: this.score,
      night: Math.max(1, this.night),
      nectar: this.nectar,
      durationMs: Math.round(this.timeMs),
      xp,
      abilities,
    });
    this.emit();
  }

  private apply(id: ConditionId, duration?: number): void {
    const d = duration ?? CONDITIONS[id].duration;
    const prev = this.conditions.get(id) ?? 0;
    this.conditions.set(id, Math.max(prev, d));
  }

  private has(id: ConditionId): boolean {
    return (this.conditions.get(id) ?? 0) > 0;
  }

  private say(text: string): void {
    this.message = text;
    this.messageT = 3.4;
  }

  private nearestLamp(max: number): LampEnt | null {
    let best: LampEnt | null = null;
    let bestD = max;
    for (const l of this.lamps) {
      const d = this.pos.distanceTo(l.pos);
      if (d < bestD) {
        best = l;
        bestD = d;
      }
    }
    return best;
  }

  private hudLamp(): HudLamp | null {
    const l = this.nearestLamp(INSPECT_RANGE);
    if (!l) return null;
    const known = l.known || this.has("moonlit") || this.tutorial;
    const d = this.pos.distanceTo(l.pos);
    return {
      name: known ? LAMPS[l.kind].name : "Uncertain light",
      kind: known ? l.kind : "unknown",
      tell: known ? LAMPS[l.kind].tell : "Watch the pulse. Color lies. Motion does not.",
      known,
      safe: known ? isTrueLamp(l.kind) : null,
      range: d,
      canSip: d <= SIP_RANGE && !l.drunk,
    };
  }

  private animateLamps(dt: number): void {
    const t = this.titleT + this.timeMs / 1000;
    for (const l of this.lamps) {
      if (l.inert > 0) l.inert = Math.max(0, l.inert - dt);
      const def = LAMPS[l.kind];
      const wobble = def.irregular ? Math.sin(t * 7.3 + l.id) * 0.35 : 0;
      const pulse = 0.62 + 0.38 * Math.sin(t * def.pulseHz * Math.PI * 2 + l.id + wobble);
      const dim = l.drunk || l.inert > 0 ? 0.12 : 1;
      l.rig.light.intensity = def.glow * pulse * dim;
      const flash = l.sipFlash > 0 ? 1 + l.sipFlash * 1.6 : 1;
      if (l.sipFlash > 0) l.sipFlash = Math.max(0, l.sipFlash - dt * 1.8);
      const s = l.rig.glowBase * (0.72 + pulse * 0.38) * Math.max(0.18, dim) * flash;
      l.rig.glow.scale.set(s, s, 1);
      for (let p = 0; p < l.rig.petals.length; p++) {
        const pet = l.rig.petals[p]!;
        const a = t * (l.kind === "wisp" ? 1.6 : 0.7) + p * 1.2 + l.id;
        const rad = l.kind === "wisp" ? 0.48 : 0.32;
        pet.position.x = Math.cos(a) * rad;
        pet.position.z = Math.sin(a) * rad;
        if (l.kind === "wisp") pet.position.y = 2.2 + Math.sin(a * 1.4) * 0.18;
      }
      if (l.collapse > 0) {
        l.collapse += dt;
        const k = Math.max(0, 1 - l.collapse / 0.55);
        l.rig.root.scale.setScalar(k);
        if (l.collapse > 0.55) l.rig.root.visible = false;
      }
      if (l.kind === "furnace" && !l.drunk && Math.random() < dt * 6) {
        this.particles.spawn(
          l.pos.clone().setY(l.pos.y + 2.6),
          0xff5a28,
          new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.8, (Math.random() - 0.5) * 0.4),
          0.7,
          0.1,
        );
      }
      if (l.kind === "zapper" && !l.drunk && Math.random() < dt * 10) {
        this.particles.spawn(
          l.pos.clone().setY(l.pos.y + 2.5),
          0x88ff44,
          new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
          0.25,
          0.08,
        );
      }
    }
  }

  private fxHit(at: THREE.Vector3, color: number): void {
    this.geoBurst(at, color, 0xfff2c4, 1);
    this.spawnRing(at, color, 6.2, 0.32);
    this.spawnRing(at, 0xffe8a0, 3.2, 0.18);
  }

  private fxDeath(at: THREE.Vector3, color: number, kind: "spark" | "lure"): void {
    this.geoBurst(at, color, 0xffffff, kind === "lure" ? 1.7 : 1.15);
    this.spawnRing(at, color, kind === "lure" ? 9 : 5, 0.45);
    this.spawnRing(at, 0xffffff, kind === "lure" ? 5 : 2.6, 0.22);
  }

  private fxSip(lamp: LampEnt): void {
    const at = lamp.pos.clone();
    at.y += lamp.rig.light.position.y;
    this.geoBurst(at, LAMPS[lamp.kind].color, 0xfff6d8, 1.4);
    this.spawnRing(at, LAMPS[lamp.kind].color, 7.2, 0.6);
    this.helixMotes(at, LAMPS[lamp.kind].color, 0xfff0c0, 18);
    for (const f of this.friends) {
      if (f.home === lamp) f.scare = 2.2;
    }
  }

  /** Radial shards + spiral + fountain — the “wow damn”. */
  private geoBurst(at: THREE.Vector3, a: number, b: number, scale: number): void {
    const n = Math.round(18 * scale);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const ph = (i % 5) * 0.35;
      const dir = new THREE.Vector3(
        Math.cos(th) * Math.cos(ph),
        Math.sin(ph) + 0.35,
        Math.sin(th) * Math.cos(ph),
      ).multiplyScalar(7 * scale);
      this.particles.spawn(at, a, dir, 0.7, 0.16 * scale, b);
    }
    for (let i = 0; i < 10; i++) {
      this.particles.spawn(
        at,
        b,
        new THREE.Vector3((Math.random() - 0.5) * 2, 5 * scale + Math.random() * 4, (Math.random() - 0.5) * 2),
        0.95,
        0.12,
        a,
      );
    }
  }

  private helixMotes(at: THREE.Vector3, a: number, b: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const ang = t * Math.PI * 4;
      const p = at.clone().add(new THREE.Vector3(Math.cos(ang) * 0.3, t * 0.2, Math.sin(ang) * 0.3));
      const v = new THREE.Vector3(Math.cos(ang) * 2.4, 3.2, Math.sin(ang) * 2.4);
      this.particles.spawn(p, a, v, 1.05, 0.1, b);
    }
  }

  private fxInert(lamp: LampEnt): void {
    const at = lamp.pos.clone();
    at.y += lamp.rig.light.position.y;
    this.burst(at, 0xa8c4e8, 16, 0.5);
    this.spawnRing(at, 0x8aa4c8, 5, 0.45);
  }

  private spawnRing(at: THREE.Vector3, color: number, max: number, life: number): void {
    const sprite = makeFxRing(this.track, this.glowTex, color);
    sprite.position.copy(at);
    this.scene.add(sprite);
    this.rings.push({ sprite, age: 0, life, max });
  }

  private tickRings(dt: number): void {
    const keep: FxRing[] = [];
    for (const r of this.rings) {
      r.age += dt;
      const k = Math.min(1, r.age / r.life);
      const s = 0.4 + r.max * k;
      r.sprite.scale.set(s, s, 1);
      (r.sprite.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - k);
      if (r.age < r.life) keep.push(r);
      else this.scene.remove(r.sprite);
    }
    this.rings = keep;
  }

  private tickRelocate(dt: number): void {
    if (this.tutorial || this.mode !== "playing") return;
    this.relocateT -= dt;
    if (this.relocateT <= 0) {
      this.relocateT = 14 + this.rng() * 8;
      const live = this.lamps.filter((l) => !l.drunk && l.collapse <= 0 && l.relocating <= 0);
      const n = Math.min(live.length, 1 + (this.rng() > 0.55 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const l = live[Math.floor(this.rng() * live.length)];
        if (l) l.relocating = 0.001;
      }
    }
    for (const l of this.lamps) {
      if (l.relocating <= 0) continue;
      l.relocating += dt;
      const k = l.relocating < 0.4 ? 1 - l.relocating / 0.4 : (l.relocating - 0.4) / 0.45;
      l.rig.root.scale.setScalar(Math.max(0.05, Math.min(1, k)));
      if (l.relocating > 0.4 && l.relocating - dt <= 0.4) {
        const used = this.lamps.map((o) => o.pos);
        const next = this.pickLampPos(used, scatterRegionId(l.kind, () => this.rng()));
        this.helixMotes(l.pos.clone().setY(l.pos.y + 2.2), LAMPS[l.kind].color, 0xffffff, 10);
        l.pos.copy(next);
        l.rig.root.position.copy(next);
        this.spawnRing(next.clone().setY(2.2), LAMPS[l.kind].color, 5, 0.4);
        this.say(`${LAMPS[l.kind].name} moves. The grounds reshuffle.`);
      }
      if (l.relocating > 0.85) {
        l.relocating = 0;
        l.rig.root.scale.setScalar(1);
      }
    }
  }

  private tickBonuses(): void {
    if (this.mode !== "playing") return;
    for (const b of this.habitat.bonuses) {
      if (b.taken) continue;
      if (this.pos.distanceTo(b.mesh.position) > 1.8) continue;
      b.taken = true;
      b.mesh.visible = false;
      this.score += BONUS_SCORE * Math.max(1, this.night);
      this.nectar += BONUS_NECTAR;
      this.runXp += BONUS_XP;
      this.hp = Math.min(MAX_HP, this.hp + 10);
      this.geoBurst(b.mesh.position.clone(), 0x6ee7d0, 0xffe8a0, 1.3);
      this.say("A cache in the maze. The night pays.");
    }
  }

  private spawnFriends(home: LampEnt): void {
    const n = home.kind === "circulation" ? 3 : home.kind === "helix" ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const rig = buildFriendMoth(this.track);
      this.scene.add(rig.root);
      this.friends.push({
        rig,
        home,
        angle: (i / n) * Math.PI * 2 + home.id,
        radius: 1.6 + i * 0.35,
        height: 2.1 + i * 0.15,
        scare: 0,
      });
    }
  }

  private tickFriends(dt: number): void {
    const t = this.timeMs / 1000;
    for (const f of this.friends) {
      f.scare = Math.max(0, f.scare - dt);
      const scatter = f.scare > 0 || f.home.drunk;
      if (this.pos.distanceTo(f.home.pos) < 3.2 && this.vel.length() > 8) f.scare = 1.6;
      f.angle += dt * (scatter ? 3.4 : 0.7);
      const rad = f.radius + (scatter ? 3.5 : 0);
      const y = f.height + Math.sin(t * 2 + f.angle) * 0.18 + (scatter ? 1.4 : 0);
      f.rig.root.position.set(
        f.home.pos.x + Math.cos(f.angle) * rad,
        y,
        f.home.pos.z + Math.sin(f.angle) * rad,
      );
      f.rig.root.rotation.y = f.angle + Math.PI / 2;
      flapMoth(f.rig, t + f.angle, scatter ? 1 : 0.35);
      if (!scatter && Math.random() < dt * 1.4) {
        this.particles.spawn(
          f.rig.root.position.clone(),
          0xe8c48a,
          new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4),
          0.4,
          0.06,
        );
      }
    }
  }

  private burst(at: THREE.Vector3, color: number, n: number, life: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.spawn(
        at,
        color,
        new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          Math.random() * 4,
          (Math.random() - 0.5) * 6,
        ),
        life,
        0.1 + Math.random() * 0.08,
      );
    }
  }

  private spray(color: number, n: number): void {
    const origin = this.pos.clone().addScaledVector(this.look, 1.2);
    for (let i = 0; i < n; i++) {
      const v = this.look
        .clone()
        .multiplyScalar(6 + Math.random() * 4)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
          ),
        );
      this.particles.spawn(origin, color, v, 0.45, 0.09);
    }
  }

  private spawnTutorial(): void {
    this.placeLamp("circulation", new THREE.Vector3(0, 0, -6));
    this.placeLamp("zapper", new THREE.Vector3(8, 0, -2));
    this.placeLamp("nectar-trap", new THREE.Vector3(-8, 0, -3));
    this.lamps[0]!.known = true;
  }

  private spawnNight(night: number): void {
    this.rng = mulberry32(0x51a7 + night * 9973);
    const mix = composeNight(night, this.rng);
    const used: THREE.Vector3[] = [];
    for (const kind of mix.lamps) {
      const p = this.pickLampPos(used, scatterRegionId(kind, () => this.rng()));
      used.push(p);
      this.placeLamp(kind, p);
    }
    for (let i = 0; i < mix.sparks; i++) {
      this.spawnSpark();
    }
  }

  private pickLampPos(used: THREE.Vector3[], regionId: keyof typeof REGIONS): THREE.Vector3 {
    const reg = REGIONS[regionId];
    for (let tries = 0; tries < 28; tries++) {
      const ang = this.rng() * Math.PI * 2;
      const rad = 5 + this.rng() * (reg.radius * 0.78);
      const p = new THREE.Vector3(reg.x + Math.cos(ang) * rad, 0, reg.z + Math.sin(ang) * rad);
      if (used.every((u) => u.distanceTo(p) > 10)) return p;
    }
    return new THREE.Vector3(
      reg.x + (this.rng() - 0.5) * 16,
      0,
      reg.z + (this.rng() - 0.5) * 16,
    );
  }

  private placeTitleLamp(): void {
    this.placeLamp("circulation", new THREE.Vector3(0, 0, -2));
    this.lamps[0]!.known = true;
  }

  private placeLamp(kind: LampKind, pos: THREE.Vector3): void {
    const rig = buildLamp(this.track, kind, this.glowTex);
    rig.root.position.copy(pos);
    this.scene.add(rig.root);
    this.lamps.push({
      id: this.lampSeq++,
      kind,
      pos: pos.clone(),
      hp: lampHp(kind),
      drunk: false,
      inert: 0,
      known: false,
      rig,
      hunt: pos.clone(),
      collapse: 0,
      sipFlash: 0,
      relocating: 0,
    });
    if (isTrueLamp(kind)) this.spawnFriends(this.lamps[this.lamps.length - 1]!);
  }

  private spawnSpark(): void {
    const yard = REGIONS.yard;
    const ang = this.rng() * Math.PI * 2;
    const rad = 6 + this.rng() * 28;
    const pos = new THREE.Vector3(
      yard.x + Math.cos(ang) * rad,
      2 + this.rng() * 5,
      yard.z + Math.sin(ang) * rad,
    );
    const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.sparks.push({
      pos,
      vel: new THREE.Vector3((this.rng() - 0.5) * 2, 0, (this.rng() - 0.5) * 2),
      hp: 18,
      mesh,
    });
  }

  private clearEntities(): void {
    for (const l of this.lamps) this.scene.remove(l.rig.root);
    for (const s of this.sparks) this.scene.remove(s.mesh);
    for (const b of this.bolts) this.scene.remove(b.group);
    for (const f of this.friends) this.scene.remove(f.rig.root);
    for (const r of this.rings) this.scene.remove(r.sprite);
    this.lamps = [];
    this.sparks = [];
    this.clouds = [];
    this.bolts = [];
    this.friends = [];
    this.rings = [];
  }

  private emit(): void {
    this.hooks.onSnapshot({
      mode: this.mode,
      tutorial: this.tutorial,
      tutorialStep: this.tutorialStep,
      tutorialHint: this.tutorial
        ? (TUTORIAL_HINTS[this.tutorialStep] ?? TUTORIAL_HINTS[4]!)
        : "",
      hp: this.hp,
      maxHp: MAX_HP,
      stamina: this.stamina,
      nectar: this.nectar,
      score: this.score,
      combo: this.combo,
      xp: this.xp + this.runXp,
      runXp: this.runXp,
      night: Math.max(this.tutorial ? 0 : 1, this.night),
      timeMs: this.timeMs,
      conditions: [...this.conditions.entries()].map(([id, remaining]) => ({
        id,
        name: CONDITIONS[id].name,
        tone: CONDITIONS[id].tone,
        remaining,
      })),
      nearest: this.hudLamp(),
      abilities: ABILITY_ORDER.map((id) => ({
        id,
        name: ABILITIES[id].name,
        key: ABILITIES[id].key,
        ready: (this.cds.get(id) ?? 0) <= 0,
        cooldown: this.cds.get(id) ?? 0,
        maxCooldown: ABILITIES[id].cooldown,
        unlocked: this.unlocked.includes(id) || unlockedAbilities(this.xp + this.runXp).includes(id),
        selected: this.selected === id,
        kind: ABILITIES[id].kind,
      })),
      selected: this.selected,
      message: this.message,
      flash: this.flash,
      pointerLocked: this.pointerLocked,
      ...this.navHud(),
    });
  }

  private navHud(): {
    region: string;
    heading: string;
    objective: string;
    trueLeft: number;
    pipDeg: number | null;
    pipDist: number | null;
    blips: HudBlip[];
  } {
    const heading = ((Math.atan2(this.look.x, -this.look.z) * 180) / Math.PI + 360) % 360;
    const region = regionAt(this.pos.x, this.pos.z);
    const trues = this.lamps.filter((l) => isTrueLamp(l.kind) && !l.drunk);
    const nearestTrue = trues.reduce<LampEnt | null>((best, l) => {
      if (!best) return l;
      return this.pos.distanceTo(l.pos) < this.pos.distanceTo(best.pos) ? l : best;
    }, null);
    let pipDeg: number | null = null;
    let pipDist: number | null = null;
    if (nearestTrue) {
      const bear = bearingDeg(this.pos.x, this.pos.z, nearestTrue.pos.x, nearestTrue.pos.z);
      pipDeg = ((bear - heading + 540) % 360) - 180;
      pipDist = this.pos.distanceTo(nearestTrue.pos);
    }
    const objective = this.tutorial
      ? TUTORIAL_HINTS[this.tutorialStep] ?? TUTORIAL_HINTS[4]!
      : nearestTrue
        ? `${trues.length} true lamp${trues.length === 1 ? "" : "s"} still lit · ${regionAt(nearestTrue.pos.x, nearestTrue.pos.z).name} ${Math.round(pipDist ?? 0)}m ${compassLabel(bearingDeg(this.pos.x, this.pos.z, nearestTrue.pos.x, nearestTrue.pos.z))}`
        : this.lamps.length
          ? "All true lamps drunk. The next night is waking."
          : "The grounds are still.";
    const blips: HudBlip[] = this.lamps.map((l) => ({
      dx: l.pos.x - this.pos.x,
      dz: l.pos.z - this.pos.z,
      known: l.known || this.has("moonlit") || this.tutorial,
      safe: l.known || this.has("moonlit") || this.tutorial ? isTrueLamp(l.kind) : null,
      drunk: l.drunk,
      lure: isLure(l.kind),
    }));
    return {
      region: region.name,
      heading: compassLabel(heading),
      objective,
      trueLeft: trues.length,
      pipDeg,
      pipDist,
      blips,
    };
  }
}

function unique(list: AbilityId[]): AbilityId[] {
  return ABILITY_ORDER.filter((id) => list.includes(id));
}

function normalizeKey(key: string): string {
  if (key === " ") return " ";
  if (key === "Shift") return "shift";
  if (key === "Control") return "control";
  if (key === "Alt") return "alt";
  if (key === "Tab") return "tab";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function distPointRay(p: THREE.Vector3, origin: THREE.Vector3, dir: THREE.Vector3): number {
  const w = p.clone().sub(origin);
  const t = Math.max(0, w.dot(dir));
  const proj = origin.clone().addScaledVector(dir, t);
  return proj.distanceTo(p);
}
