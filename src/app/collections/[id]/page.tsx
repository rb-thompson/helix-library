import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CatalogResults } from "@/components/CatalogResults";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { EditCollectionForm } from "@/components/EditCollectionForm";
import {
  getCollection,
  parseSmartQueryPublic,
  resolveCollectionItems,
  smartQueryToCatalogHref,
} from "@/lib/collections/manage";
import { hasThumb } from "@/lib/media/thumbs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const col = getCollection(Number(id));
  return { title: col?.name ?? "Collection" };
}

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const collection = getCollection(Number(id));
  if (!collection) notFound();

  const view: "grid" | "list" = sp.view === "list" ? "list" : "grid";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = view === "grid" ? 24 : 25;

  const resolved = resolveCollectionItems(collection.id, { page, pageSize });
  const items = resolved.items;
  const total = resolved.total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const thumbIds = items.filter((i) => hasThumb(i.id)).map((i) => i.id);

  const base = `/collections/${collection.id}`;
  const viewToggleHref = {
    grid: page > 1 ? `${base}?page=${page}` : base,
    list:
      page > 1
        ? `${base}?view=list&page=${page}`
        : `${base}?view=list`,
  };

  const smartQuery =
    collection.kind === "smart"
      ? parseSmartQueryPublic(collection.queryJson)
      : null;
  const catalogHref = smartQuery
    ? smartQueryToCatalogHref(smartQuery)
    : "/catalog";

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (view === "list") params.set("view", "list");
    if (p > 1) params.set("page", String(p));
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link
        href="/collections"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Collections
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">
            {collection.kind === "smart" ? "Smart shelf" : "Shelf"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="page-title">{collection.name}</h1>
            {collection.kind === "smart" ? (
              <span className="chip !py-0.5 text-[0.65rem] text-[var(--muted)]">
                Smart
              </span>
            ) : null}
          </div>
          {collection.description ? (
            <p className="page-sub max-w-2xl">{collection.description}</p>
          ) : (
            <p className="page-sub text-[var(--muted-faint)]">
              {collection.kind === "smart"
                ? "Live membership from catalog filters."
                : "No description yet — use Edit to add one."}
            </p>
          )}
          <p className="mt-1.5 text-sm tabular-nums text-[var(--muted)]">
            {total} holding{total === 1 ? "" : "s"}
            {collection.kind === "smart" ? " · live" : ""}
          </p>
          {collection.kind === "smart" ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              <Link href={catalogHref} className="link-accent">
                Open matching catalog view
              </Link>
              {" · "}
              cannot hand-add items (edit filters instead)
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <EditCollectionForm
            id={collection.id}
            name={collection.name}
            description={collection.description}
          />
          <DeleteCollectionButton id={collection.id} name={collection.name} />
        </div>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          <strong>
            {collection.kind === "smart" ? "No matches" : "Empty shelf"}
          </strong>
          {collection.kind === "smart" ? (
            <>
              Nothing matches this smart shelf’s filters right now.{" "}
              <Link href={catalogHref} className="link-accent">
                Adjust filters in the catalog
              </Link>{" "}
              or edit the shelf query later.
            </>
          ) : (
            <>
              Open the{" "}
              <Link href="/catalog" className="link-accent">
                catalog
              </Link>
              , use <strong>Select</strong>, or item Curation → Add to
              collection.
            </>
          )}
        </div>
      ) : (
        <>
          <CatalogResults
            items={items}
            thumbIds={thumbIds}
            view={view}
            viewToggleHref={viewToggleHref}
          />
          {totalPages > 1 ? (
            <nav
              className="flex items-center justify-between text-sm"
              aria-label="Pagination"
            >
              <span className="tabular-nums text-[var(--muted)]">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="btn btn-secondary btn-sm"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="btn btn-secondary btn-sm"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
