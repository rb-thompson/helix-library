"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type AcquireModuleId =
  | "arxiv"
  | "openalex"
  | "clip"
  | "grokipedia"
  | "image_url"
  | "youtube"
  | "image";

export function AcquireModuleCard({
  id,
  open,
  onToggle,
  title,
  description,
  icon,
  className,
  children,
  badge,
}: {
  id: AcquireModuleId;
  open: boolean;
  onToggle: () => void;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
  badge?: ReactNode;
}) {
  const btnId = `acquire-module-btn-${id}`;
  const panelId = `acquire-module-${id}`;

  return (
    <section
      className={cn(
        open ? "surface" : "surface-flat",
        "flex flex-col p-3 sm:p-4",
        className,
      )}
    >
      <button
        type="button"
        id={btnId}
        className="flex w-full items-start gap-2 rounded-[var(--radius-sm)] text-left outline-none transition hover:bg-[color-mix(in_srgb,var(--paper-deep)_55%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] -m-1 p-1"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="mt-0.5 shrink-0 text-[var(--accent)]">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-[var(--ink)]">
              {title}
            </span>
            {badge}
            {!open ? (
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted-faint)]">
                Expand
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "mt-1 block text-xs text-[var(--muted)]",
              !open && "line-clamp-1",
            )}
          >
            {description}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-[var(--muted)] transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={btnId}
          className="mt-2 border-t border-[var(--line)] pt-3"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
