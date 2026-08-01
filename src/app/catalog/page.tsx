import Link from "next/link";
import { ActiveFilters, type FilterChip } from "@/components/ActiveFilters";
import { CatalogResults } from "@/components/CatalogResults";
import { SearchForm } from "@/components/SearchForm";
import {
  catalogFacets,
  listLocationsWithCounts,
  searchCatalog,
} from "@/lib/catalog/query";
import { listCollections, listTags } from "@/lib/collections/manage";
import { hasThumb } from "@/lib/indexer/enrich";
import { ensureLocationsSynced } from "@/lib/locations/manage";
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
  const view: "grid" | "list" =
    sp.view === "list"
      ? "list"
      : sp.view === "grid"
        ? "grid"
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
  };

  const result = searchCatalog(searchParamsObj);
  const facets = catalogFacets(searchParamsObj);
  const locations = listLocationsWithCounts();
  const collections = listCollections();
  const tags = listTags();
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

  const clearAllHref = hrefFor({
    q: "",
    kind: "",
    location: "",
    collection: "",
    tag: "",
    under: "",
    page: 1,
  });

  // Folder crumbs when under path set
  const underParts = under ? under.split("/").filter(Boolean) : [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="eyebrow">Holdings</p>
        <h1 className="page-title mt-1">Catalog</h1>
        <p className="page-sub">
          <span className="tabular-nums font-medium text-[var(--ink-soft)]">
            {result.total.toLocaleString()}
          </span>{" "}
          holding
          {result.total === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
          {filterChips.length > 0 && !q ? " with filters" : ""}
        </p>
      </div>

      <SearchForm defaultQuery={q} />

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
          >
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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
            <div className="min-w-0">
              <p className="label-quiet">By tag</p>
              <ul className="flex flex-wrap gap-1.5">
                {facets.tags.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={hrefFor({
                        tag: tagId === f.id ? "" : String(f.id),
                        page: 1,
                      })}
                      className={
                        tagId === f.id ? "chip chip-active" : "chip"
                      }
                    >
                      #{f.name}
                      <span className="tabular-nums text-[var(--muted-faint)]">
                        {f.c}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
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
