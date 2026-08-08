"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Focus,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type {
  GraphLink,
  GraphNode,
  KnowledgeGraph,
} from "@/lib/graph/build";
import {
  graphBackground,
  graphDimNode,
  graphFocusColor,
  graphLabelBg,
  graphLabelFg,
  graphLinkColor,
  graphParticleColor,
  legendSamples,
  nodeColorForTheme,
  type GraphTheme,
} from "@/lib/graph/colors";
import { formatBytes, kindLabel } from "@/lib/format";
import { cn } from "@/lib/cn";

type LabelMode = "focus" | "concepts" | "off";

type ViewControls = {
  /** Charge magnitude (higher = more spread). */
  spread: number;
  /** Ideal link distance. */
  linkDist: number;
  /** Multiplier on node radius. */
  nodeScale: number;
  labels: LabelMode;
  particles: boolean;
};

const DEFAULT_CONTROLS: ViewControls = {
  spread: 110,
  linkDist: 42,
  nodeScale: 1,
  labels: "concepts",
  particles: true,
};

type FGNode = GraphNode & {
  x?: number;
  y?: number;
  z?: number;
  __threeObj?: unknown;
};

type FGLink = {
  source: string | FGNode;
  target: string | FGNode;
  relation: GraphLink["relation"];
};

type ForceGraphInstance = {
  graphData: (data?: { nodes: FGNode[]; links: FGLink[] }) => unknown;
  backgroundColor: (c: string) => ForceGraphInstance;
  showNavInfo: (v: boolean) => ForceGraphInstance;
  nodeRelSize: (n: number) => ForceGraphInstance;
  nodeVal: (fn: string | ((n: FGNode) => number)) => ForceGraphInstance;
  nodeColor: (fn: string | ((n: FGNode) => string)) => ForceGraphInstance;
  nodeOpacity: (n: number) => ForceGraphInstance;
  nodeResolution: (n: number) => ForceGraphInstance;
  nodeThreeObject?: (fn: ((n: FGNode) => unknown) | null) => ForceGraphInstance;
  nodeThreeObjectExtend?: (v: boolean) => ForceGraphInstance;
  nodeLabel: (fn: string | ((n: FGNode) => string)) => ForceGraphInstance;
  linkColor: (fn: string | ((l: FGLink) => string)) => ForceGraphInstance;
  linkWidth: (fn: number | ((l: FGLink) => number)) => ForceGraphInstance;
  linkOpacity: (n: number) => ForceGraphInstance;
  linkDirectionalParticles: (
    fn: number | ((l: FGLink) => number),
  ) => ForceGraphInstance;
  linkDirectionalParticleWidth: (n: number) => ForceGraphInstance;
  linkDirectionalParticleSpeed: (n: number) => ForceGraphInstance;
  linkDirectionalParticleColor: (
    fn: string | ((l: FGLink) => string),
  ) => ForceGraphInstance;
  onNodeHover: (fn: (n: FGNode | null) => void) => ForceGraphInstance;
  onNodeClick: (fn: (n: FGNode) => void) => ForceGraphInstance;
  onBackgroundClick: (fn: () => void) => ForceGraphInstance;
  cooldownTicks: (n: number) => ForceGraphInstance;
  d3AlphaDecay: (n: number) => ForceGraphInstance;
  d3VelocityDecay: (n: number) => ForceGraphInstance;
  warmupTicks: (n: number) => ForceGraphInstance;
  cameraPosition: (
    pos?: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number,
  ) => ForceGraphInstance;
  zoomToFit: (ms?: number, padding?: number) => ForceGraphInstance;
  width: (n: number) => ForceGraphInstance;
  height: (n: number) => ForceGraphInstance;
  refresh: () => ForceGraphInstance;
  d3Force: (name: string, force?: unknown) => unknown;
  d3ReheatSimulation?: () => ForceGraphInstance;
  pauseAnimation?: () => ForceGraphInstance;
  resumeAnimation?: () => ForceGraphInstance;
  scene?: () => import("three").Scene;
  _destructor?: () => void;
};

