import Link from "next/link";
import { FolderOpen, Library, Tags } from "lucide-react";
import { KindBadge } from "@/components/KindBadge";
import type { RelatedGroup } from "@/lib/catalog/related";

const ICONS = {
  same_directory: FolderOpen,
  shared_tags: Tags,
  shared_collections: Library,
} as const;

/**
 * Structural related holdings (RSC). Empty when no neighbors.
 */
export function RelatedHoldingsPanel({
  groups,
  bare = false,
}: {
  groups: RelatedGroup[];
  /** Skip surface chrome (Deep Lens terminal already frames the pane). */
  bare?: boolean;
}) {
  if (!groups.length) return null;

  return (
    <section
      className={bare ? "" : "surface p-4 sm:p-5"}
      aria-label="Related holdings"
    >
      {bare ? null : (
        <>
          <h2 className="label-quiet !mb-0">Related holdings</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Same folder, shared tags, or co-shelved — structural only, not
            “similar content.”
          </p>
        </>
      )}

      <div className="mt-4 space-y-5">
        {groups.map((g) => {
          const Icon = ICONS[g.reason];
          return (
            <div key={g.reason}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  <Icon
                    className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                    aria-hidden
                  />
                  {g.label}
                </p>
                {g.href ? (
                  <Link
                    href={g.href}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    Browse all
                  </Link>
                ) : null}
              </div>
              <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/catalog/${item.id}`}
                      className="flex items-center gap-2 px-3 py-2.5 text-[var(--ink-soft)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {item.label}
                      </span>
                      <KindBadge kind={item.kind} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
