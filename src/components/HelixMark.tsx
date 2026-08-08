import { cn } from "@/lib/cn";

/**
 * Helix Library brand mark — H + double-helix monogram.
 * Dark + light assets; CSS swaps on `html[data-theme]` (no client JS).
 * Parent link provides accessible name.
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
        className="helix-mark-img helix-mark-img--dark"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/helix-mark-light.png"
        alt=""
        width={40}
        height={40}
        className="helix-mark-img helix-mark-img--light"
        draggable={false}
      />
    </span>
  );
}
