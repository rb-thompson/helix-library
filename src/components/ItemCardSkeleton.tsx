import { cn } from "@/lib/cn";

/** Current holding-card geometry (PR4 may restyle; keep this in sync). */
export function ItemCardSkeleton() {
  return (
    <div className="holding-card pointer-events-none" aria-hidden>
      <div className="holding-card__media holding-card__media-empty aspect-[4/3] animate-pulse sm:aspect-square" />
      <div className="holding-card__meta flex flex-1 flex-col gap-2 px-2.5 py-2.5 sm:px-3 sm:py-3">
        <div className="h-3 w-3/4 rounded bg-[var(--paper-deep)]" />
        <div className="h-2.5 w-1/2 rounded bg-[var(--paper-deep)]" />
      </div>
    </div>
  );
}

export function ItemRowSkeleton() {
  return (
    <li
      className="holding-row pointer-events-none flex items-start gap-3 px-3 py-3"
      aria-hidden
    >
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-[0.45rem] bg-[var(--paper-deep)]" />
      <div className="min-w-0 flex-1 space-y-2 py-1">
        <div className="h-3 w-1/2 rounded bg-[var(--paper-deep)]" />
        <div className="h-2.5 w-1/3 rounded bg-[var(--paper-deep)]" />
      </div>
    </li>
  );
}

export function CatalogSkeletons({
  count,
  view,
}: {
  count: number;
  view: "grid" | "list";
}) {
  const n = Math.max(1, Math.min(count, 24));
  if (view === "list") {
    return (
      <ul className="surface-flat overflow-hidden" aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <ItemRowSkeleton key={i} />
        ))}
      </ul>
    );
  }
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
      )}
      aria-hidden
    >
      {Array.from({ length: n }, (_, i) => (
        <ItemCardSkeleton key={i} />
      ))}
    </div>
  );
}
