"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "helix-theme";
const LEGACY_STORAGE_KEY = "non-os-theme";

function syncThemeColorMeta() {
  const paper = getComputedStyle(document.documentElement)
    .getPropertyValue("--paper")
    .trim();
  if (!paper) return;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", paper);
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((meta) => {
    meta.setAttribute("content", paper);
  });
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  syncThemeColorMeta();
}

export function getStoredTheme(): ThemeMode | null {
  try {
    const v =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // ignore
  }
  return null;
}

export function resolveInitialTheme(): ThemeMode {
  const stored = getStoredTheme();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return "dark";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = resolveInitialTheme();
    setMode(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-icon"
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      disabled={!ready}
    >
      {mode === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
