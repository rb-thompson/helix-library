"use client";

import Link from "next/link";
import { Check, Play } from "lucide-react";
import { KindBadge } from "@/components/KindBadge";
import { SearchHighlight } from "@/components/SearchHighlight";
import { displayTitle } from "@/lib/catalog/display";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ITEM_KINDS, type CatalogItemRow } from "@/lib/types";

export function ItemRow({
  item,
  hasPreview = false,
  onOpenLightbox,
  selectMode = false,
  selected = false,
  onToggleSelect,
  highlightTokens = [],
}: {
  item: CatalogItemRow;
  hasPreview?: boolean;
  onOpenLightbox?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  highlightTokens?: string[];
}) {
  const media = item.kind === "image" || item.kind === "video";
  const showThumb = hasPreview && media;
  const label = displayTitle(item);
  const kindClass = `kind-${(ITEM_KINDS as readonly string[]).includes(item.kind) ? item.kind : "other"}`;

  const body = (
    <>
      <div className="flex min-w-0 items-start gap-3">
        {selectMode ? (
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.35rem] border transition",
              selected
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                : "border-[var(--line-strong)] bg-[var(--surface)] text-transparent",
            )}
            aria-hidden
          >
            <Check className="h-3 w-3" />
          </span>
        ) : null}
        {showThumb ? (
          <span className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/thumbs/${item.id}`}
              alt=""
              className="holding-row__thumb h-11 w-11 rounded-[0.45rem] border bg-[var(--paper-deep)] object-cover"
            />
            {item.kind === "video" ? (
              <Play
                className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow"
                aria-hidden
              />
            ) : null}
          </span>
        ) : (
          <span
            className="holding-row__thumb flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.45rem] border bg-[var(--paper-deep)] text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--muted)]"
            aria-hidden
          >
            {item.ext || item.kind.slice(0, 3)}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="truncate text-sm font-semibold text-[var(--ink)]"
              title={label !== item.name ? item.name : undefined}
            >
              {highlightTokens.length ? (
                <SearchHighlight text={label} tokens={highlightTokens} />
              ) : (
                label
              )}
            </span>
            <KindBadge kind={item.kind} />
            {item.isMissing ? (
              <span className="text-xs font-medium text-[var(--danger)]">
                Missing
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[0.7rem] text-[var(--muted)]">
            {item.locationName}
            <span className="text-[var(--muted-faint)]"> · </span>
            {highlightTokens.length ? (
              <SearchHighlight text={item.relPath} tokens={highlightTokens} />
            ) : (
              item.relPath
            )}
          </p>
          {item.snippet && item.matchField === "body" ? (
            <p className="mt-1 line-clamp-2 text-[0.75rem] leading-snug text-[var(--ink-soft)]">
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[var(--muted-faint)]">
                text ·{" "}
              </span>
              <SearchHighlight text={item.snippet} tokens={highlightTokens} />
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-4 pl-[3.25rem] text-[0.7rem] tabular-nums text-[var(--muted)] sm:pl-0">
        <span>{formatBytes(item.sizeBytes)}</span>
        <span className="hidden sm:inline" title={new Date(item.mtimeMs).toLocaleString()}>
          {formatRelativeDate(item.mtimeMs)}
        </span>
      </div>
    </>
  );

  const rowClass = cn("holding-row", kindClass, selected && "is-selected");

  if (selectMode) {
    return (
      <li className="border-b border-[var(--line)] last:border-0">
        <button
          type="button"
          onClick={onToggleSelect}
          title={selected ? "Deselect" : "Select for bulk curation"}
          aria-pressed={selected}
          data-kind={item.kind}
          className={rowClass}
        >
          {body}
        </button>
      </li>
    );
  }

  const tip = media
    ? "Open preview (or detail for full metadata)"
    : "Open item detail";

  if (onOpenLightbox && media) {
    return (
      <li className="border-b border-[var(--line)] last:border-0">
        <button
          type="button"
          onClick={onOpenLightbox}
          title={tip}
          data-kind={item.kind}
          className={rowClass}
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li className="border-b border-[var(--line)] last:border-0">
      <Link
        href={`/catalog/${item.id}`}
        title={tip}
        data-kind={item.kind}
        className={rowClass}
      >
        {body}
      </Link>
    </li>
  );
}
