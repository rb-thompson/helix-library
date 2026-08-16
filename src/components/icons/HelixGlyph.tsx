import { cn } from "@/lib/cn";

/**
 * Quiet double-helix watermark for buttons and plates.
 * Uses currentColor; pair with low opacity.
 */
export function HelixGlyph({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("helix-glyph", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
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
      <g stroke="currentColor" strokeLinecap="round" opacity="0.7">
        <line x1="10.1" y1="5.4" x2="13.9" y2="5.4" strokeWidth="1.1" />
        <line x1="10.35" y1="8.5" x2="13.65" y2="8.5" strokeWidth="1.1" />
        <line x1="9.85" y1="12" x2="14.15" y2="12" strokeWidth="1.15" />
        <line x1="10.35" y1="15.5" x2="13.65" y2="15.5" strokeWidth="1.1" />
        <line x1="10.1" y1="18.6" x2="13.9" y2="18.6" strokeWidth="1.1" />
      </g>
    </svg>
  );
}
