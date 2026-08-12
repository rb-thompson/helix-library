"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HelixSpinner } from "@/components/icons/HelixSpinner";


type JobRow = {
  id: number;
  kind: string;
  status: string;
  label: string;
};

/** Don't hammer Next during cold compiles (dev is single-threaded). */
const POLL_MS = 12_000;
const FETCH_TIMEOUT_MS = 4_000;

/**
 * Compact active-job indicator for the site header.
 * Polls gently: longer interval, pauses when tab hidden, aborts in-flight.
 */
export function HeaderJobsStrip() {
  const [active, setActive] = useState<JobRow[]>([]);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    // Drop previous poll if still waiting (prevents pile-up during compiles)
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/jobs?limit=12", {
        cache: "no-store",
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.jobs)) return;
      setActive(
        (data.jobs as JobRow[]).filter(
          (j) => j.status === "running" || j.status === "pending",
        ),
      );
    } catch {
      // ignore abort / network during compile
    } finally {
      clearTimeout(timer);
      if (inFlight.current === ac) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    function onVis() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      inFlight.current?.abort();
    };
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
      <HelixSpinner size="sm" decorative />
      <span className="max-w-[9rem] truncate">{label}</span>
    </Link>
  );
}
