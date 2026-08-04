import Link from "next/link";
import { X } from "lucide-react";

export type FilterChip = {
  key: string;
  label: string;
  clearHref: string;
};

export function ActiveFilters({
  chips,
  clearAllHref,
}: {
  chips: FilterChip[];
  clearAllHref: string;
}) {
  if (chips.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Active filters"
    >
      <span className="label-quiet mb-0 mr-1 !inline">Active</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.clearHref}
          title={`Remove filter: ${chip.label}`}
          className="chip chip-active group"
        >
          <span className="max-w-[14rem] truncate">{chip.label}</span>
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--accent)] transition group-hover:bg-[var(--accent-muted)]">
            <X className="h-3 w-3" aria-hidden />
            <span className="sr-only">Remove {chip.label}</span>
          </span>
        </Link>
      ))}
      {chips.length > 1 ? (
        <Link href={clearAllHref} className="link-accent ml-1 text-xs">
          Clear all
        </Link>
      ) : null}
    </div>
  );
}
