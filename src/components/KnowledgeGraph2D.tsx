"use client";

/**
 * 2D force-graph renderer (lighter than WebGL 3D).
 * Mount order: graphData before engine-affecting props (same gotcha as 3D).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Focus, Maximize2, Minimize2, RotateCcw, Search, X } from "lucide-react";
import type { GraphLink, GraphNode, KnowledgeGraph } from "@/lib/graph/build";
import {
  graphBackground,
  graphDimNode,
  graphFocusColor,
  graphLinkColor,
  legendSamples,
  nodeColorForTheme,
  type GraphTheme,
} from "@/lib/graph/colors";
import { formatBytes, kindLabel } from "@/lib/format";
import { cn } from "@/lib/cn";

type FGNode = GraphNode & { x?: number; y?: number };
type FGLink = {
  source: string | FGNode;
  target: string | FGNode;
  relation: GraphLink["relation"];
};

type ForceGraph2DInstance = {
  graphData: (data?: { nodes: FGNode[]; links: FGLink[] }) => unknown;
  backgroundColor: (c: string) => ForceGraph2DInstance;
  width: (n: number) => ForceGraph2DInstance;
  height: (n: number) => ForceGraph2DInstance;
  nodeRelSize: (n: number) => ForceGraph2DInstance;
  nodeVal: (fn: string | ((n: FGNode) => number)) => ForceGraph2DInstance;
  nodeColor: (fn: string | ((n: FGNode) => string)) => ForceGraph2DInstance;
  nodeLabel: (fn: string | ((n: FGNode) => string)) => ForceGraph2DInstance;
  nodeCanvasObject?: (
    fn: (
      node: FGNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => void,
  ) => ForceGraph2DInstance;
  nodePointerAreaPaint?: (
    fn: (
      node: FGNode,
      color: string,
      ctx: CanvasRenderingContext2D,
    ) => void,
  ) => ForceGraph2DInstance;
  linkColor: (fn: string | ((l: FGLink) => string)) => ForceGraph2DInstance;
  linkWidth: (fn: number | ((l: FGLink) => number)) => ForceGraph2DInstance;
  linkDirectionalParticles: (n: number) => ForceGraph2DInstance;
  d3Force?: (name: string, force: unknown) => ForceGraph2DInstance;
  d3ReheatSimulation?: () => ForceGraph2DInstance;
  zoomToFit: (ms?: number, padding?: number) => ForceGraph2DInstance;
  centerAt: (x?: number, y?: number, ms?: number) => ForceGraph2DInstance;
  zoom: (k?: number, ms?: number) => number | ForceGraph2DInstance;
  onNodeClick: (
    fn: (n: FGNode, event?: MouseEvent) => void,
  ) => ForceGraph2DInstance;
  onBackgroundClick: (fn: (event?: MouseEvent) => void) => ForceGraph2DInstance;
  cooldownTicks?: (n: number) => ForceGraph2DInstance;
  enableNodeDrag?: (v: boolean) => ForceGraph2DInstance;
  _destructor?: () => void;
};

type LayerKey = "tag" | "collection" | "kind" | "location";

function resolveDefaultExport(mod: unknown): unknown {
  if (mod == null || typeof mod !== "object") return mod;
  const m = mod as { default?: unknown };
  if (m.default != null && typeof m.default === "object") {
    const inner = m.default as { default?: unknown };
    if (typeof inner.default === "function") return inner.default;
  }
  if (typeof m.default === "function") return m.default;
  return mod;
}

function typeLabel(t: GraphNode["type"]): string {
  switch (t) {
    case "item":
      return "Holding";
    case "tag":
      return "Tag";
    case "collection":
      return "Shelf";
    case "kind":
      return "Format";
    case "location":
      return "Location";
    default:
      return t;
  }
}

export function KnowledgeGraph2DView({ data }: { data: KnowledgeGraph }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraph2DInstance | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FGNode | null>(null);
  const [themeDark, setThemeDark] = useState(true);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    tag: true,
    collection: true,
    kind: true,
    location: false,
  });

  const theme: GraphTheme = themeDark ? "dark" : "light";

  const viewData = useMemo(() => {
    const allowType = (t: GraphNode["type"]) => {
      if (t === "item") return true;
      if (t === "tag") return layers.tag;
      if (t === "collection") return layers.collection;
      if (t === "kind") return layers.kind;
      if (t === "location") return layers.location;
      return true;
    };
    const nodes = data.nodes.filter((n) => allowType(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    const links = data.links.filter(
      (l) => ids.has(l.source) && ids.has(l.target),
    );
    return { nodes, links };
  }, [data, layers]);

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    const hits = new Set<string>();
    for (const n of viewData.nodes) {
      if (
        n.label.toLowerCase().includes(q) ||
        n.path?.toLowerCase().includes(q) ||
        n.kind?.toLowerCase().includes(q)
      ) {
        hits.add(n.id);
      }
    }
    return hits;
  }, [viewData.nodes, query]);

  const highlightRef = useRef({
    nodes: new Set<string>(),
    focus: null as string | null,
  });

  useEffect(() => {
    const nodes = new Set<string>();
    if (searchHits.size > 0) {
      for (const id of searchHits) nodes.add(id);
    } else if (selected) {
      nodes.add(selected.id);
    }
    highlightRef.current = { nodes, focus: selected?.id ?? null };
    try {
      graphRef.current?.graphData?.();
      // force repaint via zoom noop
      const g = graphRef.current;
      if (g && readyRef.current) {
        const z = g.zoom() as number;
        g.zoom(z);
      }
    } catch {
      // ignore
    }
  }, [selected, searchHits]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setThemeDark(root.dataset.theme !== "light");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let graph: ForceGraph2DInstance | null = null;
    const el = containerRef.current;

    async function mount() {
      if (!el) return;
      setLoadError(null);
      try {
        const fgMod = await import("force-graph");
        const ForceGraph = resolveDefaultExport(fgMod) as new (
          el: HTMLElement,
        ) => ForceGraph2DInstance;
        if (disposed || !el.isConnected) return;
        if (typeof ForceGraph !== "function") {
          throw new Error("force-graph did not export a constructor");
        }

        const graphTheme: GraphTheme = themeDark ? "dark" : "light";
        const bg = graphBackground(graphTheme);
        const w = el.clientWidth || 800;
        const h = el.clientHeight || 480;

        graph = new ForceGraph(el);
        graphRef.current = graph;
        const g = graph;

        const nodes = viewData.nodes.map((n) => ({
          ...n,
          color: nodeColorForTheme(graphTheme, n.type, n.kind),
        }));
        const links = viewData.links.map((l) => ({ ...l }));

        // Data first
        g.graphData({ nodes, links });
        g.backgroundColor(bg);
        g.width(w);
        g.height(h);
        g.nodeRelSize(5);
        g.nodeVal("val");
        g.enableNodeDrag?.(true);
        g.cooldownTicks?.(120);
        g.linkDirectionalParticles(0);

        g.nodeColor((n: FGNode) => {
          const hl = highlightRef.current;
          const col = nodeColorForTheme(graphTheme, n.type, n.kind);
          if (hl.nodes.size === 0) return col;
          if (hl.focus === n.id) return graphFocusColor(graphTheme);
          if (hl.nodes.has(n.id)) return col;
          return graphDimNode(graphTheme);
        });

        g.nodeLabel(
          (n: FGNode) =>
            `${n.label}\n${typeLabel(n.type)}${n.kind ? ` · ${n.kind}` : ""}`,
        );

        g.nodeCanvasObject?.((node, ctx, globalScale) => {
          const n = node as FGNode;
          const r = Math.sqrt(Math.max(1, n.val || 1)) * 2.2;
          const col = nodeColorForTheme(graphTheme, n.type, n.kind);
          const hl = highlightRef.current;
          const active = hl.nodes.size > 0;
          const dim =
            active && !hl.nodes.has(n.id) && hl.focus !== n.id;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
          ctx.fillStyle = dim ? graphDimNode(graphTheme) : col;
          ctx.globalAlpha = dim ? 0.35 : 0.95;
          ctx.fill();
          ctx.globalAlpha = 1;
          // Labels for concepts at moderate zoom
          if (
            n.type !== "item" &&
            globalScale > 0.85 &&
            (!active || hl.nodes.has(n.id))
          ) {
            const fontSize = 11 / globalScale;
            ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = graphTheme === "dark" ? "#c8cdd6" : "#3a4050";
            ctx.fillText(n.label.slice(0, 28), n.x ?? 0, (n.y ?? 0) + r + 2);
          }
        });

        g.nodePointerAreaPaint?.((node, color, ctx) => {
          const n = node as FGNode;
          const r = Math.sqrt(Math.max(1, n.val || 1)) * 2.8;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        });

        g.linkColor((l: FGLink) =>
          graphLinkColor(graphTheme, l.relation, false, false),
        );
        g.linkWidth(1);

        g.onNodeClick((n: FGNode) => {
          setSelected(n);
        });
        g.onBackgroundClick(() => {
          setSelected(null);
        });

        readyRef.current = true;
        setReady(true);
        requestAnimationFrame(() => {
          try {
            g.zoomToFit(400, 40);
          } catch {
            // ignore
          }
        });

        ro = new ResizeObserver(() => {
          if (!el.isConnected || !graphRef.current) return;
          graphRef.current.width(el.clientWidth || 800);
          graphRef.current.height(el.clientHeight || 480);
        });
        ro.observe(el);
      } catch (err) {
        if (!disposed) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void mount();

    return () => {
      disposed = true;
      readyRef.current = false;
      setReady(false);
      ro?.disconnect();
      try {
        graph?._destructor?.();
      } catch {
        // ignore
      }
      graphRef.current = null;
      if (el) el.replaceChildren();
    };
    // Remount on theme/data structure change
  }, [themeDark, viewData.nodes, viewData.links]);

  const resetView = useCallback(() => {
    try {
      graphRef.current?.zoomToFit(400, 40);
    } catch {
      // ignore
    }
  }, []);

  const empty = viewData.nodes.length === 0;

  return (
    <div
      className={cn(
        "graph-shell relative flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-soft)]",
        fullscreen
          ? "graph-shell-fs"
          : "min-h-[22rem] rounded-[var(--radius)] sm:min-h-[28rem]",
      )}
    >
      <div className="relative z-10 space-y-2 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3 py-2.5 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-faint)]"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Highlight…"
              className="field !py-1.5 !pl-8 !text-sm"
              aria-label="Search graph"
            />
          </div>
          <span className="chip !py-0.5 text-[0.65rem]">2D</span>
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span className="tabular-nums">
              {data.meta.truncated
                ? `${data.meta.itemCount} of ${data.meta.totalItems}`
                : data.meta.itemCount}{" "}
              holdings
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              title="Fit view"
              onClick={resetView}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Graph layers">
          {(
            [
              ["tag", "Tags"],
              ["collection", "Shelves"],
              ["kind", "Formats"],
              ["location", "Locations"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition",
                layers[key]
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "bg-[var(--paper-deep)] text-[var(--muted)]",
              )}
              aria-pressed={layers[key]}
              onClick={() =>
                setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1",
          !fullscreen && "min-h-[360px] sm:min-h-[480px]",
        )}
      >
        {empty ? (
          <div className="empty-state m-6">
            <strong>Nothing to map with these layers</strong>
          </div>
        ) : loadError ? (
          <div className="empty-state m-6">
            <strong>2D graph failed</strong>
            <p className="mt-2 text-xs text-[var(--muted)]">{loadError}</p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="absolute inset-0 h-full w-full touch-none"
          />
        )}
        {!ready && !empty && !loadError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
            Laying out 2D…
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden flex-wrap gap-1.5 lg:flex">
          {legendSamples(theme).map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-2 py-0.5 text-[0.65rem] text-[var(--muted)]"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>

        {selected ? (
          <aside className="absolute inset-x-3 bottom-3 z-10 max-h-[45%] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-3 shadow-[var(--shadow-lift)] backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[min(100%-1.5rem,20rem)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                  {typeLabel(selected.type)}
                </p>
                <p className="mt-0.5 truncate font-semibold text-[var(--ink)]">
                  {selected.label}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon !h-8 !w-8"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <dl className="mt-2 space-y-1 text-xs text-[var(--muted)]">
              {selected.kind && selected.type === "item" ? (
                <div className="flex justify-between gap-2">
                  <dt>Format</dt>
                  <dd className="text-[var(--ink-soft)]">
                    {kindLabel(selected.kind)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt>Connections</dt>
                <dd className="text-[var(--ink-soft)]">{selected.degree}</dd>
              </div>
              {selected.sizeBytes != null ? (
                <div className="flex justify-between gap-2">
                  <dt>Size</dt>
                  <dd className="text-[var(--ink-soft)]">
                    {formatBytes(selected.sizeBytes)}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const g = graphRef.current;
                  if (!g || selected.x == null) return;
                  try {
                    g.centerAt(selected.x, selected.y, 400);
                    g.zoom(3, 400);
                  } catch {
                    // ignore
                  }
                }}
              >
                <Focus className="h-3.5 w-3.5" aria-hidden />
                Focus
              </button>
              {selected.href ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => router.push(selected.href!)}
                >
                  Open
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
