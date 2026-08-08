/**
 * Client graph renderer preference (localStorage).
 */

export type GraphMode = "2d" | "3d";

export const GRAPH_MODE_KEY = "helix-graph-mode";

export function readGraphMode(): GraphMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(GRAPH_MODE_KEY);
    if (v === "2d" || v === "3d") return v;
  } catch {
    // ignore
  }
  return null;
}

export function writeGraphMode(mode: GraphMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GRAPH_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

/**
 * Default: 2D on narrow viewports or reduced motion; else last choice / 3D.
 */
export function defaultGraphMode(): GraphMode {
  if (typeof window === "undefined") return "2d";
  const stored = readGraphMode();
  if (stored) return stored;
  try {
    if (window.matchMedia("(max-width: 1024px)").matches) return "2d";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "2d";
    }
  } catch {
    return "2d";
  }
  return "3d";
}
