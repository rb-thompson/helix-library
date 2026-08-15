/**
 * Personal knowledge graph: files + concepts (tags, collections, kinds, locations).
 * Used by /graph 3D force visualization.
 *
 * Dense vision-tag libraries (hundreds of singleton tags) are thinned so the
 * graph stays navigable — especially on mobile.
 */

import { displayTitle } from "@/lib/catalog/display";
import { searchCatalog } from "@/lib/catalog/query";
import { CONCEPT_COLORS, KIND_COLORS } from "@/lib/graph/colors";
import { getSqlite } from "@/lib/db/client";
import { isHiddenFacetTag } from "@/lib/tags/hidden";
import { ITEM_KINDS, type ItemKind } from "@/lib/types";

export type GraphNodeType =
  | "item"
  | "tag"
  | "collection"
  | "kind"
  | "location";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  kind?: ItemKind | string;
  /** Visual mass / radius driver */
  val: number;
  /** Degree (connections) — used for importance */
  degree: number;
  sizeBytes?: number;
  itemId?: number;
  path?: string;
  href?: string;
  color: string;
};

export type GraphLink = {
  source: string;
  target: string;
  relation: "tagged" | "shelved" | "kind_of" | "located_in";
};

/** Catalog-aligned subset for /graph and “Map these”. */
export type GraphFilters = {
  kind?: ItemKind;
  locationId?: number;
  tagId?: number;
  collectionId?: number;
  q?: string;
};

export type GraphBuildOpts = {
  maxItems?: number;
  /** Minimum item uses for a tag to appear (default 2). */
  minTagCount?: number;
  /** Max tag nodes (default 36; filtered default 48). */
  maxTags?: number;
  /** Include format hub nodes (default true). */
  includeKinds?: boolean;
  /** Include location hub nodes (default true). */
  includeLocations?: boolean;
  /** Include collection nodes (default true). */
  includeCollections?: boolean;
  /** Include tag nodes (default true). */
  includeTags?: boolean;
} & GraphFilters;

export type KnowledgeGraph = {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    /** Item nodes after cap (sampled) */
    itemCount: number;
    /** Filter-scoped universe count before cap */
    totalItems: number;
    /** Cap applied this build */
    maxItems: number;
    conceptCount: number;
    linkCount: number;
    /** totalItems > itemCount */
    truncated: boolean;
    /** Tag nodes actually shown */
    tagsShown: number;
    /** Tag types skipped (singleton / over cap) */
    tagsOmitted: number;
    minTagCount: number;
    /** Echo of applied filters (empty if none). */
    filters: GraphFilters;
  };
};

/** Default (dark) kind colors — client recolors for light theme. */
export const KIND_NODE_COLORS: Record<string, string> = {
  ...KIND_COLORS.dark,
};

const CONCEPT_NODE_COLORS = CONCEPT_COLORS.dark;

export const DEFAULT_MAX_ITEMS = 600;
/** Server-enforced ceiling (query maxItems cannot exceed this). */
export const HARD_MAX_ITEMS = 800;
/** Only tags used on this many holdings (cuts singleton vision labels). */
const DEFAULT_MIN_TAG_COUNT = 2;
/** Cap tag concept nodes even after min filter. */
const DEFAULT_MAX_TAGS = 36;
const FILTERED_MAX_TAGS = 48;

function hasActiveFilters(f: GraphFilters): boolean {
  return Boolean(
    f.kind ||
      f.locationId ||
      f.tagId ||
      f.collectionId ||
      (f.q && f.q.trim()),
  );
}

export function isItemKind(v: string): v is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(v);
}

function itemNodeId(id: number) {
  return `item:${id}`;
}
function tagNodeId(id: number) {
  return `tag:${id}`;
}
function colNodeId(id: number) {
  return `col:${id}`;
}
function kindNodeId(kind: string) {
  return `kind:${kind}`;
}
function locNodeId(id: number) {
  return `loc:${id}`;
}

function importanceVal(
  type: GraphNodeType,
  degree: number,
  sizeBytes = 0,
): number {
  if (type === "item") {
    return Math.max(
      1.2,
      1 + degree * 1.4 + Math.log10(sizeBytes + 10) * 0.45,
    );
  }
  if (type === "tag" || type === "collection") {
    return Math.max(2.5, 2 + degree * 1.8);
  }
  if (type === "kind") {
    return Math.max(3, 2.5 + degree * 0.25);
  }
  return Math.max(2.2, 2 + degree * 0.35);
}

