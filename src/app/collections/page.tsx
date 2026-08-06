import Link from "next/link";
import { CollapsibleTagList } from "@/components/CollapsibleTagList";
import { CreateCollectionForm } from "@/components/CreateCollectionForm";
import { TagHygienePanel } from "@/components/TagHygienePanel";
import { listCollections, listTags } from "@/lib/collections/manage";
import { ensureLocationsSynced } from "@/lib/locations/manage";
import { filterVisibleTags } from "@/lib/tags/hidden";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Collections",
};

export default function CollectionsPage() {
  ensureLocationsSynced();
  const collections = listCollections();
  const tags = listTags({ sortBy: "count" });
  const facetTags = filterVisibleTags(tags);
  const shared = facetTags.filter((t) => Number(t.itemCount) >= 2);
  const singles = facetTags.length - shared.length;

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
        <ul className="grid auto-rows-fr gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {collections.map((c) => (
            <li key={c.id} className="min-h-0">
              <Link
                href={`/collections/${c.id}`}
                className="shelf-card group"
              >
                <h2 className="shelf-card__title">{c.name}</h2>
                <p className="shelf-card__desc">
                  {c.description?.trim() || "\u00a0"}
                </p>
                <p className="shelf-card__meta">
                  {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Tags in use</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Popular first
          {singles > 0
            ? ` · ${singles} single-use tag${singles === 1 ? "" : "s"} folded under “more”`
            : null}
          . Open expand + search to find a specific label.
        </p>
        <div className="mt-3">
          <CollapsibleTagList
            tags={facetTags.map((t) => ({
              ...t,
              href: `/catalog?tag=${t.id}`,
            }))}
            label="All tags"
            initial={14}
            empty="No tags yet. Add them on an item, or bulk-select in the catalog."
          />
        </div>
      </section>

      <TagHygienePanel tags={tags} />
    </div>
  );
}
