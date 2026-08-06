"use client";

import dynamic from "next/dynamic";
import type { KnowledgeGraph } from "@/lib/graph/build";

/**
 * Client-only load of the WebGL graph.
 * next/dynamic ssr:false avoids RSC/SSR evaluating three / window.
 */
const KnowledgeGraphView = dynamic(
  () =>
    import("@/components/KnowledgeGraph").then((m) => m.KnowledgeGraphView),
  {
    ssr: false,
    loading: () => (
      <div className="graph-shell flex min-h-[22rem] items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] text-sm text-[var(--muted)] sm:min-h-[28rem]">
        Loading graph…
      </div>
    ),
  },
);

export function KnowledgeGraphLoader({ data }: { data: KnowledgeGraph }) {
  return <KnowledgeGraphView data={data} />;
}
