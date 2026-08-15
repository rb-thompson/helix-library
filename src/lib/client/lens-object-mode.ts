/**
 * Deep Lens 3D object preference (localStorage).
 */

export type LensObjectMode = "spin" | "static";

export const LENS_OBJECT_MODE_KEY = "helix-lens-object";
export const LENS_AUTO_KEY = "helix-lens-auto";
export const LENS_AUTO_XAI_CONFIRMED_KEY = "helix-lens-auto-xai-ok";

export function readLensObjectMode(): LensObjectMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LENS_OBJECT_MODE_KEY);
    if (v === "spin" || v === "static") return v;
  } catch {
    // ignore
  }
  return null;
}

export function writeLensObjectMode(mode: LensObjectMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LENS_OBJECT_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

/** Prefer static poster on mobile / reduced motion. */
export function defaultLensObjectMode(): LensObjectMode {
  if (typeof window === "undefined") return "static";
  const stored = readLensObjectMode();
  if (stored) return stored;
  try {
    if (window.matchMedia("(max-width: 1024px)").matches) return "static";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "static";
    }
  } catch {
    return "static";
  }
  return "spin";
}

export function readLensAuto(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LENS_AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLensAuto(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.setItem(LENS_AUTO_KEY, "1");
    else localStorage.removeItem(LENS_AUTO_KEY);
  } catch {
    // ignore
  }
}

export function readLensAutoXaiConfirmed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LENS_AUTO_XAI_CONFIRMED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLensAutoXaiConfirmed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LENS_AUTO_XAI_CONFIRMED_KEY, "1");
  } catch {
    // ignore
  }
}
