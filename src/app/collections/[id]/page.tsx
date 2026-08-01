import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CatalogResults } from "@/components/CatalogResults";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { EditCollectionForm } from "@/components/EditCollectionForm";
import {
  getCollection,
  listCollectionItems,
} from "@/lib/collections/manage";
import { hasThumb } from "@/lib/indexer/enrich";

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
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const collection = getCollection(Number(id));
  if (!collection) notFound();

  const items = listCollectionItems(collection.id);
  const view: "grid" | "list" = sp.view === "list" ? "list" : "grid";
  const thumbIds = items.filter((i) => hasThumb(i.id)).map((i) => i.id);

  const base = `/collections/${collection.id}`;
  const viewToggleHref = {
    grid: base,
    list: `${base}?view=list`,
  };

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
          <p className="eyebrow">Shelf</p>
          <h1 className="page-title mt-1">{collection.name}</h1>
          {collection.description ? (
            <p className="page-sub max-w-2xl">{collection.description}</p>
          ) : (
            <p className="page-sub text-[var(--muted-faint)]">
              No description yet — use Edit to add one.
            </p>
          )}
          <p className="mt-1.5 text-sm tabular-nums text-[var(--muted)]">
            {items.length} holding{items.length === 1 ? "" : "s"}
          </p>
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

      {items.length === 0 ? (
        <div className="empty-state">
          <strong>Empty shelf</strong>
          Open the{" "}
          <Link href="/catalog" className="link-accent">
            catalog
          </Link>
          , use <strong>Select</strong>, or item Curation → Add to collection.
        </div>
      ) : (
        <CatalogResults
          items={items}
          thumbIds={thumbIds}
          view={view}
          viewToggleHref={viewToggleHref}
        />
      )}
    </div>
  );
}
