"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";

export type TagListItem = {
  id: number;
  name: string;
  itemCount?: number;
  /** Facet count in current result set */
  c?: number;
  /** Precomputed link (must be a string — cannot pass functions from RSC). */
  href?: string;
};

/**
 * Dense tag lists (hundreds from vision tagging) stay collapsed by default.
 * Shows top tags by count, with expand / optional search.
 */
export function CollapsibleTagList({
  tags,
  activeId,
  initial = 12,
  empty = "No tags yet.",
  label = "Tags",
  chipClassName,
  activeClassName = "chip chip-active",
  inactiveClassName = "chip",
  showSearchWhenExpanded = true,
  prefix = "#",
}: {
  tags: TagListItem[];
  activeId?: number | "";
  initial?: number;
  empty?: string;
  label?: string;
  chipClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  showSearchWhenExpanded?: boolean;
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const sorted = useMemo(() => {
    return [...tags].sort((a, b) => {
      const ca = a.c ?? a.itemCount ?? 0;
      const cb = b.c ?? b.itemCount ?? 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name);
    });
  }, [tags]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((t) => t.name.toLowerCase().includes(needle));
  }, [sorted, q]);

  const visible = open ? filtered : filtered.slice(0, initial);
  const hiddenCount = Math.max(0, filtered.length - initial);
  const total = tags.length;

  if (total === 0) {
    return <p className="mt-2 text-sm text-[var(--muted)]">{empty}</p>;
  }

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-quiet !mb-0">
          {label}
          <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--muted-faint)]">
            {total}
          </span>
        </p>
        {hiddenCount > 0 || open ? (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              if (open) setQ("");
            }}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--ink)]"
          >
            {open ? (
              <>
                Show less
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              </>
            ) : (
              <>
                +{hiddenCount} more
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </>
            )}
          </button>
        ) : null}
      </div>

      {open && showSearchWhenExpanded && total > initial ? (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter tags…"
          className="field mb-2 !py-1.5 !text-xs"
          aria-label="Filter tags"
        />
      ) : null}

      <ul className="flex flex-wrap gap-1.5">
        {visible.map((t) => {
          const count = t.c ?? t.itemCount;
          const active = activeId !== undefined && activeId !== "" && t.id === activeId;
          const className = cn(
            active ? activeClassName : inactiveClassName,
            chipClassName,
          );
          const body = (
            <>
              {prefix}
              {t.name}
              {count != null ? (
                <span className="tabular-nums text-[var(--muted-faint)]">
                  {count}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={t.id}>
              {t.href ? (
                <Link href={t.href} className={className} title={`#${t.name}`}>
                  {body}
                </Link>
              ) : (
                <span className={className} title={`#${t.name}`}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {open && q && filtered.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">No tags match “{q}”.</p>
      ) : null}
    </div>
  );
}
