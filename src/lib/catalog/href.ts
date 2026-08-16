/**
 * Pure catalog URL builder. Encodes the live hrefFor default-omission table.
 * Leaf module — do not import collections/manage from here.
 */

export type CatalogHrefState = {
  q?: string;
  kind?: string;
  location?: string;
  collection?: string;
  tag?: string;
  under?: string;
  missing?: string;
  untagged?: string;
  sort?: string;
  dir?: string;
  view?: string;
  /** True when the URL already had `?view=grid` (user clicked Grid). */
  viewExplicit?: boolean;
  page?: string | number;
};

const KEYS = [
  "q",
  "kind",
  "location",
  "collection",
  "tag",
  "under",
  "missing",
  "untagged",
  "sort",
  "dir",
  "view",
  "page",
] as const;

function effectiveSort(sort: string | undefined): string {
  return sort && sort !== "mtime" ? sort : "mtime";
}

function defaultDir(sort: string): "asc" | "desc" {
  return sort === "name" ? "asc" : "desc";
}

export function catalogHref(state: CatalogHrefState): string {
  const params = new URLSearchParams();
  const sortKey = effectiveSort(state.sort);
  const dirDefault = defaultDir(sortKey);

  for (const key of KEYS) {
    const raw = state[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = String(raw);
    if (key === "page" && value === "1") continue;
    if (key === "sort" && value === "mtime") continue;
    if (key === "dir" && value === dirDefault) continue;
    if (key === "view" && value === "grid" && !state.viewExplicit) continue;
    params.set(key, value);
  }

  const qs = params.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

export function catalogHrefFromFormData(
  fd: FormData,
  extras?: Partial<CatalogHrefState>,
): string {
  const get = (k: string): string | undefined => {
    const v = fd.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const view = get("view");
  return catalogHref({
    q: get("q"),
    kind: get("kind"),
    location: get("location"),
    collection: get("collection"),
    tag: get("tag"),
    under: get("under"),
    missing: get("missing"),
    untagged: get("untagged"),
    sort: get("sort"),
    dir: get("dir"),
    view,
    viewExplicit: view === "grid",
    page: 1,
    ...extras,
  });
}

export function catalogHrefPageView(href: string): {
  page: number;
  view: "grid" | "list" | "";
} {
  let view: "grid" | "list" | "" = "";
  let page = 1;
  try {
    const u = new URL(href, "http://helix.local");
    const p = Number(u.searchParams.get("page") || "1");
    if (Number.isFinite(p) && p > 0) page = p;
    const v = u.searchParams.get("view");
    if (v === "list" || v === "grid") view = v;
  } catch {
    // ignore
  }
  return { page, view };
}
