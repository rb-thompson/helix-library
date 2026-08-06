"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type JobRow = {
  id: number;
  kind: string;
  status: string;
  label: string;
};

/**
 * Compact active-job indicator for the site header.
 */
export function HeaderJobsStrip() {
  const [active, setActive] = useState<JobRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=12", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.jobs)) return;
      setActive(
        (data.jobs as JobRow[]).filter(
          (j) => j.status === "running" || j.status === "pending",
        ),
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [refresh]);

  if (active.length === 0) return null;

  const first = active[0]!;
  const label =
    active.length === 1
      ? first.label.slice(0, 28)
      : `${active.length} jobs`;

  return (
    <Link
      href="/services"
      className="hidden items-center gap-1.5 rounded-full border border-[var(--accent-ring)] bg-[var(--accent-soft)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] lg:inline-flex"
      title={active.map((j) => `#${j.id} ${j.kind}: ${j.label}`).join("\n")}
    >
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      <span className="max-w-[9rem] truncate">{label}</span>
    </Link>
  );
}
