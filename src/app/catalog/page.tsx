import Link from "next/link";
import { ActiveFilters, type FilterChip } from "@/components/ActiveFilters";
import { CatalogResults } from "@/components/CatalogResults";
import { CollapsibleTagList } from "@/components/CollapsibleTagList";
import { SearchForm } from "@/components/SearchForm";
import {
  catalogFacets,
  listLocationsWithCounts,
  searchCatalog,
  searchTokens,
} from "@/lib/catalog/query";
import { listCollections, listTags } from "@/lib/collections/manage";
import { hasThumb } from "@/lib/indexer/enrich";
import { ensureLocationsSynced } from "@/lib/locations/manage";
import { filterVisibleTags } from "@/lib/tags/hidden";
import { graphHrefFromFilters } from "@/lib/graph/build";
import {
  CATALOG_SORTS,
  ITEM_KINDS,
  type CatalogSort,
  type CatalogSortDir,
  type ItemKind,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalog",
};

type SearchParams = Promise<{
  q?: string;
  kind?: string;
  location?: string;
  collection?: string;
  tag?: string;
  under?: string;
  sort?: string;
  dir?: string;
  page?: string;
  view?: string;
  /** Weeding desk: only holdings missing on disk */
  missing?: string;
  /** Only holdings with no tags */
  untagged?: string;
}>;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  ensureLocationsSynced();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const kind = (sp.kind ?? "") as ItemKind | "";
  const locationId: number | "" = sp.location ? Number(sp.location) : "";
  const collectionId: number | "" = sp.collection ? Number(sp.collection) : "";
  const tagId: number | "" = sp.tag ? Number(sp.tag) : "";
  const under = (sp.under ?? "").replace(/^\/+|\/+$/g, "");
  const sort = (
    CATALOG_SORTS.includes(sp.sort as CatalogSort) ? sp.sort : "mtime"
  ) as CatalogSort;
  const sortDir: CatalogSortDir =
    sp.dir === "asc" || sp.dir === "desc"
      ? sp.dir
      : sort === "name"
        ? "asc"
        : "desc";
  const page = sp.page ? Number(sp.page) : 1;
  const missingOnly =
    sp.missing === "1" || sp.missing === "true" || sp.missing === "yes";
  const untaggedOnly =
    sp.untagged === "1" || sp.untagged === "true" || sp.untagged === "yes";
  const view: "grid" | "list" =
    sp.view === "list"
      ? "list"
      : sp.view === "grid"
        ? "grid"
        : missingOnly || untaggedOnly
          ? "list"
          : kind === "image" || kind === "video" || !kind
            ? "grid"
            : "list";

  const pageSize = view === "grid" ? 24 : 25;

  const searchParamsObj = {
    q,
    kind: (kind || "") as ItemKind | "",
    locationId,
    collectionId,
    tagId,
    under,
    sort,
    sortDir,
    page,
    pageSize,
    missingOnly: missingOnly || undefined,
    untaggedOnly: untaggedOnly || undefined,
  };

  const result = searchCatalog(searchParamsObj);
  const facets = catalogFacets(searchParamsObj);
  const locations = listLocationsWithCounts();
  const collections = listCollections();
  // Full tag list for resolving active chip; dropdown uses popular only.
  // Hidden meta tags (e.g. vision-tagged) stay off facets/dropdown unless active.
  const tags = listTags({ sortBy: "count" });
  const visibleTags = filterVisibleTags(tags);
  const popularTags = visibleTags
    .filter((t) => Number(t.itemCount) >= 2)
    .slice(0, 60);
  const activeTag =
    tagId === "" ? null : (tags.find((t) => t.id === tagId) ?? null);
  const tagSelectOptions =
    activeTag && !popularTags.some((t) => t.id === activeTag.id)
      ? [activeTag, ...popularTags]
      : popularTags;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const thumbIds = result.items
    .filter((i) => hasThumb(i.id))
    .map((i) => i.id);

  function hrefFor(overrides: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const next = {
      q,
      kind,
      location: locationId === "" ? "" : String(locationId),
      collection: collectionId === "" ? "" : String(collectionId),
      tag: tagId === "" ? "" : String(tagId),
      under,
      missing: missingOnly ? "1" : "",
      untagged: untaggedOnly ? "1" : "",
      sort: sort === "mtime" ? "" : sort,
      dir:
        sort === "name"
          ? sortDir === "asc"
            ? ""
            : sortDir
          : sortDir === "desc"
            ? ""
            : sortDir,
      view: view === "list" ? "list" : sp.view === "grid" ? "grid" : view,
      page: String(page),
      ...overrides,
    };
    for (const [k, v] of Object.entries(next)) {
      if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) {
        if (k === "view" && v === "grid" && !sp.view) continue;
        params.set(k, String(v));
      }
    }
    const s = params.toString();
    return s ? `/catalog?${s}` : "/catalog";
  }

  const viewToggleHref = {
    grid: hrefFor({ view: "grid", page: 1 }),
    list: hrefFor({ view: "list", page: 1 }),
  };

  const filterChips: FilterChip[] = [];
  if (q) {
    filterChips.push({
      key: "q",
      label: `“${q}”`,
      clearHref: hrefFor({ q: "", page: 1 }),
    });
  }
  if (kind) {
    filterChips.push({
      key: "kind",
      label: kind,
      clearHref: hrefFor({ kind: "", page: 1 }),
    });
  }
  if (locationId !== "") {
    const locName =
      locations.find((l) => l.id === locationId)?.name ??
      `Location ${locationId}`;
    filterChips.push({
      key: "location",
      label: locName,
      clearHref: hrefFor({ location: "", page: 1 }),
    });
  }
  if (under) {
    filterChips.push({
      key: "under",
      label: `under ${under}`,
      clearHref: hrefFor({ under: "", page: 1 }),
    });
  }
  if (collectionId !== "") {
    const colName =
      collections.find((c) => c.id === collectionId)?.name ??
      `Collection ${collectionId}`;
    filterChips.push({
      key: "collection",
      label: colName,
      clearHref: hrefFor({ collection: "", page: 1 }),
    });
  }
  if (tagId !== "") {
    const tagName = tags.find((t) => t.id === tagId)?.name ?? `Tag ${tagId}`;
    filterChips.push({
      key: "tag",
      label: `#${tagName}`,
      clearHref: hrefFor({ tag: "", page: 1 }),
    });
  }
  if (missingOnly) {
    filterChips.push({
      key: "missing",
      label: "Missing on disk",
      clearHref: hrefFor({ missing: "", page: 1 }),
    });
  }
  if (untaggedOnly) {
    filterChips.push({
      key: "untagged",
      label: "Untagged",
      clearHref: hrefFor({ untagged: "", page: 1 }),
    });
  }

  const clearAllHref = hrefFor({
    q: "",
    kind: "",
    location: "",
    collection: "",
    tag: "",
    under: "",
    missing: "",
    untagged: "",
    page: 1,
  });

  // Folder crumbs when under path set
  const underParts = under ? under.split("/").filter(Boolean) : [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="eyebrow">Holdings</p>
        <h1 className="page-title mt-1">
          {missingOnly
            ? "Weeding desk"
            : untaggedOnly
              ? "Untagged holdings"
              : "Catalog"}
        </h1>
        <p className="page-sub">
          <span className="tabular-nums font-medium text-[var(--ink-soft)]">
            {result.total.toLocaleString()}
          </span>{" "}
          {missingOnly
            ? `missing holding${result.total === 1 ? "" : "s"}`
            : untaggedOnly
              ? `untagged holding${result.total === 1 ? "" : "s"}`
              : `holding${result.total === 1 ? "" : "s"}`}
          {q ? ` matching “${q}”` : ""}
          {!missingOnly &&
          !untaggedOnly &&
          filterChips.length > 0 &&
          !q
            ? " with filters"
            : ""}
          {missingOnly
            ? " — select and remove from catalog (files already gone)"
            : ""}
          {untaggedOnly
            ? " — add tags from bulk Select or item detail"
            : ""}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <SearchForm defaultQuery={q} />
        </div>
        {result.total > 0 && !missingOnly ? (
          <Link
            href={graphHrefFromFilters({
              q: q || undefined,
              kind: kind || undefined,
              locationId:
                locationId === "" ? undefined : Number(locationId),
              tagId: tagId === "" ? undefined : Number(tagId),
              collectionId:
                collectionId === "" ? undefined : Number(collectionId),
            })}
            className="btn btn-secondary btn-sm shrink-0"
            title="Open the knowledge graph for the current filter set"
          >
            Map these
          </Link>
        ) : null}
      </div>

      <ActiveFilters chips={filterChips} clearAllHref={clearAllHref} />

      {underParts.length > 0 ? (
        <nav
          className="flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]"
          aria-label="Path within location"
        >
          <Link
            href={hrefFor({ under: "", page: 1 })}
            className="link-accent"
          >
            root
          </Link>
          {underParts.map((part, i) => {
            const path = underParts.slice(0, i + 1).join("/");
            const last = i === underParts.length - 1;
            return (
              <span key={path} className="inline-flex items-center gap-1">
                <span className="text-[var(--muted-faint)]">/</span>
                {last ? (
                  <span className="font-medium text-[var(--ink)]">{part}</span>
                ) : (
                  <Link
                    href={hrefFor({ under: path, page: 1 })}
                    className="link-accent"
                  >
                    {part}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <form method="get" className="toolstrip catalog-filters">
        {q ? <input type="hidden" name="q" value={q} /> : null}
        {missingOnly ? <input type="hidden" name="missing" value="1" /> : null}
        {untaggedOnly ? (
          <input type="hidden" name="untagged" value="1" />
        ) : null}
        {sp.view ? <input type="hidden" name="view" value={view} /> : null}
        <label className="min-w-0 sm:min-w-[7.5rem]">
          <span className="label-quiet">Format</span>
          <select name="kind" defaultValue={kind} className="field">
            <option value="">All kinds</option>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 sm:min-w-[7.5rem]">
          <span className="label-quiet">Location</span>
          <select
            name="location"
            defaultValue={locationId === "" ? "" : String(locationId)}
            className="field"
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 sm:min-w-[7.5rem]">
          <span className="label-quiet">Collection</span>
          <select
            name="collection"
            defaultValue={collectionId === "" ? "" : String(collectionId)}
            className="field"
          >
            <option value="">Any collection</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 sm:min-w-[7.5rem]">
          <span className="label-quiet">Tag</span>
          <select
            name="tag"
            defaultValue={tagId === "" ? "" : String(tagId)}
            className="field"
            title={
              tags.length > tagSelectOptions.length
                ? `Showing ${tagSelectOptions.length} popular tags (${tags.length} total). Use facet chips or expand below for more.`
                : undefined
            }
          >
            <option value="">Any tag</option>
            {tagSelectOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.itemCount != null ? ` (${t.itemCount})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 sm:min-w-[8rem]">
          <span className="label-quiet">Path under</span>
          <input
            name="under"
            defaultValue={under}
            placeholder="e.g. documents"
            className="field sm:w-36"
          />
        </label>
        <label className="min-w-0 sm:min-w-[7rem]">
          <span className="label-quiet">Sort</span>
          <select name="sort" defaultValue={sort} className="field">
            <option value="mtime">Modified</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="indexed">Indexed</option>
          </select>
        </label>
        <label className="min-w-0 sm:min-w-[5.5rem]">
          <span className="label-quiet">Dir</span>
          <select name="dir" defaultValue={sortDir} className="field">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
      </form>

      {(facets.kinds.length > 0 || facets.tags.length > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {facets.kinds.length > 0 ? (
            <div className="min-w-0">
              <p className="label-quiet">By format</p>
              <ul className="flex flex-wrap gap-1.5">
                {facets.kinds.map((f) => (
                  <li key={f.kind}>
                    <Link
                      href={hrefFor({
                        kind: kind === f.kind ? "" : f.kind,
                        page: 1,
                      })}
                      className={
                        kind === f.kind ? "chip chip-active" : "chip"
                      }
                    >
                      {f.kind}
                      <span className="tabular-nums text-[var(--muted-faint)]">
                        {f.c}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {facets.tags.length > 0 ? (
            <div className="min-w-0 max-w-full flex-1">
              <CollapsibleTagList
                label="By tag"
                tags={facets.tags.map((f) => ({
                  ...f,
                  href: hrefFor({
                    tag: tagId === f.id ? "" : String(f.id),
                    page: 1,
                  }),
                }))}
                activeId={tagId}
                initial={10}
              />
            </div>
          ) : null}
        </div>
      )}

      {result.items.length === 0 ? (
        <div className="empty-state">
          <strong>No holdings match</strong>
          {result.total === 0 && filterChips.length === 0 ? (
            <>
              Catalog is empty.{" "}
              <Link href="/services" className="link-accent">
                Run a reindex
              </Link>{" "}
              after configuring locations, or drop files into{" "}
              <code className="rounded bg-[var(--paper-deep)] px-1 text-xs">
                archive/
              </code>
              .
            </>
          ) : (
            <>
              Try a broader query, or{" "}
              <Link href={clearAllHref} className="link-accent">
                clear filters
              </Link>
              . Search also matches note bodies and PDF text.
            </>
          )}
        </div>
      ) : (
        <CatalogResults
          items={result.items}
          thumbIds={thumbIds}
          view={view}
          viewToggleHref={viewToggleHref}
          collections={collections.map((c) => ({ id: c.id, name: c.name }))}
          weedingMode={missingOnly}
          highlightTokens={q ? searchTokens(q) : []}
        />
      )}

      {totalPages > 1 ? (
        <nav
          className="flex items-center justify-between text-sm"
          aria-label="Pagination"
        >
          <span className="text-[var(--muted)] tabular-nums">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={hrefFor({ page: page - 1 })} className="btn btn-secondary btn-sm">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={hrefFor({ page: page + 1 })} className="btn btn-secondary btn-sm">
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
