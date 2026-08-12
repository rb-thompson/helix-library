import { cn } from "@/lib/cn";

const SIZES = {
  sm: 14,
  md: 18,
  lg: 28,
  xl: 40,
} as const;

export type HelixSpinnerSize = keyof typeof SIZES;

/**
 * Animated double-helix loading mark — symmetrical, quiet, alive.
 * Uses currentColor; pair with text utilities for theme.
 */
export function HelixSpinner({
  className,
  size = "md",
  label = "Loading",
  decorative = false,
}: {
  className?: string;
  size?: HelixSpinnerSize | number;
  label?: string;
  /** When true, hide from AT (parent already announces busy state). */
  decorative?: boolean;
}) {
  const px = typeof size === "number" ? size : SIZES[size];

  return (
    <span
      className={cn("helix-spinner", className)}
      style={{ width: px, height: px }}
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="helix-spinner-svg"
      >
        {/* Soft orbital ring */}
        <circle
          className="helix-spinner-orbit"
          cx="12"
          cy="12"
          r="10.25"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.22"
        />

        {/* Double helix — two intertwining strands + rungs */}
        <g className="helix-spinner-core">
          <path
            className="helix-spinner-strand helix-spinner-strand-a"
            d="M8.2 3.2
               C11.5 5.2 12.5 6.8 12 8.5
               C11.4 10.4 9.2 11.2 9.2 13
               C9.2 14.8 11.4 15.6 12 17.5
               C12.5 19.2 11.5 20.8 8.2 22.8"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="helix-spinner-strand helix-spinner-strand-b"
            d="M15.8 3.2
               C12.5 5.2 11.5 6.8 12 8.5
               C12.6 10.4 14.8 11.2 14.8 13
               C14.8 14.8 12.6 15.6 12 17.5
               C11.5 19.2 12.5 20.8 15.8 22.8"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Rungs — opacity chase for “alive” pulse */}
          <g className="helix-spinner-rungs" stroke="currentColor" strokeLinecap="round">
            <line className="helix-spinner-rung" x1="10.1" y1="5.4" x2="13.9" y2="5.4" strokeWidth="1.15" />
            <line className="helix-spinner-rung" x1="10.35" y1="8.5" x2="13.65" y2="8.5" strokeWidth="1.15" />
            <line className="helix-spinner-rung" x1="9.85" y1="12" x2="14.15" y2="12" strokeWidth="1.2" />
            <line className="helix-spinner-rung" x1="10.35" y1="15.5" x2="13.65" y2="15.5" strokeWidth="1.15" />
            <line className="helix-spinner-rung" x1="10.1" y1="18.6" x2="13.9" y2="18.6" strokeWidth="1.15" />
          </g>

          {/* Polar nodes */}
          <circle className="helix-spinner-node" cx="8.2" cy="3.2" r="1.05" fill="currentColor" />
          <circle className="helix-spinner-node" cx="15.8" cy="3.2" r="1.05" fill="currentColor" />
          <circle className="helix-spinner-node" cx="8.2" cy="22.8" r="1.05" fill="currentColor" />
          <circle className="helix-spinner-node" cx="15.8" cy="22.8" r="1.05" fill="currentColor" />
        </g>
      </svg>
      {!decorative ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
