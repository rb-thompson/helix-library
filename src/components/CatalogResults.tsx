"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Grid3X3, List, Square } from "lucide-react";
import { BulkCurationBar } from "@/components/BulkCurationBar";
import { ItemCard } from "@/components/ItemCard";
import { ItemRow } from "@/components/ItemRow";
import { MediaLightbox, type LightboxItem } from "@/components/MediaLightbox";
import { cn } from "@/lib/cn";
import type { CatalogItemRow } from "@/lib/types";

export function CatalogResults({
  items,
  thumbIds,
  view,
  viewToggleHref,
  collections = [],
  weedingMode = false,
  highlightTokens = [],
}: {
  items: CatalogItemRow[];
  thumbIds: number[];
  view: "grid" | "list";
  viewToggleHref: { grid: string; list: string };
  collections?: Array<{ id: number; name: string }>;
  weedingMode?: boolean;
  highlightTokens?: string[];
}) {
  const [lightboxId, setLightboxId] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const thumbSet = useMemo(() => new Set(thumbIds), [thumbIds]);

  const lightboxItems: LightboxItem[] = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.kind === "image" || i.kind === "video" || i.kind === "audio",
        )
        .map((i) => ({ id: i.id, name: i.name, kind: i.kind })),
    [items],
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOnPage() {
    setSelected(new Set(items.map((i) => i.id)));
    setSelectMode(true);
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectMode(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (selectMode) clearSelection();
              else setSelectMode(true);
            }}
            title="Select holdings to shelf or tag in bulk"
            className={cn(
              "btn btn-sm",
              selectMode ? "btn-primary" : "btn-secondary",
            )}
          >
            {selectMode ? (
              <CheckSquare className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Square className="h-3.5 w-3.5" aria-hidden />
            )}
            {selectMode ? "Selecting" : "Select"}
          </button>
          {selectMode ? (
            <button
              type="button"
              onClick={selectAllOnPage}
              className="btn btn-ghost btn-sm"
            >
              All on page
            </button>
          ) : null}
        </div>
        <div className="segment" role="group" aria-label="View mode">
          <Link
            href={viewToggleHref.grid}
            title="Grid view"
            className={cn(view === "grid" && "is-active")}
          >
            <Grid3X3 className="h-3.5 w-3.5" aria-hidden />
            Grid
          </Link>
          <Link
            href={viewToggleHref.list}
            title="List view"
            className={cn(view === "list" && "is-active")}
          >
            <List className="h-3.5 w-3.5" aria-hidden />
            List
          </Link>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              hasPreview={thumbSet.has(item.id)}
              selectMode={selectMode}
              selected={selected.has(item.id)}
              onToggleSelect={() => toggle(item.id)}
              highlightTokens={highlightTokens}
              onOpenLightbox={(id) => {
                if (selectMode) {
                  toggle(id);
                  return;
                }
                const hit = items.find((i) => i.id === id);
                if (
                  hit &&
                  (hit.kind === "image" ||
                    hit.kind === "video" ||
                    hit.kind === "audio")
                ) {
                  setLightboxId(id);
                } else {
                  window.location.href = `/catalog/${id}`;
                }
              }}
            />
          ))}
        </div>
      ) : (
        <ul className="surface-flat overflow-hidden">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              hasPreview={thumbSet.has(item.id)}
              selectMode={selectMode}
              selected={selected.has(item.id)}
              onToggleSelect={() => toggle(item.id)}
              highlightTokens={highlightTokens}
              onOpenLightbox={
                !selectMode &&
                (item.kind === "image" ||
                  item.kind === "video" ||
                  item.kind === "audio")
                  ? () => setLightboxId(item.id)
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      <BulkCurationBar
        selectedIds={[...selected]}
        collections={collections}
        onClear={clearSelection}
        weedingMode={weedingMode}
      />

      {lightboxId != null && lightboxItems.length > 0 && !selectMode ? (
        <MediaLightbox
          items={lightboxItems}
          startId={lightboxId}
          open
          onClose={() => setLightboxId(null)}
        />
      ) : null}
    </div>
  );
}
