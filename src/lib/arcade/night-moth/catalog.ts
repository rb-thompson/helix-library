/**
 * Night Moth — field catalog.
 * Pure data: lamps, abilities, conditions. No I/O, no three.
 */

export const NIGHT_MOTH_GAME_ID = "night-moth" as const;

export type LampKind =
  | "circulation"
  | "reading"
  | "archive"
  | "helix"
  | "zapper"
  | "furnace"
  | "wisp"
  | "false-moon"
  | "nectar-trap";

export type AbilityId =
  | "scale-dust"
  | "wing-cleave"
  | "pheromone-read"
  | "lunar-veil"
  | "siphon"
  | "sonic-pulse"
  | "ashen-dive"
  | "night-chitin"
  | "pollen-bomb"
  | "helix-spiral";

export type ConditionId =
  | "nectar-glow"
  | "moonlit"
  | "veiled"
  | "chitin"
  | "charged"
  | "dazed"
  | "burn"
  | "drawn"
  | "confused"
  | "heavy-pollen"
  | "webbed";

export type LampAlignment = "true" | "lure";

export type LampDef = {
  id: LampKind;
  name: string;
  alignment: LampAlignment;
  /** Hex without #, night-garden pigment. */
  color: number;
  glow: number;
  /** What the object looks like before you know its name. */
  shape: string;
  /** Field-guide tell — what a careful moth notices. */
  tell: string;
  pulseHz: number;
  irregular: boolean;
  hunts: boolean;
  flavor: string;
};

export type AbilityDef = {
  id: AbilityId;
  name: string;
  /** Persistent XP required to unlock (meta, survives death). */
  xp: number;
  key: string;
  cooldown: number;
  stamina: number;
  kind: "attack" | "guard" | "sense" | "motion" | "ultimate";
  summary: string;
  /** One-line “how to use” for the visor. */
  how: string;
};

export type ConditionDef = {
  id: ConditionId;
  name: string;
  tone: "boon" | "bane" | "mixed";
  summary: string;
  duration: number;
};

export const LAMPS: Record<LampKind, LampDef> = {
  circulation: {
    id: "circulation",
    name: "Circulation",
    alignment: "true",
    shape: "Desk lamp",
    color: 0xe8a85a,
    glow: 2.6,
    tell: "Warm amber. Steady. Other moths rest, they do not circle.",
    pulseHz: 0.55,
    irregular: false,
    hunts: false,
    flavor: "The desk lamp that stays on after Hours. Nectar with a memory of paper.",
  },
  reading: {
    id: "reading",
    name: "Reading lamp",
    alignment: "true",
    shape: "Copper cone",
    color: 0xc47a3a,
    glow: 2.2,
    tell: "Copper cone, aimed down. Slow breath, never a stutter.",
    pulseHz: 0.35,
    irregular: false,
    hunts: false,
    flavor: "A scholar's leftover heat. Mends the wing.",
  },
  archive: {
    id: "archive",
    name: "Archive",
    alignment: "true",
    shape: "Silver column",
    color: 0xc8d4e8,
    glow: 2.5,
    tell: "Moon-silver, tall and thin. Cool to the eye.",
    pulseHz: 0.42,
    irregular: false,
    hunts: false,
    flavor: "A stack light. Rare. It remembers more than it gives.",
  },
  helix: {
    id: "helix",
    name: "Helix lamp",
    alignment: "true",
    shape: "Double coil",
    color: 0x6ee7d0,
    glow: 3.1,
    tell: "Phosphor teal, a double coil. You will not mistake it twice.",
    pulseHz: 0.8,
    irregular: false,
    hunts: false,
    flavor: "The building's own mark, after dark. Almost never left out.",
  },
  zapper: {
    id: "zapper",
    name: "Cage",
    alignment: "lure",
    shape: "Wire cage",
    color: 0x6dff4a,
    glow: 2.8,
    tell: "Sick green. Sixty-cycle flicker. A grid, not a shade.",
    pulseHz: 8,
    irregular: false,
    hunts: false,
    flavor: "It sings a thin electric hymn. Nothing that drinks here leaves whole.",
  },
  furnace: {
    id: "furnace",
    name: "Furnace mouth",
    alignment: "lure",
    shape: "Iron mouth",
    color: 0xff3a1a,
    glow: 3.0,
    tell: "Crimson, irregular. Heat climbs. The air above it wavers.",
    pulseHz: 1.4,
    irregular: true,
    hunts: false,
    flavor: "A boiler door left ajar. It wants chitin for kindling.",
  },
  wisp: {
    id: "wisp",
    name: "Will-o'-wisp",
    alignment: "lure",
    shape: "Moving core",
    color: 0xb44cff,
    glow: 2.6,
    tell: "Violet. It moves. If it hunts you, it is not a lamp.",
    pulseHz: 1.1,
    irregular: true,
    hunts: true,
    flavor: "A hunger wearing light. It drinks what you gathered.",
  },
  "false-moon": {
    id: "false-moon",
    name: "False moon",
    alignment: "lure",
    shape: "Round disc",
    color: 0xf4f0e0,
    glow: 3.6,
    tell: "Bone-white, too round, too bright. No crater. No kindness.",
    pulseHz: 0.2,
    irregular: false,
    hunts: false,
    flavor: "A counterfeit sky. Drink and the garden turns inside out.",
  },
  "nectar-trap": {
    id: "nectar-trap",
    name: "Off-beat lantern",
    alignment: "lure",
    shape: "Desk lamp",
    color: 0xe0a050,
    glow: 2.5,
    tell: "Amber — almost Circulation. The pulse misses a step.",
    pulseHz: 0.62,
    irregular: true,
    hunts: false,
    flavor: "Painted to be loved. The pollen is heavy and wrong.",
  },
};

