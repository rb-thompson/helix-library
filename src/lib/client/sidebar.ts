/**
 * Desktop sidebar rail preference (localStorage).
 * Visual width is applied via `html[data-sidebar]` so ThemeScript can
 * set it before paint (same FOUC pattern as theme).
 */

export type SidebarMode = "expanded" | "collapsed";

export const SIDEBAR_KEY = "helix-sidebar";

export function readSidebarMode(): SidebarMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(SIDEBAR_KEY);
    if (v === "expanded" || v === "collapsed") return v;
  } catch {
    // ignore
  }
  return null;
}

export function writeSidebarMode(mode: SidebarMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_KEY, mode);
  } catch {
    // ignore
  }
}

export function applySidebarMode(mode: SidebarMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.sidebar = mode;
}

export function sidebarModeFromDocument(): SidebarMode {
  if (typeof document === "undefined") return "expanded";
  return document.documentElement.dataset.sidebar === "collapsed"
    ? "collapsed"
    : "expanded";
}
