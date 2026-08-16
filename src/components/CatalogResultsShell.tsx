"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CatalogSkeletons } from "@/components/ItemCardSkeleton";
import {
  catalogHrefPageView,
  useCatalogNav,
} from "@/components/CatalogSearch";

export function CatalogResultsShell({
  itemsLength,
  page,
  view,
  pageSize,
  children,
}: {
  itemsLength: number;
  page: number;
  view: "grid" | "list";
  pageSize: number;
  children: ReactNode;
}) {
  const { isPending, pendingHref } = useCatalogNav();
  const prev = useRef({ itemsLength, page, view });

  useEffect(() => {
    if (!isPending) {
      prev.current = { itemsLength, page, view };
    }
  }, [isPending, itemsLength, page, view]);

  const target = pendingHref ? catalogHrefPageView(pendingHref) : null;
  const nextPage = target?.page ?? page;
  const nextView: "grid" | "list" =
    target?.view === "list" || target?.view === "grid" ? target.view : view;

  const pageChanged = isPending && nextPage !== prev.current.page;
  const viewChanged = isPending && nextView !== prev.current.view;
  const showSkeletons =
    isPending &&
    (prev.current.itemsLength === 0 || pageChanged || viewChanged);

  return (
    <div id="catalog-results" aria-busy={isPending || undefined}>
      {showSkeletons ? (
        <CatalogSkeletons
          count={pageSize}
          view={viewChanged ? nextView : prev.current.view}
        />
      ) : (
        <div className={isPending ? "catalog-results-stale" : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
