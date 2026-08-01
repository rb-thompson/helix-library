"use client";

import { Check, Play } from "lucide-react";
import { KindBadge } from "@/components/KindBadge";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CatalogItemRow } from "@/lib/types";

export type LightboxNeighbor = {
  id: number;
  name: string;
  kind: string;
};

export function ItemCard({
  item,
  hasPreview,
  onOpenLightbox,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: CatalogItemRow;
  hasPreview: boolean;
  onOpenLightbox?: (id: number) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const media = item.kind === "image" || item.kind === "video";
  const showThumb = hasPreview && media;

  function open() {
    if (selectMode) {
      onToggleSelect?.();
      return;
    }
    if (onOpenLightbox && media) {
      onOpenLightbox(item.id);
      return;
    }
    window.location.href = `/catalog/${item.id}`;
  }

  const tip = selectMode
    ? selected
      ? "Deselect"
      : "Select for bulk shelf or tag"
    : media
      ? "Fullscreen preview · ← → in lightbox · open detail for metadata"
      : "Open detail for preview and metadata";

  return (
    <button
      type="button"
      onClick={open}
      title={tip}
      aria-pressed={selectMode ? selected : undefined}
      className={cn("holding-card group", selected && "is-selected")}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--paper-deep)] sm:aspect-square">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/thumbs/${item.id}`}
            alt=""
            className="h-full w-full object-cover transition duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center">
            <KindBadge kind={item.kind} />
            <span className="line-clamp-3 text-[0.8125rem] font-medium leading-snug text-[var(--ink-soft)]">
              {item.name}
            </span>
          </div>
        )}
        {selectMode ? (
          <span
            className={cn(
              "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[0.4rem] border shadow-sm transition",
              selected
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--line-strong)] bg-[rgb(255_252_247_/_0.92)] text-transparent",
            )}
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : null}
        {item.kind === "video" ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[rgb(26_22_20_/_0.72)] px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Play className="h-3 w-3 fill-current" aria-hidden />
            {item.durationMs != null
              ? `${(item.durationMs / 1000).toFixed(0)}s`
              : "Video"}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2.5 py-2.5 sm:px-3 sm:py-3">
        <div className="flex items-start justify-between gap-1.5">
          <span className="line-clamp-2 text-[0.8125rem] font-semibold leading-snug text-[var(--ink)]">
            {item.name}
          </span>
          {showThumb ? <KindBadge kind={item.kind} className="shrink-0" /> : null}
        </div>
        <p className="truncate font-mono text-[0.65rem] text-[var(--muted)]">
          {item.relPath}
        </p>
        <p className="text-[0.7rem] tabular-nums text-[var(--muted-faint)]">
          {formatBytes(item.sizeBytes)}
          <span className="mx-1 text-[var(--line-strong)]">·</span>
          {item.locationName}
        </p>
      </div>
    </button>
  );
}
