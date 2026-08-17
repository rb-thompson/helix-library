import { cn } from "@/lib/cn";

export type MothPose = "idle" | "reading" | "reindex" | "portrait";

const SRC: Record<MothPose, string> = {
  idle: "/brand/moth-idle.jpg",
  reading: "/brand/moth-reading.jpg",
  reindex: "/brand/moth-reindex.jpg",
  portrait: "/brand/moth-portrait.jpg",
};

const DEFAULT_ALT: Record<MothPose, string> = {
  idle: "The night moth standing by the Circulation cart",
  reading: "The night moth reading at the lamp",
  reindex: "The night moth startled as catalog cards fly",
  portrait: "The night moth, Circulation clerk",
};

/**
 * Helix mascot — night-moth Circulation clerk.
 * Character, not a logo. H+helix mark stays the brand lockup.
 */
export function NightMoth({
  pose = "idle",
  className,
  alt,
}: {
  pose?: MothPose;
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[pose]}
      alt={alt ?? DEFAULT_ALT[pose]}
      className={cn("night-moth", className)}
      draggable={false}
    />
  );
}
