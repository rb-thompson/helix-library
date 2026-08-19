/**
 * Night Moth visor prefs — brightness + radio playlist.
 * Pure parse helpers are testable without window.
 */

export const ARCADE_PREFS_KEY = "helix-arcade-night-moth-prefs";

export const BRIGHTNESS_MIN = 0.7;
export const BRIGHTNESS_MAX = 2.2;
export const BRIGHTNESS_DEFAULT = 1.2;
export const PREFS_VERSION = 2;

export type ArcadePrefs = {
  version: number;
  brightness: number;
  radioIds: number[];
  radioIndex: number;
  radioVolume: number;
  gameVolume: number;
};

export const DEFAULT_ARCADE_PREFS: ArcadePrefs = {
  version: PREFS_VERSION,
  brightness: BRIGHTNESS_DEFAULT,
  radioIds: [],
  radioIndex: 0,
  radioVolume: 0.55,
  gameVolume: 0.7,
};

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function parseArcadePrefs(raw: unknown): ArcadePrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ARCADE_PREFS };
  const r = raw as Record<string, unknown>;
  const ids: number[] = [];
  if (Array.isArray(r.radioIds)) {
    for (const id of r.radioIds) {
      const n = typeof id === "number" ? id : Number(id);
      if (!Number.isInteger(n) || n <= 0 || ids.includes(n)) continue;
      ids.push(n);
      if (ids.length >= 40) break;
    }
  }
  const volume = clamp(Number(r.radioVolume), 0, 1, DEFAULT_ARCADE_PREFS.radioVolume);
  const gameVolume = clamp(Number(r.gameVolume), 0, 1, DEFAULT_ARCADE_PREFS.gameVolume);
  const version = Number(r.version) === PREFS_VERSION ? PREFS_VERSION : 0;
  const brightness = clamp(
    version === PREFS_VERSION ? Number(r.brightness) : BRIGHTNESS_DEFAULT,
    BRIGHTNESS_MIN,
    BRIGHTNESS_MAX,
    BRIGHTNESS_DEFAULT,
  );
  const radioIndex = clamp(Number(r.radioIndex), 0, Math.max(0, ids.length - 1), 0);
  return { version: PREFS_VERSION, brightness, radioIds: ids, radioIndex, radioVolume: volume, gameVolume };
}

export function parseArcadePrefsJson(text: string | null | undefined): ArcadePrefs {
  if (!text) return { ...DEFAULT_ARCADE_PREFS };
  try {
    return parseArcadePrefs(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_ARCADE_PREFS };
  }
}

export function readArcadePrefs(): ArcadePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_ARCADE_PREFS };
  try {
    return parseArcadePrefsJson(window.localStorage.getItem(ARCADE_PREFS_KEY));
  } catch {
    return { ...DEFAULT_ARCADE_PREFS };
  }
}

export function writeArcadePrefs(prefs: ArcadePrefs): ArcadePrefs {
  const next = parseArcadePrefs(prefs);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ARCADE_PREFS_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
  }
  return next;
}
