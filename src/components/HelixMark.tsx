import { cn } from "@/lib/cn";

/**
 * Helix Library brand mark — generated H + double-helix monogram.
 * Static image (no SVG wriggle). Parent link provides accessible name.
 */
export function HelixMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn("helix-mark", className)}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/helix-mark.png"
        alt=""
        width={40}
        height={40}
        className="helix-mark-img"
        draggable={false}
      />
    </span>
  );
}
