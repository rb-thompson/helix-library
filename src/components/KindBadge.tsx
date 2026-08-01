import type { ItemKind } from "@/lib/types";
import { kindLabel } from "@/lib/format";
import { cn } from "@/lib/cn";

const tips: Record<ItemKind, string> = {
  text: "Plain text or markdown note",
  image: "Still image — open for full preview",
  video: "Video file — open for player and poster",
  audio: "Audio file",
  archive: "Compressed archive (zip, tar, …)",
  code: "Source code or config",
  document: "Document (PDF text is searchable when extracted)",
  other: "Unclassified format",
};

export function KindBadge({
  kind,
  className,
}: {
  kind: ItemKind | string;
  className?: string;
}) {
  const k = (
    kind in tips ? kind : "other"
  ) as ItemKind;
  return (
    <span
      title={tips[k]}
      className={cn("kind-badge", `kind-${k}`, className)}
    >
      {kindLabel(k)}
    </span>
  );
}
