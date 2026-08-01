"use client";

import { useEffect } from "react";

/**
 * Press `/` (when not typing in a field) to focus the first catalog search input.
 * Esc blurs it. Small daily-use efficiency affordance.
 */
export function SearchHotkey() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (e.key === "/" && !editable && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const input = document.querySelector<HTMLInputElement>(
          'input[type="search"][name="q"], form[role="search"] input[name="q"]',
        );
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }

      if (e.key === "Escape" && tag === "input") {
        const el = target as HTMLInputElement;
        if (el.name === "q" || el.type === "search") {
          el.blur();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
