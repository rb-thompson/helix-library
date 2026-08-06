import type { Metadata } from "next";
import Link from "next/link";
import { KnowledgeGraphLoader } from "@/components/KnowledgeGraphLoader";
import {
  buildKnowledgeGraph,
  graphHrefFromFilters,
  isItemKind,
  type GraphFilters,
} from "@/lib/graph/build";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "3D force-directed map of Helix Library holdings, tags, shelves, and formats.",
};

type SearchParams = Promise<{
  singletons?: string;
  kind?: string;
  locationId?: string;
  tagId?: string;
  collectionId?: string;
  q?: string;
}>;

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

export default async function GraphPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  ensureLocationsSynced();
  const sp = await searchParams;
  const showSingletons =
    sp.singletons === "1" || sp.singletons === "true" || sp.singletons === "yes";

  const filters: GraphFilters = {
    kind: sp.kind && isItemKind(sp.kind) ? sp.kind : undefined,
    locationId: parsePositiveInt(sp.locationId),
    tagId: parsePositiveInt(sp.tagId),
    collectionId: parsePositiveInt(sp.collectionId),
    q: sp.q?.trim() || undefined,
  };

  const graph = buildKnowledgeGraph({
    ...filters,
    minTagCount: showSingletons ? 1 : undefined,
    maxTags: showSingletons ? 80 : undefined,
  });

  const hasFilters = Boolean(
    filters.kind ||
      filters.locationId ||
      filters.tagId ||
      filters.collectionId ||
      filters.q,
  );

  const singletonBase = graphHrefFromFilters({
    ...filters,
    singletons: false,
  });
  const singletonOn = graphHrefFromFilters({
    ...filters,
    singletons: true,
  });

  const filterChips: { key: string; label: string }[] = [];
  if (filters.q) filterChips.push({ key: "q", label: `“${filters.q}”` });
  if (filters.kind) filterChips.push({ key: "kind", label: filters.kind });
  if (filters.locationId)
    filterChips.push({
      key: "loc",
      label: `location #${filters.locationId}`,
    });
  if (filters.tagId)
    filterChips.push({ key: "tag", label: `tag #${filters.tagId}` });
  if (filters.collectionId)
    filterChips.push({
      key: "col",
      label: `shelf #${filters.collectionId}`,
    });

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Personal knowledge graph</p>
          <h1 className="page-title mt-1">Knowledge Graph</h1>
          <p className="page-sub max-w-2xl">
            Holdings and concepts in one constellation — drag to orbit, pinch or
            scroll to zoom, tap a node to inspect.
            {hasFilters
              ? " Showing a filtered subset from the catalog."
              : " Singleton vision tags are hidden by default so shared themes stay readable."}
          </p>
          {filterChips.length > 0 ? (
            <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {filterChips.map((c) => (
                <span key={c.key} className="chip !py-0.5">
                  {c.label}
                </span>
              ))}
              <Link href="/graph" className="link-accent text-xs font-semibold">
                Clear filters
              </Link>
              <Link
                href={`/catalog?${new URLSearchParams({
                  ...(filters.q ? { q: filters.q } : {}),
                  ...(filters.kind ? { kind: filters.kind } : {}),
                  ...(filters.locationId
                    ? { location: String(filters.locationId) }
                    : {}),
                  ...(filters.tagId ? { tag: String(filters.tagId) } : {}),
                  ...(filters.collectionId
                    ? { collection: String(filters.collectionId) }
                    : {}),
                }).toString()}`}
                className="link-accent text-xs font-semibold"
              >
                Open in catalog
              </Link>
            </p>
          ) : null}
        </div>
        <div className="segment shrink-0" role="group" aria-label="Tag density">
          <Link
            href={singletonBase}
            className={!showSingletons ? "is-active" : undefined}
            title="Tags used on at least two holdings (or adaptive min when filtered)"
          >
            Shared tags
          </Link>
          <Link
            href={singletonOn}
            className={showSingletons ? "is-active" : undefined}
            title="Include single-use tags (noisier)"
          >
            Singletons
          </Link>
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="empty-state">
          <strong>No holdings in this graph</strong>
          {hasFilters ? (
            <>
              Try broader filters or{" "}
              <Link href="/graph" className="link-accent">
                clear graph filters
              </Link>
              .
            </>
          ) : (
            <>
              Catalog may be empty —{" "}
              <Link href="/services" className="link-accent">
                reindex
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <KnowledgeGraphLoader data={graph} />
      )}

      <p className="text-xs text-[var(--muted-faint)]">
        {graph.meta.itemCount} holding
        {graph.meta.itemCount === 1 ? "" : "s"}
        {graph.meta.truncated ? " (capped sample)" : ""}
        {" · "}
        tags used on ≥{graph.meta.minTagCount} of these (top{" "}
        {graph.meta.tagsShown}
        {graph.meta.tagsOmitted > 0
          ? `; ${graph.meta.tagsOmitted} omitted`
          : ""}
        ). Meta tag <code className="text-[var(--muted)]">vision-tagged</code> is
        always omitted. Desktop: left-drag orbit · right-drag pan · scroll zoom.
        Mobile: one finger orbit · pinch zoom.
      </p>
    </div>
  );
}
