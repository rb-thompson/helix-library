import type { Metadata } from "next";
import Link from "next/link";
import { KnowledgeGraphLoader } from "@/components/KnowledgeGraphLoader";
import {
  buildKnowledgeGraph,
  DEFAULT_MAX_ITEMS,
  graphHrefFromFilters,
  HARD_MAX_ITEMS,
  isItemKind,
  type GraphFilters,
} from "@/lib/graph/build";
import { ensureLocationsSynced } from "@/lib/locations/manage";
import type { GraphMode } from "@/lib/client/graph-mode";
// type-only import — no client localStorage on server

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "Force-directed map of Helix Library holdings, tags, shelves, and formats (2D or 3D).",
};

type SearchParams = Promise<{
  singletons?: string;
  kind?: string;
  locationId?: string;
  tagId?: string;
  collectionId?: string;
  q?: string;
  maxItems?: string;
  mode?: string;
}>;

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function parseMaxItems(raw: string | undefined): number | undefined {
  const n = parsePositiveInt(raw);
  if (n == null) return undefined;
  // Client may request 200/400/600; server still caps at HARD_MAX
  return Math.min(HARD_MAX_ITEMS, n);
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

  const maxItems = parseMaxItems(sp.maxItems);
  const modeQuery: GraphMode | null =
    sp.mode === "2d" || sp.mode === "3d" ? sp.mode : null;

  const graph = buildKnowledgeGraph({
    ...filters,
    minTagCount: showSingletons ? 1 : undefined,
    maxTags: showSingletons ? 80 : undefined,
    maxItems: maxItems ?? undefined,
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
    maxItems,
    mode: modeQuery ?? undefined,
  });
  const singletonOn = graphHrefFromFilters({
    ...filters,
    singletons: true,
    maxItems,
    mode: modeQuery ?? undefined,
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

  const maxChips = [200, 400, 600] as const;
  const activeMax = graph.meta.maxItems;

  const catalogParams = new URLSearchParams({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.locationId
      ? { location: String(filters.locationId) }
      : {}),
    ...(filters.tagId ? { tag: String(filters.tagId) } : {}),
    ...(filters.collectionId
      ? { collection: String(filters.collectionId) }
      : {}),
  }).toString();

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Personal knowledge graph</p>
          <h1 className="page-title mt-1">Knowledge Graph</h1>
          <p className="page-sub max-w-2xl">
            Holdings and concepts as a force layout — switch 2D (lighter) or 3D
            (orbit). Drag, zoom, tap a node to inspect.
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
                href={catalogParams ? `/catalog?${catalogParams}` : "/catalog"}
                className="link-accent text-xs font-semibold"
              >
                Open in catalog
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
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
          <div
            className="segment shrink-0"
            role="group"
            aria-label="Holdings sample size"
          >
            {maxChips.map((n) => (
              <Link
                key={n}
                href={graphHrefFromFilters({
                  ...filters,
                  singletons: showSingletons,
                  maxItems: n,
                  mode: modeQuery ?? undefined,
                })}
                className={activeMax === n ? "is-active" : undefined}
                title={`Sample up to ${n} holdings (server max ${HARD_MAX_ITEMS})`}
              >
                {n}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href={graphHrefFromFilters({
            ...filters,
            kind: "document",
            singletons: showSingletons,
            maxItems,
            mode: modeQuery ?? undefined,
          })}
          className="chip !py-0.5 hover:border-[var(--accent)]"
        >
          Documents only
        </Link>
        <Link
          href={graphHrefFromFilters({
            ...filters,
            // “Tagged only” ≈ min density via shared tags default; point at catalog untagged inverse is hard —
            // use tag density message: open catalog with no untagged. Chip links to tagged-friendly view.
            kind: filters.kind,
            singletons: false,
            maxItems,
            mode: modeQuery ?? undefined,
          })}
          className="chip !py-0.5 hover:border-[var(--accent)]"
          title="Hide singleton tags so only multi-use tags appear"
        >
          Shared tags only
        </Link>
        {hasFilters ? (
          <Link
            href={catalogParams ? `/catalog?${catalogParams}` : "/catalog"}
            className="chip !py-0.5 hover:border-[var(--accent)]"
          >
            Same filters in catalog
          </Link>
        ) : null}
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
        <KnowledgeGraphLoader data={graph} initialMode={modeQuery} />
      )}

      <p className="text-xs text-[var(--muted-faint)]">
        {graph.meta.truncated ? (
          <>
            Showing{" "}
            <span className="font-medium text-[var(--muted)]">
              {graph.meta.itemCount} of {graph.meta.totalItems}
            </span>{" "}
            holdings
            {hasFilters ? " (filter-scoped)" : ""}
            {" · cap "}
            {graph.meta.maxItems}
          </>
        ) : (
          <>
            {graph.meta.itemCount} holding
            {graph.meta.itemCount === 1 ? "" : "s"}
            {hasFilters ? " (filter-scoped)" : ""}
          </>
        )}
        {" · "}
        tags used on ≥{graph.meta.minTagCount} of these (top{" "}
        {graph.meta.tagsShown}
        {graph.meta.tagsOmitted > 0
          ? `; ${graph.meta.tagsOmitted} omitted`
          : ""}
        ). Meta tag <code className="text-[var(--muted)]">vision-tagged</code> is
        always omitted. 2D is default on phone / reduced-motion; preference
        saved as <code className="text-[var(--muted)]">helix-graph-mode</code>.
      </p>
    </div>
  );
}
