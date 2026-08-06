"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  clearOpenHistory,
  readOpenHistory,
  type OpenHistoryEntry,
} from "@/lib/client/open-history";
import { formatRelativeDate } from "@/lib/format";

export function RecentOpens({ limit = 8 }: { limit?: number }) {
  const [entries, setEntries] = useState<OpenHistoryEntry[] | null>(null);

  useEffect(() => {
    setEntries(readOpenHistory().slice(0, limit));
  }, [limit]);

  if (entries == null || entries.length === 0) return null;

  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
          Recently opened
        </h2>
        <button
          type="button"
          className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
          onClick={() => {
            clearOpenHistory();
            setEntries([]);
          }}
        >
          Clear
        </button>
      </div>
      <ul className="surface-flat overflow-hidden">
        {entries.map((e) => (
          <li
            key={`${e.id}-${e.openedAt}`}
            className="border-b border-[var(--line)] last:border-0"
          >
            <Link
              href={`/catalog/${e.id}`}
              className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--paper-deep)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                  {e.name}
                </span>
                <span className="text-[0.7rem] capitalize text-[var(--muted)]">
                  {e.kind}
                  <span className="text-[var(--muted-faint)]">
                    {" "}
                    · {formatRelativeDate(e.openedAt)}
                  </span>
                </span>
              </span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-[var(--muted-faint)]"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
