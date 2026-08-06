import Link from "next/link";
import {
  AlertTriangle,
  Loader2,
  Tags,
  Trash2,
} from "lucide-react";
import type { RescueSnapshot } from "@/lib/catalog/rescue";

export function RescuePanel({ rescue }: { rescue: RescueSnapshot }) {
  if (!rescue.hasWork) return null;

  return (
    <section
      className="surface border-[var(--accent-ring)] p-4 sm:p-5"
      aria-label="Rescue desk"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Desk</p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-[var(--ink)]">
            Rescue
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Catch up on missing holdings, untagged items, and job status.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rescue.missingCount > 0 ? (
          <li>
            <Link
              href="/catalog?missing=1"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--danger)]">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Missing
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.missingCount}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Open weeding desk
              </span>
            </Link>
          </li>
        ) : null}

        {rescue.untaggedCount > 0 ? (
          <li>
            <Link
              href="/catalog?untagged=1"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Tags className="h-3.5 w-3.5" aria-hidden />
                Untagged
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.untaggedCount}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Browse untagged holdings
              </span>
            </Link>
          </li>
        ) : null}

        {rescue.runningJobs.length > 0 ? (
          <li>
            <Link
              href="/services"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Running
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.runningJobs.length}
              </span>
              <span className="line-clamp-2 text-xs text-[var(--muted)]">
                {rescue.runningJobs[0]?.label ?? "Jobs in progress"}
              </span>
            </Link>
          </li>
        ) : null}

        {rescue.failedJobs.length > 0 ? (
          <li>
            <Link
              href="/services"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--danger)]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Failed jobs
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.failedJobs.length}
              </span>
              <span className="line-clamp-2 text-xs text-[var(--muted)]">
                {rescue.failedJobs[0]?.error ??
                  rescue.failedJobs[0]?.label ??
                  "See Services"}
              </span>
            </Link>
          </li>
        ) : null}

        {rescue.lowUseTagCount >= 20 ? (
          <li>
            <Link
              href="/collections"
              className="surface-inset flex h-full flex-col gap-1 rounded-[var(--radius-md)] p-3 transition hover:border-[var(--accent-ring)]"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <Tags className="h-3.5 w-3.5" aria-hidden />
                Tag hygiene
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                {rescue.lowUseTagCount}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Low-use tags — merge or delete
              </span>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