/**
 * Build graph snapshot from SQLite holdings + curation.
 * Prioritizes tagged/shelved items when over the node cap.
 * Optional GraphFilters restrict items (catalog “Map these” / /graph?q=…).
 */
export function buildKnowledgeGraph(opts?: GraphBuildOpts): KnowledgeGraph {
  const filters: GraphFilters = {
    kind: opts?.kind,
    locationId: opts?.locationId,
    tagId: opts?.tagId,
    collectionId: opts?.collectionId,
    q: opts?.q?.trim() || undefined,
  };
  const filtered = hasActiveFilters(filters);

  const hardMax = HARD_MAX_ITEMS;
  const maxItems = Math.min(
    hardMax,
    Math.max(1, opts?.maxItems ?? (filtered ? hardMax : DEFAULT_MAX_ITEMS)),
  );
  const includeKinds = opts?.includeKinds !== false;
  const includeLocations = opts?.includeLocations !== false;
  const includeCollections = opts?.includeCollections !== false;
  const includeTags = opts?.includeTags !== false;

  const sqlite = getSqlite();

  type ItemRow = {
    id: number;
    name: string;
    title: string;
    title_source: string | null;
    kind: string;
    path: string;
    size_bytes: number;
    location_id: number;
    location_name: string;
    tag_n: number;
    col_n: number;
  };

  const emptyGraph = (minTagCount: number): KnowledgeGraph => ({
    nodes: [],
    links: [],
    meta: {
      itemCount: 0,
      totalItems: 0,
      maxItems,
      conceptCount: 0,
      linkCount: 0,
      truncated: false,
      tagsShown: 0,
      tagsOmitted: 0,
      minTagCount,
      filters,
    },
  });

  // Optional q → catalog hybrid search, one page only
  let qIdSet: Set<number> | null = null;
  if (filters.q) {
    const hit = searchCatalog({
      q: filters.q,
      kind: filters.kind ?? "",
      locationId: filters.locationId ?? "",
      tagId: filters.tagId ?? "",
      collectionId: filters.collectionId ?? "",
      page: 1,
      pageSize: maxItems,
      sort: "mtime",
    });
    qIdSet = new Set(hit.items.map((i) => i.id));
    if (qIdSet.size === 0) {
      return emptyGraph(opts?.minTagCount ?? DEFAULT_MIN_TAG_COUNT);
    }
  }

  const where: string[] = ["i.is_missing = 0", "l.enabled = 1"];
  const args: unknown[] = [];

  if (filters.kind) {
    where.push("i.kind = ?");
    args.push(filters.kind);
  }
  if (filters.locationId) {
    where.push("i.location_id = ?");
    args.push(filters.locationId);
  }
  if (filters.tagId) {
    where.push(
      "EXISTS (SELECT 1 FROM item_tags itf WHERE itf.item_id = i.id AND itf.tag_id = ?)",
    );
    args.push(filters.tagId);
  }
  if (filters.collectionId) {
    // Lazy import avoids cycle with catalog/query ↔ collections/manage
    const { resolveCollectionItemIds } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/lib/collections/manage") as typeof import("@/lib/collections/manage");
    const resolved = resolveCollectionItemIds(filters.collectionId);
    if (resolved.ids.length === 0) {
      return emptyGraph(opts?.minTagCount ?? DEFAULT_MIN_TAG_COUNT);
    }
    // Cap id set for graph sample path (resolve hardCap 2000; graph max ≤800)
    const capIds = resolved.ids.slice(0, Math.max(maxItems * 2, maxItems));
    where.push(`i.id IN (${capIds.map(() => "?").join(",")})`);
    args.push(...capIds);
  }
  if (qIdSet) {
    const ids = [...qIdSet];
    where.push(`i.id IN (${ids.map(() => "?").join(",")})`);
    args.push(...ids);
  }

  const whereSql = where.join(" AND ");

  const countRow = sqlite
    .prepare(
      `
    SELECT count(*) AS c
    FROM items i
    JOIN locations l ON l.id = i.location_id
    WHERE ${whereSql}
  `,
    )
    .get(...args) as { c: number };
  const totalItems = countRow.c;

  if (totalItems === 0) {
    return emptyGraph(opts?.minTagCount ?? DEFAULT_MIN_TAG_COUNT);
  }

  // Adaptive tag density when filtered set is small
  const defaultMinTag =
    filtered && totalItems < 80 ? 1 : DEFAULT_MIN_TAG_COUNT;
  const minTagCount = opts?.minTagCount ?? defaultMinTag;
  const maxTags =
    opts?.maxTags ?? (filtered ? FILTERED_MAX_TAGS : DEFAULT_MAX_TAGS);

  const items = sqlite
    .prepare(
      `
    SELECT
      i.id,
      i.name,
      i.title,
      coalesce(i.title_source, 'filename') AS title_source,
      i.kind,
      i.path,
      i.size_bytes,
      i.location_id,
      l.name AS location_name,
      (SELECT count(*) FROM item_tags it WHERE it.item_id = i.id) AS tag_n,
      (SELECT count(*) FROM collection_items ci WHERE ci.item_id = i.id) AS col_n
    FROM items i
    JOIN locations l ON l.id = i.location_id
    WHERE ${whereSql}
    ORDER BY
      (tag_n + col_n) DESC,
      i.mtime_ms DESC
    LIMIT ?
  `,
    )
    .all(...args, maxItems) as ItemRow[];

  const truncated = totalItems > items.length;

  const itemIds = new Set(items.map((i) => i.id));
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const degree = new Map<string, number>();

  function bump(id: string) {
    degree.set(id, (degree.get(id) ?? 0) + 1);
  }

  function addLink(
    source: string,
    target: string,
    relation: GraphLink["relation"],
  ) {
    links.push({ source, target, relation });
    bump(source);
    bump(target);
  }

  for (const row of items) {
    const id = itemNodeId(row.id);
    nodes.set(id, {
      id,
      type: "item",
      label: displayTitle({
        name: row.name,
        title: row.title,
        titleSource: row.title_source,
      }),
      kind: row.kind,
      val: 1,
      degree: 0,
      sizeBytes: row.size_bytes,
      itemId: row.id,
      path: row.path,
      href: `/catalog/${row.id}`,
      color: KIND_NODE_COLORS[row.kind] ?? KIND_NODE_COLORS.other,
    });
  }

  if (includeKinds) {
    const kinds = new Set(items.map((i) => i.kind));
    for (const kind of kinds) {
      const id = kindNodeId(kind);
      nodes.set(id, {
        id,
        type: "kind",
        label: kind.charAt(0).toUpperCase() + kind.slice(1),
        kind,
        val: 3,
        degree: 0,
        color: CONCEPT_NODE_COLORS.kind,
      });
    }
    for (const row of items) {
      addLink(itemNodeId(row.id), kindNodeId(row.kind), "kind_of");
    }
  }

  if (includeLocations) {
    const locSeen = new Map<number, string>();
    for (const row of items) {
      if (!locSeen.has(row.location_id)) {
        locSeen.set(row.location_id, row.location_name);
        const id = locNodeId(row.location_id);
        nodes.set(id, {
          id,
          type: "location",
          label: row.location_name,
          val: 2.5,
          degree: 0,
          color: CONCEPT_NODE_COLORS.location,
          href: "/locations",
        });
      }
      addLink(itemNodeId(row.id), locNodeId(row.location_id), "located_in");
    }
  }

  let tagsOmitted = 0;
  let tagsShown = 0;

  if (includeTags) {
    // Frequency among items in the current graph set (not global)
    const idList = [...itemIds];
    if (idList.length > 0) {
      const tagFreqRaw = sqlite
        .prepare(
          `
        SELECT t.id, t.name, coalesce(t.hidden, 0) AS hidden, count(*) AS c
        FROM tags t
        JOIN item_tags it ON it.tag_id = t.id
        WHERE it.item_id IN (${idList.map(() => "?").join(",")})
        GROUP BY t.id
        HAVING c >= ?
        ORDER BY c DESC, t.name
        LIMIT ?
      `,
        )
        .all(...idList, minTagCount, maxTags * 2) as {
        id: number;
        name: string;
        hidden: number;
        c: number;
      }[];
      const tagFreq = tagFreqRaw
        .filter((t) => !isHiddenFacetTag(t.name, { hidden: t.hidden }))
        .slice(0, maxTags);

      const totalEligible = (
        sqlite
          .prepare(
            `
          SELECT count(*) AS c FROM (
            SELECT t.id FROM tags t
            JOIN item_tags it ON it.tag_id = t.id
            WHERE it.item_id IN (${idList.map(() => "?").join(",")})
            GROUP BY t.id
            HAVING count(*) >= ?
          )
        `,
          )
          .get(...idList, minTagCount) as { c: number }
      ).c;

      tagsOmitted = Math.max(0, totalEligible - tagFreq.length);

      const allowList = tagFreq.map((t) => t.id);
      const allowTags = new Set(allowList);

      const tagRows =
        allowList.length === 0
          ? []
          : (sqlite
              .prepare(
                `
        SELECT t.id, t.name, it.item_id
        FROM item_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE t.id IN (${allowList.map(() => "?").join(",")})
          AND it.item_id IN (${idList.map(() => "?").join(",")})
      `,
              )
              .all(...allowList, ...idList) as {
              id: number;
              name: string;
              item_id: number;
            }[]);

      for (const row of tagRows) {
        if (!itemIds.has(row.item_id)) continue;
        if (!allowTags.has(row.id)) continue;
        const tid = tagNodeId(row.id);
        if (!nodes.has(tid)) {
          nodes.set(tid, {
            id: tid,
            type: "tag",
            label: row.name,
            val: 2,
            degree: 0,
            color: CONCEPT_NODE_COLORS.tag,
            href: `/catalog?tag=${row.id}`,
          });
          tagsShown += 1;
        }
        addLink(itemNodeId(row.item_id), tid, "tagged");
      }
    }
  }

  if (includeCollections) {
    const colRows = sqlite
      .prepare(
        `
      SELECT c.id, c.name, ci.item_id
      FROM collection_items ci
      JOIN collections c ON c.id = ci.collection_id
    `,
      )
      .all() as { id: number; name: string; item_id: number }[];

    for (const row of colRows) {
      if (!itemIds.has(row.item_id)) continue;
      const cid = colNodeId(row.id);
      if (!nodes.has(cid)) {
        nodes.set(cid, {
          id: cid,
          type: "collection",
          label: row.name,
          val: 2.5,
          degree: 0,
          color: CONCEPT_NODE_COLORS.collection,
          href: `/collections/${row.id}`,
        });
      }
      addLink(itemNodeId(row.item_id), cid, "shelved");
    }
  }

  for (const node of nodes.values()) {
    const d = degree.get(node.id) ?? 0;
    node.degree = d;
    node.val = importanceVal(node.type, d, node.sizeBytes ?? 0);
  }

  const nodeList = [...nodes.values()].filter((n) => {
    if (n.type === "item") return true;
    return (degree.get(n.id) ?? 0) > 0;
  });
  const keep = new Set(nodeList.map((n) => n.id));
  const linkList = links.filter(
    (l) => keep.has(l.source) && keep.has(l.target),
  );

  const conceptCount = nodeList.filter((n) => n.type !== "item").length;
  tagsShown = nodeList.filter((n) => n.type === "tag").length;

  return {
    nodes: nodeList,
    links: linkList,
    meta: {
      itemCount: items.length,
      totalItems,
      maxItems,
      conceptCount,
      linkCount: linkList.length,
      truncated,
      tagsShown,
      tagsOmitted,
      minTagCount,
      filters,
    },
  };
}

/** Build /graph query string from catalog-style filters. */
export function graphHrefFromFilters(
  filters: GraphFilters & {
    singletons?: boolean;
    maxItems?: number;
    mode?: "2d" | "3d";
  },
): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.locationId) params.set("locationId", String(filters.locationId));
  if (filters.tagId) params.set("tagId", String(filters.tagId));
  if (filters.collectionId)
    params.set("collectionId", String(filters.collectionId));
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.singletons) params.set("singletons", "1");
  if (
    filters.maxItems != null &&
    Number.isFinite(filters.maxItems) &&
    filters.maxItems > 0
  ) {
    params.set("maxItems", String(Math.floor(filters.maxItems)));
  }
  if (filters.mode === "2d" || filters.mode === "3d") {
    params.set("mode", filters.mode);
  }
  const s = params.toString();
  return s ? `/graph?${s}` : "/graph";
}
