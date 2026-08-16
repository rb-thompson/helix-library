"use client";

import { useState } from "react";
import { Check, Play } from "lucide-react";
import { KindBadge } from "@/components/KindBadge";
import { SearchHighlight } from "@/components/SearchHighlight";
import { displayTitle } from "@/lib/catalog/display";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ITEM_KINDS, type CatalogItemRow } from "@/lib/types";

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
  browsing = false,
  browseIndex,
  onToggleSelect,
  highlightTokens = [],
}: {
  item: CatalogItemRow;
  hasPreview: boolean;
  onOpenLightbox?: (id: number) => void;
  selectMode?: boolean;
  selected?: boolean;
  browsing?: boolean;
  browseIndex?: number;
  onToggleSelect?: () => void;
  highlightTokens?: string[];
}) {
  const media = item.kind === "image" || item.kind === "video";
  const showThumb = hasPreview && media;
  const label = displayTitle(item);
  const [thumbLoaded, setThumbLoaded] = useState(false);

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

  const kindClass = `kind-${(ITEM_KINDS as readonly string[]).includes(item.kind) ? item.kind : "other"}`;

  return (
    <button
      type="button"
      onClick={open}
      title={tip}
      data-kind={item.kind}
      aria-pressed={selectMode ? selected : undefined}
      tabIndex={browsing ? 0 : -1}
      data-browse-index={browseIndex}
      className={cn(
        "holding-card group",
        kindClass,
        selected && "is-selected",
        browsing && "is-browse",
      )}
    >
      <div
        className={cn(
          "holding-card__media relative aspect-[4/3] sm:aspect-square",
          !showThumb && "holding-card__media-empty",
        )}
      >
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/thumbs/${item.id}`}
            alt=""
            onLoad={() => setThumbLoaded(true)}
            className={cn(
              "holding-card__thumb h-full w-full object-cover",
              thumbLoaded && "is-loaded",
            )}
          />
        ) : null}
        {selectMode ? (
          <span
            className={cn(
              "absolute right-2 top-2 z-[1] flex h-6 w-6 items-center justify-center rounded-[0.4rem] border shadow-sm transition",
              selected
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                : "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] text-transparent backdrop-blur-sm",
            )}
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : null}
        {item.kind === "video" ? (
          <span className="absolute bottom-2 left-2 z-[1] inline-flex items-center gap-1 rounded-full bg-[rgb(8_9_12_/_0.72)] px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Play className="h-3 w-3 fill-current" aria-hidden />
            {item.durationMs != null
              ? `${(item.durationMs / 1000).toFixed(0)}s`
              : "Video"}
          </span>
        ) : null}
      </div>
      <div className="holding-card__meta flex flex-1 flex-col gap-0.5 px-2.5 py-2.5 sm:px-3 sm:py-3">
        <div className="flex items-start justify-between gap-1.5">
          <span
            className="line-clamp-2 text-[0.8125rem] font-semibold leading-snug text-[var(--ink)]"
            title={label !== item.name ? item.name : undefined}
          >
            {highlightTokens.length ? (
              <SearchHighlight text={label} tokens={highlightTokens} />
            ) : (
              label
            )}
          </span>
          <KindBadge kind={item.kind} className="shrink-0" />
        </div>
        <p className="truncate font-mono text-[0.65rem] text-[var(--muted)]">
          {highlightTokens.length ? (
            <SearchHighlight text={item.relPath} tokens={highlightTokens} />
          ) : (
            item.relPath
          )}
        </p>
        {item.snippet && item.matchField === "body" ? (
          <p className="line-clamp-2 text-[0.65rem] leading-snug text-[var(--ink-soft)]">
            <SearchHighlight text={item.snippet} tokens={highlightTokens} />
          </p>
        ) : null}
        <p className="text-[0.7rem] tabular-nums text-[var(--muted-faint)]">
          {formatBytes(item.sizeBytes)}
          <span className="mx-1 text-[var(--line-strong)]">·</span>
          {item.locationName}
        </p>
      </div>
    </button>
  );
}
