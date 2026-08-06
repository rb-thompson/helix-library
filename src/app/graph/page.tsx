import type { Metadata } from "next";
import Link from "next/link";
import { KnowledgeGraphLoader } from "@/components/KnowledgeGraphLoader";
import { buildKnowledgeGraph } from "@/lib/graph/build";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "3D force-directed map of Helix Library holdings, tags, shelves, and formats.",
};

type SearchParams = Promise<{ singletons?: string }>;

export default async function GraphPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  ensureLocationsSynced();
  const sp = await searchParams;
  const showSingletons =
    sp.singletons === "1" || sp.singletons === "true" || sp.singletons === "yes";
  const graph = buildKnowledgeGraph({
    minTagCount: showSingletons ? 1 : undefined,
    maxTags: showSingletons ? 80 : undefined,
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Personal knowledge graph</p>
          <h1 className="page-title mt-1">Knowledge Graph</h1>
          <p className="page-sub max-w-2xl">
            Holdings and concepts in one constellation — drag to orbit, pinch or
            scroll to zoom, tap a node to inspect. Singleton vision tags are
            hidden by default so shared themes stay readable; toggle layers as
            needed.
          </p>
        </div>
        <div className="segment shrink-0" role="group" aria-label="Tag density">
          <Link
            href="/graph"
            className={!showSingletons ? "is-active" : undefined}
            title="Tags used on at least two holdings"
          >
            Shared tags
          </Link>
          <Link
            href="/graph?singletons=1"
            className={showSingletons ? "is-active" : undefined}
            title="Include single-use tags (noisier)"
          >
            Singletons
          </Link>
        </div>
      </div>

      <KnowledgeGraphLoader data={graph} />

      <p className="text-xs text-[var(--muted-faint)]">
        Showing tags used on ≥{graph.meta.minTagCount} holdings (top{" "}
        {graph.meta.tagsShown}
        {graph.meta.tagsOmitted > 0
          ? `; ${graph.meta.tagsOmitted} low-use tags omitted`
          : ""}
        ). Meta tag <code className="text-[var(--muted)]">vision-tagged</code> is
        always omitted. Desktop: left-drag orbit · right-drag pan · scroll zoom.
        Mobile: one finger orbit · pinch zoom.
      </p>
    </div>
  );
}
