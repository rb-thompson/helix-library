import type { ReactNode } from "react";

type Side = "top" | "bottom";

/**
 * Hover/focus tooltip via plain CSS (globals.css `.tip`).
 * Does not use Tailwind named groups (fragile under some builds).
 * Pass className="w-full" / "flex-1" when wrapping full-width controls.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className = "",
}: {
  content: string;
  children: ReactNode;
  side?: Side;
  className?: string;
}) {
  return (
    <span
      className={`tip ${side === "bottom" ? "tip-bottom" : ""} ${className}`.trim()}
      data-tip={content}
    >
      {children}
    </span>
  );
}

/** Small “?” control for labels and headings. */
export function HelpTip({
  content,
  label = "More info",
}: {
  content: string;
  label?: string;
}) {
  return (
    <span
      className="tip tip-help"
      data-tip={content}
      // keep keyboard focusable
    >
      <button
        type="button"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[10px] font-semibold leading-none text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        aria-label={label}
      >
        ?
      </button>
    </span>
  );
}
