"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import type { KnowledgeGraph } from "@/lib/graph/build";
import {
  defaultGraphMode,
  writeGraphMode,
  type GraphMode,
} from "@/lib/client/graph-mode";
import { cn } from "@/lib/cn";

function GraphLoadingShell({ label }: { label: string }) {
  return (
    <div className="graph-shell flex min-h-[22rem] flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] text-sm text-[var(--muted)] shadow-[var(--shadow-soft)] sm:min-h-[28rem]">
      <HelixSpinner size="lg" label={label} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Client-only load of 2D or 3D force graph.
 * next/dynamic ssr:false avoids RSC/SSR evaluating three / window.
 */
const KnowledgeGraph3D = dynamic(
  () =>
    import("@/components/KnowledgeGraph").then((m) => m.KnowledgeGraphView),
  {
    ssr: false,
    loading: () => <GraphLoadingShell label="Loading 3D graph…" />,
  },
);

const KnowledgeGraph2D = dynamic(
  () =>
    import("@/components/KnowledgeGraph2D").then((m) => m.KnowledgeGraph2DView),
  {
    ssr: false,
    loading: () => <GraphLoadingShell label="Loading 2D graph…" />,
  },
);

export function KnowledgeGraphLoader({
  data,
  initialMode,
}: {
  data: KnowledgeGraph;
  /** Server-passed mode query override (optional). */
  initialMode?: GraphMode | null;
}) {
  const [mode, setMode] = useState<GraphMode | null>(
    initialMode === "2d" || initialMode === "3d" ? initialMode : null,
  );

  useEffect(() => {
    if (initialMode === "2d" || initialMode === "3d") {
      setMode(initialMode);
      writeGraphMode(initialMode);
      return;
    }
    setMode(defaultGraphMode());
  }, [initialMode]);

  function selectMode(next: GraphMode) {
    setMode(next);
    writeGraphMode(next);
  }

  return (
    <div className="space-y-2">
      <div
        className="segment shrink-0 w-fit"
        role="group"
        aria-label="Graph dimension"
      >
        <button
          type="button"
          className={cn(mode === "2d" && "is-active")}
          onClick={() => selectMode("2d")}
          title="Canvas 2D force layout — lighter on CPU/GPU"
        >
          2D
        </button>
        <button
          type="button"
          className={cn(mode === "3d" && "is-active")}
          onClick={() => selectMode("3d")}
          title="WebGL 3D force layout"
        >
          3D
        </button>
      </div>
      {mode == null ? (
        <GraphLoadingShell label="Choosing graph mode…" />
      ) : mode === "2d" ? (
        <KnowledgeGraph2D data={data} />
      ) : (
        <KnowledgeGraph3D data={data} />
      )}
    </div>
  );
}
