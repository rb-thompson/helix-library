import type { Metadata } from "next";
import { KnowledgeGraphView } from "@/components/KnowledgeGraph";
import { buildKnowledgeGraph } from "@/lib/graph/build";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "3D force-directed map of Helix Library holdings, tags, shelves, and formats.",
};

export default function GraphPage() {
  ensureLocationsSynced();
  const graph = buildKnowledgeGraph();

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Personal knowledge graph</p>
          <h1 className="page-title mt-1">Knowledge Graph</h1>
          <p className="page-sub max-w-2xl">
            Holdings and concepts in one constellation — drag to orbit, pinch or
            scroll to zoom, tap a node to inspect. Singleton vision tags are
            hidden so shared themes stay readable; toggle layers as needed.
          </p>
        </div>
      </div>

      <KnowledgeGraphView data={graph} />

      <p className="text-xs text-[var(--muted-faint)]">
        Default graph shows tags used on ≥{graph.meta.minTagCount} holdings
        (top {graph.meta.tagsShown}
        {graph.meta.tagsOmitted > 0
          ? `; ${graph.meta.tagsOmitted} low-use tags omitted`
          : ""}
        ). Desktop: left-drag orbit · right-drag pan · scroll zoom. Mobile: one
        finger orbit · pinch zoom.
      </p>
    </div>
  );
}