export const LAMP_ORDER: readonly LampKind[] = [
  "circulation",
  "reading",
  "archive",
  "helix",
  "zapper",
  "furnace",
  "wisp",
  "false-moon",
  "nectar-trap",
];

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  "scale-dust": {
    id: "scale-dust",
    name: "Scale dust",
    xp: 0,
    key: "1",
    cooldown: 1.1,
    stamina: 8,
    kind: "attack",
    summary: "A visible swarm of ochre scales. Aim down the reticle at the green ones.",
    how: "Click. Lead the cage. Watch the gold.",
  },
  "wing-cleave": {
    id: "wing-cleave",
    name: "Wing cleave",
    xp: 80,
    key: "2",
    cooldown: 1.6,
    stamina: 16,
    kind: "attack",
    summary: "Close slash. Honest damage if you commit the body.",
    how: "Fly in close, then click.",
  },
  "pheromone-read": {
    id: "pheromone-read",
    name: "Pheromone read",
    xp: 150,
    key: "3",
    cooldown: 6,
    stamina: 10,
    kind: "sense",
    summary: "Taste the air. For a few seconds every lamp tells the truth.",
    how: "Click once. Every lamp names itself.",
  },
  "lunar-veil": {
    id: "lunar-veil",
    name: "Lunar veil",
    xp: 240,
    key: "4",
    cooldown: 14,
    stamina: 18,
    kind: "guard",
    summary: "Three seconds unreadable. Wisps lose the lock.",
    how: "Click when a wisp has you.",
  },
  siphon: {
    id: "siphon",
    name: "Siphon",
    xp: 340,
    key: "5",
    cooldown: 2.2,
    stamina: 12,
    kind: "sense",
    summary: "Drink from a safer distance. The lamp still has to be true.",
    how: "Look at a lamp and click. Range is longer than E.",
  },
  "sonic-pulse": {
    id: "sonic-pulse",
    name: "Sonic pulse",
    xp: 450,
    key: "6",
    cooldown: 8,
    stamina: 22,
    kind: "attack",
    summary: "A radial crack. Stuns sparks, shoves lures, clears Drawn.",
    how: "Click in a crowd. Clears Drawn.",
  },
  "ashen-dive": {
    id: "ashen-dive",
    name: "Ashen dive",
    xp: 580,
    key: "7",
    cooldown: 7,
    stamina: 24,
    kind: "motion",
    summary: "A burning line through whatever is ahead. Recoil on the thorax.",
    how: "Aim a corridor. Click. You take a little heat.",
  },
  "night-chitin": {
    id: "night-chitin",
    name: "Night chitin",
    xp: 720,
    key: "8",
    cooldown: 22,
    stamina: 14,
    kind: "guard",
    summary: "The next bite is paid in shell, not in wing.",
    how: "Click before you commit. Lasts until you are hit.",
  },
  "pollen-bomb": {
    id: "pollen-bomb",
    name: "Pollen bomb",
    xp: 880,
    key: "9",
    cooldown: 10,
    stamina: 20,
    kind: "attack",
    summary: "A hanging cloud. Slows and eats whatever stays inside it.",
    how: "Click to drop a cloud where you look.",
  },
  "helix-spiral": {
    id: "helix-spiral",
    name: "Helix spiral",
    xp: 1100,
    key: "0",
    cooldown: 28,
    stamina: 36,
    kind: "ultimate",
    summary: "A corkscrew through the cluster. Nearby lures go inert. Score if you thread them.",
    how: "Aim a cluster. Click. Thread the lamps.",
  },
};

