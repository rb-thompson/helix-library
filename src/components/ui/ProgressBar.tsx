import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { cn } from "@/lib/cn";

export function ProgressBar({
  percent,
  active,
  label,
  detail,
  size = "default",
  className,
}: {
  percent: number | null;
  active: boolean;
  label?: string;
  detail?: string;
  size?: "compact" | "default";
  className?: string;
}) {
  const indeterminate = percent == null;
  const width =
    indeterminate ? undefined : `${Math.max(2, Math.min(100, percent))}%`;
  const bar = (
    <div
      className={cn(
        "overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ok)_18%,var(--paper-deep))]",
        size === "compact" ? "h-1" : "h-1.5",
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      aria-label={label}
      aria-busy={active || undefined}
    >
      <div
        className={cn(
          "h-full rounded-full bg-[var(--ok)] shadow-[0_0_10px_color-mix(in_srgb,var(--ok)_45%,transparent)] transition-[width] duration-[var(--dur)]",
          indeterminate && "w-1/3 animate-pulse",
        )}
        style={indeterminate ? undefined : { width }}
      />
    </div>
  );

  if (size === "compact") {
    return (
      <div className={cn("flex min-w-[4.5rem] flex-col gap-0.5", className)}>
        {label ? (
          <span className="truncate text-[0.65rem] font-medium text-[var(--ink-soft)]">
            {label}
          </span>
        ) : null}
        {bar}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-2.5",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy={active}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium capitalize text-[var(--ink)]">
          {active ? (
            <HelixSpinner size="sm" decorative className="text-[var(--ok)]" />
          ) : null}
          {label ?? (indeterminate ? "Working" : "Progress")}
        </span>
        <span className="tabular-nums text-[var(--muted)]">
          {indeterminate ? "…" : `${Math.round(percent)}%`}
        </span>
      </div>
      <div className="mt-2">{bar}</div>
      {detail ? (
        <p className="mt-1.5 line-clamp-2 font-mono text-[0.65rem] text-[var(--muted)]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