function linkEnds(link: FGLink): { s: string; t: string } {
  const s =
    typeof link.source === "object" ? link.source.id : String(link.source);
  const t =
    typeof link.target === "object" ? link.target.id : String(link.target);
  return { s, t };
}

function typeLabel(t: GraphNode["type"]): string {
  switch (t) {
    case "item":
      return "Holding";
    case "tag":
      return "Tag";
    case "collection":
      return "Collection";
    case "kind":
      return "Format";
    case "location":
      return "Location";
    default:
      return t;
  }
}

type LayerKey = "tag" | "collection" | "kind" | "location";

export function KnowledgeGraphView({ data }: { data: KnowledgeGraph }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphInstance | null>(null);
  const highlightRef = useRef<{
    nodes: Set<string>;
    links: Set<string>;
    focus: string | null;
  }>({ nodes: new Set(), links: new Set(), focus: null });

  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [themeDark, setThemeDark] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [controls, setControls] = useState<ViewControls>(DEFAULT_CONTROLS);
  const controlsRef = useRef<ViewControls>(DEFAULT_CONTROLS);
  /** Default: tags on (already thinned server-side), formats on, locations off on mobile. */
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    tag: true,
    collection: true,
    kind: true,
    location: true,
  });

  const theme: GraphTheme = themeDark ? "dark" : "light";

  function patchControls(patch: Partial<ViewControls>) {
    setControls((prev) => {
      const next = { ...prev, ...patch };
      controlsRef.current = next;
      return next;
    });
  }

  /**
   * Tune d3 forces. Never call before graphData — three-forcegraph sets
   * engineRunning=true on any prop update, and tickFrame crashes if
   * state.layout is still undefined ("can't access property tick").
   */
  function applyPhysics(
    g: ForceGraphInstance,
    c: ViewControls,
    mobile: boolean,
    opts?: { reheat?: boolean },
  ) {
    try {
      const charge = g.d3Force("charge") as {
        strength?: (n: number) => unknown;
      } | null;
      if (charge && typeof charge.strength === "function") {
        charge.strength(-c.spread);
      }
      const link = g.d3Force("link") as {
        distance?: (n: number) => unknown;
      } | null;
      if (link && typeof link.distance === "function") {
        link.distance(c.linkDist);
      }
      g.nodeRelSize((mobile ? 5.0 : 4.0) * c.nodeScale);
      if (opts?.reheat) {
        g.d3ReheatSimulation?.();
      }
    } catch {
      // force access optional across versions
    }
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (mobile) {
        setLayers((prev) => ({ ...prev, location: false, kind: true }));
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
    return { nodes, links, meta: data.meta };
  }, [data, layers]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of viewData.nodes) map.set(n.id, new Set());
    for (const l of viewData.links) {
      map.get(l.source)?.add(l.target);
      map.get(l.target)?.add(l.source);
    }
    return map;
  }, [viewData]);

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    const hits = new Set<string>();
    for (const n of viewData.nodes) {
      if (
        n.label.toLowerCase().includes(q) ||
        n.path?.toLowerCase().includes(q) ||
        n.kind?.toLowerCase().includes(q) ||
        n.type.includes(q)
      ) {
        hits.add(n.id);
      }
    }
    return hits;
  }, [viewData.nodes, query]);

  const applyHighlight = useCallback(
    (focusId: string | null, searchSet: Set<string>) => {
      const nodes = new Set<string>();
      const links = new Set<string>();

      if (searchSet.size > 0) {
        for (const id of searchSet) {
          nodes.add(id);
          for (const nb of adjacency.get(id) ?? []) nodes.add(nb);
        }
        for (const l of viewData.links) {
          if (nodes.has(l.source) && nodes.has(l.target)) {
            links.add(`${l.source}|${l.target}`);
          }
        }
      } else if (focusId) {
        nodes.add(focusId);
        for (const nb of adjacency.get(focusId) ?? []) nodes.add(nb);
        for (const l of viewData.links) {
          const key = `${l.source}|${l.target}`;
          if (
            (l.source === focusId || l.target === focusId) &&
            nodes.has(l.source) &&
            nodes.has(l.target)
          ) {
            links.add(key);
          }
        }
      }

      highlightRef.current = { nodes, links, focus: focusId };
      // Only refresh after graphData has created state.layout
      if (readyRef.current) {
        try {
          graphRef.current?.refresh();
        } catch {
          // ignore mid-teardown
        }
      }
    },
    [adjacency, viewData.links],
  );

  useEffect(() => {
    applyHighlight(selected?.id ?? hoverId, searchHits);
  }, [selected, hoverId, searchHits, applyHighlight]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () =>
      setThemeDark(root.dataset.theme !== "light");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // Mount ForceGraph3D
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let graph: ForceGraphInstance | null = null;
    const el = containerRef.current;

    async function mount() {
      if (!el) return;
      setLoadError(null);

      try {
      const fgMod = await import("3d-force-graph");
      const ForceGraph3D = resolveDefaultExport(fgMod) as new (
        el: HTMLElement,
      ) => ForceGraphInstance;
      const THREE = await import("three");
      type SpriteTextInstance = import("three").Object3D & {
        color: string;
        textHeight: number;
        backgroundColor: string;
        padding: number;
        borderRadius: number;
      };
      const stMod = await import("three-spritetext");
      const SpriteText = resolveDefaultExport(stMod) as new (
        text?: string,
      ) => SpriteTextInstance;

      if (disposed || !el.isConnected) return;

      const graphTheme: GraphTheme = themeDark ? "dark" : "light";
      const bg = graphBackground(graphTheme);
      const w = el.clientWidth || 800;
      const h = el.clientHeight || 560;
      const ctrl = controlsRef.current;

      if (typeof ForceGraph3D !== "function") {
        throw new Error(
          "3d-force-graph did not export a constructor (Next ESM interop).",
        );
      }

      graph = new ForceGraph3D(el);
      graphRef.current = graph;

      const g = graph;
      // Pause until graphData binds a layout — any pre-data prop update sets
      // engineRunning=true and the next frame crashes: layout.tick on undefined.
      g.pauseAnimation?.();
      g.showNavInfo(false);
      g.backgroundColor(bg);
      g.width(w);
      g.height(h);
      const mobile = window.matchMedia("(max-width: 639px)").matches;

      // Bind data FIRST so state.layout exists before other updates resume the engine.
      const nodes = viewData.nodes.map((n) => ({
        ...n,
        color: nodeColorForTheme(graphTheme, n.type, n.kind),
      }));
      const links = viewData.links.map((l) => ({ ...l }));
      g.graphData({ nodes, links });
      applyPhysics(g, ctrl, mobile, { reheat: false });

      g.nodeVal("val");
      g.nodeOpacity(0.96);
      g.nodeResolution(mobile ? 12 : 16);
      g.nodeRelSize((mobile ? 5.0 : 4.0) * ctrl.nodeScale);
      g.nodeColor((n: FGNode) => {
        const hl = highlightRef.current;
        const active = hl.nodes.size > 0;
        const col = nodeColorForTheme(graphTheme, n.type, n.kind);
        if (!active) return col;
        if (hl.focus === n.id) return graphFocusColor(graphTheme);
        if (hl.nodes.has(n.id)) return col;
        return graphDimNode(graphTheme);
      });
      g.nodeLabel((n: FGNode) => {
        const bits = [
          `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:2px 0">`,
          `<strong>${escapeHtml(n.label)}</strong>`,
          `<div style="opacity:.75;font-size:11px">${typeLabel(n.type)}`,
          n.kind && n.type === "item"
            ? ` · ${escapeHtml(kindLabel(n.kind))}`
            : "",
          ` · ${n.degree} link${n.degree === 1 ? "" : "s"}</div>`,
          `</div>`,
        ];
        return bits.join("");
      });
      if (g.nodeThreeObject) {
        g.nodeThreeObject((n: FGNode) => {
          const group = new THREE.Group();
          const hl = highlightRef.current;
          const isFocus = hl.focus === n.id;
          const inHl = hl.nodes.size === 0 || hl.nodes.has(n.id);
          const scale = controlsRef.current.nodeScale;
          const r = Math.cbrt(n.val) * 3.0 * scale;
          const col = nodeColorForTheme(graphTheme, n.type, n.kind);

          const geo = new THREE.SphereGeometry(r, 16, 16);
          // Light: matte phosphor ink. Dark: mild CRT emissive.
          const emit = graphTheme === "dark"
            ? isFocus
              ? 0.7
              : inHl
                ? 0.28
                : 0.04
            : isFocus
              ? 0.12
              : inHl
                ? 0.05
                : 0.02;
          const mat = new THREE.MeshLambertMaterial({
            color: col,
            transparent: true,
            opacity: inHl ? (isFocus ? 1 : 0.94) : 0.14,
            emissive: new THREE.Color(col),
            emissiveIntensity: emit,
          });
          group.add(new THREE.Mesh(geo, mat));

          if (isFocus || (n.type !== "item" && graphTheme === "dark")) {
            const glowGeo = new THREE.SphereGeometry(r * 1.5, 12, 12);
            const glowMat = new THREE.MeshBasicMaterial({
              color: col,
              transparent: true,
              opacity: isFocus
                ? graphTheme === "dark"
                  ? 0.2
                  : 0.1
                : 0.08,
              depthWrite: false,
            });
            group.add(new THREE.Mesh(glowGeo, glowMat));
          }

          const labelMode = controlsRef.current.labels;
          const showLabel =
            labelMode !== "off" &&
            (isFocus ||
              (labelMode === "concepts" && n.type !== "item") ||
              (labelMode === "focus" &&
                hl.nodes.has(n.id) &&
                n.type !== "item"));

          if (showLabel) {
            const sprite = new SpriteText(n.label);
            sprite.color = graphLabelFg(graphTheme);
            sprite.textHeight = isFocus ? 3.0 : 2.2;
            sprite.backgroundColor = graphLabelBg(graphTheme);
            sprite.padding = 1.2;
            sprite.borderRadius = 1;
            sprite.position.y = r * 2.05;
            group.add(sprite);
          }

          return group;
        });
      }
      g.nodeThreeObjectExtend?.(false);
      g.linkColor((l: FGLink) => {
        const { s, t } = linkEnds(l);
        const key = `${s}|${t}`;
        const key2 = `${t}|${s}`;
        const hl = highlightRef.current;
        const active = hl.nodes.size > 0;
        const lit = hl.links.has(key) || hl.links.has(key2);
        return graphLinkColor(graphTheme, l.relation, lit, active && !lit);
      });
      g.linkWidth((l: FGLink) => {
        const { s, t } = linkEnds(l);
        const key = `${s}|${t}`;
        const hl = highlightRef.current;
        if (hl.links.has(key) || hl.links.has(`${t}|${s}`)) return 1.55;
        return graphTheme === "dark" ? 0.5 : 0.55;
      });
      g.linkOpacity(graphTheme === "dark" ? 0.88 : 0.9);
      g.linkDirectionalParticles((l: FGLink) => {
        if (!controlsRef.current.particles) return 0;
        const { s, t } = linkEnds(l);
        const key = `${s}|${t}`;
        const hl = highlightRef.current;
        if (mobile) {
          if (hl.links.has(key) || hl.links.has(`${t}|${s}`)) return 2;
          return 0;
        }
        if (hl.links.has(key) || hl.links.has(`${t}|${s}`)) return 4;
        if (hl.nodes.size > 0) return 0;
        if (l.relation === "tagged" || l.relation === "shelved") return 1;
        return 0;
      });
      g.linkDirectionalParticleWidth(1.3);
      g.linkDirectionalParticleSpeed(0.0055);
      g.linkDirectionalParticleColor((l: FGLink) =>
        graphParticleColor(graphTheme, l.relation),
      );
      g.cooldownTicks(120);
      g.d3AlphaDecay(0.028);
      g.d3VelocityDecay(0.32);
      g.warmupTicks(20);
      g.onNodeHover((n: FGNode | null) => {
        setHoverId(n?.id ?? null);
        if (el) el.style.cursor = n ? "pointer" : "grab";
      });
      g.onNodeClick((n: FGNode) => {
        setSelected(n);
      });
      g.onBackgroundClick(() => {
        setSelected(null);
      });

      // Lighting: cool terminal fill on dark; flat paper light on light theme
      try {
        const scene = g.scene?.();
        if (scene) {
          if (graphTheme === "dark") {
            scene.add(new THREE.AmbientLight(0xb8c0d0, 0.48));
            const dir = new THREE.DirectionalLight(0xd0d8e8, 0.55);
            dir.position.set(40, 80, 30);
            scene.add(dir);
            const fill = new THREE.DirectionalLight(0x3cb87a, 0.12);
            fill.position.set(-50, -20, -40);
            scene.add(fill);
          } else {
            scene.add(new THREE.AmbientLight(0xffffff, 0.78));
            const dir = new THREE.DirectionalLight(0xffffff, 0.45);
            dir.position.set(30, 90, 40);
            scene.add(dir);
          }
        }
      } catch {
        // scene access optional
      }

      g.resumeAnimation?.();

      setTimeout(() => {
        if (!disposed) graphRef.current?.zoomToFit(600, mobile ? 40 : 80);
      }, 500);

      const mountEl = el;
      ro = new ResizeObserver(() => {
        if (!mountEl || !graphRef.current) return;
        graphRef.current
          .width(mountEl.clientWidth)
          .height(mountEl.clientHeight);
      });
      ro.observe(mountEl);
      readyRef.current = true;
      setReady(true);
      } catch (err) {
        if (disposed) return;
        const message =
          err instanceof Error ? err.message : String(err);
        console.error("[KnowledgeGraph] mount failed:", err);
        setLoadError(message);
        readyRef.current = false;
        setReady(false);
      }
    }

    void mount();

    return () => {
      disposed = true;
      readyRef.current = false;
      ro?.disconnect();
      graphRef.current = null;
      try {
        graph?._destructor?.();
      } catch {
        // ignore
      }
      if (el) el.innerHTML = "";
      setReady(false);
    };
    // Remount when theme or visible layers change (viewData identity)
  }, [viewData, themeDark]);

  function focusSelected() {
    const g = graphRef.current;
    if (!g || !selected) return;
    const node = viewData.nodes.find((n) => n.id === selected.id) as
      | FGNode
      | undefined;
    // Find live node with coords from graph data
    const gd = g.graphData() as { nodes: FGNode[] };
    const live = gd.nodes.find((n) => n.id === selected.id);
    if (!live || live.x == null) return;
    const dist = 90;
    g.cameraPosition(
      {
        x: live.x,
        y: live.y! + dist * 0.15,
        z: live.z! + dist,
      },
      { x: live.x, y: live.y!, z: live.z! },
      800,
    );
    void node;
  }

  function resetView() {
    setSelected(null);
    setQuery("");
    graphRef.current?.zoomToFit(700, 70);
  }

  // Live physics / label / particle knobs without remounting WebGL
  useEffect(() => {
    controlsRef.current = controls;
    const g = graphRef.current;
    if (!g || !ready) return;
    // Physics only — reheat is safe after graphData has set layout.
    applyPhysics(g, controls, isMobile, { reheat: true });
    // Rebuild meshes when labels / node scale change (nodeThreeObject reads controlsRef).
    try {
      g.refresh();
    } catch {
      // ignore refresh races during teardown
    }
  }, [controls, isMobile, ready]);

  function resizeGraphCanvas() {
    const el = containerRef.current;
    const g = graphRef.current;
    if (!el || !g) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) {
      g.width(w).height(h);
    }
  }

  // Fullscreen: lock scroll, Esc to exit, force WebGL canvas to new size.
  // (CSS fixed alone looked like a no-op when the canvas never resized.)
  useLayoutEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    if (fullscreen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);

    const id = requestAnimationFrame(() => {
      resizeGraphCanvas();
      requestAnimationFrame(() => {
        resizeGraphCanvas();
        if (fullscreen) graphRef.current?.zoomToFit(400, 48);
      });
    });
    // Window resize while fullscreen (orientation, etc.)
    window.addEventListener("resize", resizeGraphCanvas);

    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resizeGraphCanvas);
      cancelAnimationFrame(id);
    };
  }, [fullscreen]);

  const empty = viewData.nodes.length === 0;

  function toggleLayer(key: LayerKey) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
    setSelected(null);
  }

  return (
    <div
      className={cn(
        "graph-shell relative flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-soft)]",
        fullscreen
          ? "graph-shell-fs"
          : "min-h-[22rem] rounded-[var(--radius)] sm:min-h-[28rem]",
      )}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? true : undefined}
      aria-label={fullscreen ? "Knowledge graph fullscreen" : undefined}
    >
      {/* Controls */}
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
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span className="chip !py-0.5 text-[0.65rem]">3D</span>
            <span className="tabular-nums">
              {data.meta.truncated
                ? `${data.meta.itemCount} of ${data.meta.totalItems}`
                : data.meta.itemCount}{" "}
              holdings
              <span className="hidden sm:inline">
                {" "}
                ·{" "}
                {viewData.nodes.length -
                  viewData.nodes.filter((n) => n.type === "item").length}{" "}
                concepts · {viewData.links.length} links
              </span>
            </span>
            {data.meta.tagsOmitted > 0 ? (
              <span
                className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[var(--muted)]"
                title={`Showing ${data.meta.tagsShown} tags used on ≥${data.meta.minTagCount} items. ${data.meta.tagsOmitted} singleton/low-use tags hidden.`}
              >
                −{data.meta.tagsOmitted} tags
              </span>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={cn(
                "btn btn-ghost btn-icon",
                controlsOpen && "text-[var(--accent)]",
              )}
              title="View controls"
              aria-pressed={controlsOpen}
              onClick={() => setControlsOpen((v) => !v)}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </button>
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
              title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
              aria-pressed={fullscreen}
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
              onClick={() => toggleLayer(key)}
              className={layers[key] ? "chip chip-active" : "chip"}
              aria-pressed={layers[key]}
            >
              {label}
            </button>
          ))}
        </div>
        {controlsOpen ? (
          <div
            className="graph-controls grid gap-2.5 border-t border-[var(--line)] pt-2 sm:grid-cols-2 lg:grid-cols-4"
            role="group"
            aria-label="Physics and display"
          >
            <label className="graph-control">
              <span className="graph-control__label">
                Spread
                <span className="tabular-nums text-[var(--muted-faint)]">
                  {controls.spread}
                </span>
              </span>
              <input
                type="range"
                min={40}
                max={220}
                step={5}
                value={controls.spread}
                onChange={(e) =>
                  patchControls({ spread: Number(e.target.value) })
                }
                className="graph-slider"
                title="Node repulsion — higher unclumps dense maps"
              />
            </label>
            <label className="graph-control">
              <span className="graph-control__label">
                Link length
                <span className="tabular-nums text-[var(--muted-faint)]">
                  {controls.linkDist}
                </span>
              </span>
              <input
                type="range"
                min={15}
                max={100}
                step={1}
                value={controls.linkDist}
                onChange={(e) =>
                  patchControls({ linkDist: Number(e.target.value) })
                }
                className="graph-slider"
                title="Ideal distance between connected nodes"
              />
            </label>
            <label className="graph-control">
              <span className="graph-control__label">
                Node size
                <span className="tabular-nums text-[var(--muted-faint)]">
                  {controls.nodeScale.toFixed(1)}×
                </span>
              </span>
              <input
                type="range"
                min={0.5}
                max={1.8}
                step={0.1}
                value={controls.nodeScale}
                onChange={(e) =>
                  patchControls({ nodeScale: Number(e.target.value) })
                }
                className="graph-slider"
                title="Sphere scale"
              />
            </label>
            <div className="graph-control gap-1.5">
              <span className="graph-control__label">Labels</span>
              <div className="segment !w-full" role="group" aria-label="Label mode">
                {(
                  [
                    ["focus", "Focus"],
                    ["concepts", "Concepts"],
                    ["off", "Off"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "flex-1",
                      controls.labels === key && "is-active",
                    )}
                    onClick={() => patchControls({ labels: key })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={controls.particles}
                  onChange={(e) =>
                    patchControls({ particles: e.target.checked })
                  }
                  className="rounded border-[var(--line-strong)]"
                />
                Link particles
                <span className="text-[var(--muted-faint)]">
                  (off if FPS dips)
                </span>
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-auto"
                onClick={() => {
                  controlsRef.current = DEFAULT_CONTROLS;
                  setControls(DEFAULT_CONTROLS);
                }}
              >
                Reset controls
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Canvas — flex-1 + absolute fill so fullscreen gets real height */}
      <div
        className={cn(
          "relative min-h-0 flex-1",
          !fullscreen && (isMobile ? "min-h-[360px]" : "min-h-[520px]"),
        )}
      >
        {empty ? (
          <div className="empty-state m-6">
            <strong>Nothing to map with these layers</strong>
            Turn on Tags / Shelves / Formats, or index more holdings.
          </div>
        ) : loadError ? (
          <div className="empty-state m-6">
            <strong>Graph failed to start</strong>
            <p className="mt-2 text-xs text-[var(--muted)]">{loadError}</p>
            <p className="mt-2 text-xs text-[var(--muted-faint)]">
              WebGL / three.js load error. Try a hard refresh, or run{" "}
              <code className="code-inline">rm -rf .next && npm run dev</code>.
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="absolute inset-0 h-full w-full touch-none"
          />
        )}
        {!ready && !empty && !loadError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
            Igniting graph…
          </div>
        ) : null}

        {/* Legend — desktop only, theme-aware */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden flex-wrap gap-1.5 lg:flex">
          {legendSamples(theme).map((s) => (
            <LegendDot key={s.label} color={s.color} label={s.label} />
          ))}
        </div>

        {/* Detail panel */}
        {selected ? (
          <aside className="absolute inset-x-3 bottom-3 z-10 max-h-[45%] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-3 shadow-[var(--shadow-lift)] backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[min(100%-1.5rem,20rem)] sm:max-h-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                  {typeLabel(selected.type)}
                </p>
                <p className="mt-0.5 truncate font-semibold tracking-tight text-[var(--ink)]">
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
              {selected.path ? (
                <div className="pt-1">
                  <dt className="mb-0.5">Path</dt>
                  <dd className="break-all font-mono text-[0.65rem] text-[var(--ink-soft)]">
                    {selected.path}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={focusSelected}
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-2 py-0.5 text-[0.65rem] text-[var(--muted)] backdrop-blur-sm">
      <span
        className="h-1.5 w-1.5 rounded-full shadow-[0_0_6px_currentColor]"
        style={{ background: color, color }}
      />
      {label}
    </span>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Unwrap Webpack/ESM default export (sometimes double-nested). */
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