export const ABILITY_ORDER: readonly AbilityId[] = [
  "scale-dust",
  "wing-cleave",
  "pheromone-read",
  "lunar-veil",
  "siphon",
  "sonic-pulse",
  "ashen-dive",
  "night-chitin",
  "pollen-bomb",
  "helix-spiral",
];

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  "nectar-glow": {
    id: "nectar-glow",
    name: "Nectar glow",
    tone: "boon",
    summary: "Speed and score climb while the drink is still warm.",
    duration: 8,
  },
  moonlit: {
    id: "moonlit",
    name: "Moonlit",
    tone: "boon",
    summary: "True-sight and a harder strike.",
    duration: 10,
  },
  veiled: {
    id: "veiled",
    name: "Veiled",
    tone: "boon",
    summary: "Lures cannot keep you.",
    duration: 3,
  },
  chitin: {
    id: "chitin",
    name: "Chitin",
    tone: "boon",
    summary: "The next hit is absorbed.",
    duration: 25,
  },
  charged: {
    id: "charged",
    name: "Charged",
    tone: "boon",
    summary: "The next attack carries archive light.",
    duration: 12,
  },
  dazed: {
    id: "dazed",
    name: "Dazed",
    tone: "bane",
    summary: "Turn rate dies. The garden smears.",
    duration: 2.4,
  },
  burn: {
    id: "burn",
    name: "Burn",
    tone: "bane",
    summary: "Heat ticks the thorax.",
    duration: 5,
  },
  drawn: {
    id: "drawn",
    name: "Drawn",
    tone: "bane",
    summary: "A wisp has a hand in your flight.",
    duration: 3.5,
  },
  confused: {
    id: "confused",
    name: "Confused",
    tone: "bane",
    summary: "Left is right. The false moon is pleased.",
    duration: 5,
  },
  "heavy-pollen": {
    id: "heavy-pollen",
    name: "Heavy pollen",
    tone: "mixed",
    summary: "Slow. A little regen — a trap that pretends to nurse.",
    duration: 6,
  },
  webbed: {
    id: "webbed",
    name: "Webbed",
    tone: "bane",
    summary: "A spider has you. Mash Space before the silk finishes.",
    duration: 3.2,
  },
};

export const STARTER_ABILITIES: readonly AbilityId[] = ["scale-dust"];

export const MAX_HP = 100;
export const MAX_STAMINA = 100;
export const DASH_STAMINA = 28;
export const SIP_RANGE = 4.6;
export const SIPHON_RANGE = 8.5;
export const INSPECT_RANGE = 22;
export const ARENA_RADIUS = 168;
export const HIGH_SCORE_LIMIT = 20;
export const SCORE_RETAIN = 80;
