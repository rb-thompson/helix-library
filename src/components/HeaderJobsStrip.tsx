"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { toast } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import type { HelixJob } from "@/lib/jobs/types";

/** Don't hammer Next during cold compiles (dev is single-threaded). */
const IDLE_POLL_MS = 12_000;
const ACTIVE_POLL_MS = 1_200;
const FETCH_TIMEOUT_MS = 4_000;
const FLASH_MS = 1_600;

function isActiveStatus(status: string): boolean {
  return status === "running" || status === "pending";
}

function completionTitle(job: HelixJob): string {
  if (job.kind === "reindex") {
    const added =
      job.result && typeof job.result.added === "number"
        ? job.result.added
        : null;
    return added != null ? `Reindex done — +${added} added` : "Reindex done";
  }
  if (job.kind === "backup") return "Backup done";
  if (job.kind === "restore") return "Restore done";
  if (job.kind === "lens_analyze") return "Lens analysis done";
  return "Acquire done";
}

/**
 * Compact active-job indicator for the site header.
 * Idle poll 12s; 1.2s while a job is running/pending.
 * Determinate fill only when the job reports a percent (reindex never does).
 */
export function HeaderJobsStrip() {
  const [active, setActive] = useState<HelixJob[]>([]);
  const [flash, setFlash] = useState<HelixJob | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const prevActive = useRef<HelixJob[]>([]);
  const toasted = useRef(new Set<number>());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noteCompleted = useCallback((job: HelixJob) => {
    if (toasted.current.has(job.id)) return;
    toasted.current.add(job.id);
    setFlash(job);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash((cur) => (cur?.id === job.id ? null : cur));
      flashTimer.current = null;
    }, FLASH_MS);
    toast({
      tone: "ok",
      title: completionTitle(job),
      href: "/services",
    });
  }, []);

  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
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
      const jobs = data.jobs as HelixJob[];
      const nextActive = jobs.filter((j) => isActiveStatus(j.status));
      for (const prev of prevActive.current) {
        if (nextActive.some((j) => j.id === prev.id)) continue;
        const finished = jobs.find((j) => j.id === prev.id);
        if (finished?.status === "completed") noteCompleted(finished);
      }
      prevActive.current = nextActive;
      setActive(nextActive);
    } catch {
      // ignore abort / network during compile
    } finally {
      clearTimeout(timer);
      if (inFlight.current === ac) inFlight.current = null;
    }
  }, [noteCompleted]);

  const hasActive = active.length > 0;

  useEffect(() => {
    void refresh();
    const t = setInterval(
      () => void refresh(),
      hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS,
    );
    function onVis() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      inFlight.current?.abort();
    };
  }, [refresh, hasActive]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const first = active[0];
  const flashing = Boolean(flash) && !first;
  if (!first && !flash) return null;

  const percent = first?.progress?.percent ?? null;
  const showBar = first != null && percent != null && Number.isFinite(percent);
  const label = first
    ? active.length === 1
      ? first.label.slice(0, 28)
      : `${active.length} jobs`
    : flash
      ? completionTitle(flash).slice(0, 28)
      : "";

  return (
    <Link
      href="/services"
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition lg:inline-flex",
        flashing
          ? "border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[var(--ok-soft)] text-[var(--ok)]"
          : "border-[var(--accent-ring)] bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)]",
      )}
      title={
        first
          ? active.map((j) => `#${j.id} ${j.kind}: ${j.label}`).join("\n")
          : flash
            ? completionTitle(flash)
            : undefined
      }
    >
      {showBar ? (
        <ProgressBar
          percent={percent}
          active
          size="compact"
          className="min-w-[2.5rem] w-10"
        />
      ) : flashing ? null : (
        <HelixSpinner size="sm" decorative />
      )}
      <span className="max-w-[9rem] truncate">{label}</span>
    </Link>
  );
}
