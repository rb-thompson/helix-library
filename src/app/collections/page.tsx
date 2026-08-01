import Link from "next/link";
import { CreateCollectionForm } from "@/components/CreateCollectionForm";
import { listCollections, listTags } from "@/lib/collections/manage";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Collections",
};

export default function CollectionsPage() {
  ensureLocationsSynced();
  const collections = listCollections();
  const tags = listTags();

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <p className="eyebrow">Shelves</p>
        <h1 className="page-title mt-1">Collections</h1>
        <p className="page-sub max-w-xl">
          Manual shelves for curating holdings. Tags live on items and also
          filter the catalog.
        </p>
      </div>

      <CreateCollectionForm />

      {collections.length === 0 ? (
        <div className="empty-state">
          <strong>No collections yet</strong>
          Create one above, then add items from catalog detail or bulk Select.
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {collections.map((c) => (
            <li key={c.id}>
              <Link
                href={`/collections/${c.id}`}
                className="surface-flat group block p-4 transition hover:border-[rgb(15_92_86_/_0.28)] hover:shadow-[var(--shadow-lift)]"
              >
                <h2 className="font-semibold tracking-tight text-[var(--ink)] group-hover:text-[var(--accent)]">
                  {c.name}
                </h2>
                {c.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
                    {c.description}
                  </p>
                ) : null}
                <p className="mt-2 text-xs tabular-nums text-[var(--muted-faint)]">
                  {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Tags in use</h2>
        {tags.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No tags yet. Add them on an item, or bulk-select in the catalog.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <li key={t.id}>
                <Link href={`/catalog?tag=${t.id}`} className="chip">
                  #{t.name}
                  <span className="tabular-nums text-[var(--muted-faint)]">
                    {t.itemCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
