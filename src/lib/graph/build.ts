/**
 * Personal knowledge graph: files + concepts (tags, collections, kinds, locations).
 * Used by /graph 3D force visualization.
 *
 * Dense vision-tag libraries (hundreds of singleton tags) are thinned so the
 * graph stays navigable — especially on mobile.
 */

import { getSqlite } from "@/lib/db/client";
import type { ItemKind } from "@/lib/types";

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

export type KnowledgeGraph = {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    itemCount: number;
    conceptCount: number;
    linkCount: number;
    truncated: boolean;
    /** Tag nodes actually shown */
    tagsShown: number;
    /** Tag types skipped (singleton / over cap) */
    tagsOmitted: number;
    minTagCount: number;
  };
};

/** Dark-theme kind colors matching Helix CSS tokens */
export const KIND_NODE_COLORS: Record<string, string> = {
  text: "#7dd3fc",
  image: "#c4b5fd",
  video: "#f9a8d4",
  audio: "#fcd34d",
  archive: "#a8a29e",
  code: "#6ee7b7",
  document: "#93c5fd",
  other: "#9ca3af",
};

const CONCEPT_COLORS = {
  tag: "#f0d78c",
  collection: "#a5b4fc",
  kind: "#c8d0e0",
  location: "#7dd3c0",
} as const;

const MAX_ITEMS = 600;
/** Only tags used on this many holdings (cuts singleton vision labels). */
const DEFAULT_MIN_TAG_COUNT = 2;
/** Cap tag concept nodes even after min filter. */
const DEFAULT_MAX_TAGS = 36;

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
 * Tags: shared-only by default, top-N by frequency.
 */
export function buildKnowledgeGraph(opts?: {
  maxItems?: number;
  /** Minimum item uses for a tag to appear (default 2). */
  minTagCount?: number;
  /** Max tag nodes (default 36). */
  maxTags?: number;
  /** Include format hub nodes (default true). */
  includeKinds?: boolean;
  /** Include location hub nodes (default true). */
  includeLocations?: boolean;
  /** Include collection nodes (default true). */
  includeCollections?: boolean;
  /** Include tag nodes (default true). */
  includeTags?: boolean;
}): KnowledgeGraph {
  const maxItems = opts?.maxItems ?? MAX_ITEMS;
  const minTagCount = opts?.minTagCount ?? DEFAULT_MIN_TAG_COUNT;
  const maxTags = opts?.maxTags ?? DEFAULT_MAX_TAGS;
  const includeKinds = opts?.includeKinds !== false;
  const includeLocations = opts?.includeLocations !== false;
  const includeCollections = opts?.includeCollections !== false;
  const includeTags = opts?.includeTags !== false;

  const sqlite = getSqlite();

  type ItemRow = {
    id: number;
    name: string;
    kind: string;
    path: string;
    size_bytes: number;
    location_id: number;
    location_name: string;
    tag_n: number;
    col_n: number;
  };

  const items = sqlite
    .prepare(
      `
    SELECT
      i.id,
      i.name,
      i.kind,
      i.path,
      i.size_bytes,
      i.location_id,
      l.name AS location_name,
      (SELECT count(*) FROM item_tags it WHERE it.item_id = i.id) AS tag_n,
      (SELECT count(*) FROM collection_items ci WHERE ci.item_id = i.id) AS col_n
    FROM items i
    JOIN locations l ON l.id = i.location_id
    WHERE i.is_missing = 0
    ORDER BY
      (tag_n + col_n) DESC,
      i.mtime_ms DESC
    LIMIT ?
  `,
    )
    .all(maxItems) as ItemRow[];

  const totalItems = (
    sqlite
      .prepare(`SELECT count(*) AS c FROM items WHERE is_missing = 0`)
      .get() as { c: number }
  ).c;
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
      label: row.name,
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
        color: CONCEPT_COLORS.kind,
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
          color: CONCEPT_COLORS.location,
          href: "/locations",
        });
      }
      addLink(itemNodeId(row.id), locNodeId(row.location_id), "located_in");
    }
  }

  let tagsOmitted = 0;
  let tagsShown = 0;

  if (includeTags) {
    // Global frequency for all tags, then filter + cap
    const tagFreq = sqlite
      .prepare(
        `
      SELECT t.id, t.name, count(*) AS c
      FROM tags t
      JOIN item_tags it ON it.tag_id = t.id
      GROUP BY t.id
      HAVING c >= ?
      ORDER BY c DESC, t.name
      LIMIT ?
    `,
      )
      .all(minTagCount, maxTags) as { id: number; name: string; c: number }[];

    const totalEligible = (
      sqlite
        .prepare(
          `
        SELECT count(*) AS c FROM (
          SELECT t.id FROM tags t
          JOIN item_tags it ON it.tag_id = t.id
          GROUP BY t.id
          HAVING count(*) >= ?
        )
      `,
        )
        .get(minTagCount) as { c: number }
    ).c;

    const totalTags = (
      sqlite.prepare(`SELECT count(*) AS c FROM tags`).get() as { c: number }
    ).c;

    tagsOmitted = Math.max(0, totalTags - tagFreq.length);
    // Also count eligible-but-capped
    if (totalEligible > tagFreq.length) {
      tagsOmitted = Math.max(tagsOmitted, totalTags - tagFreq.length);
    }

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
    `,
            )
            .all(...allowList) as {
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
          color: CONCEPT_COLORS.tag,
          href: `/catalog?tag=${row.id}`,
        });
        tagsShown += 1;
      }
      addLink(itemNodeId(row.item_id), tid, "tagged");
    }
  } else {
    const totalTags = (
      sqlite.prepare(`SELECT count(*) AS c FROM tags`).get() as { c: number }
    ).c;
    tagsOmitted = totalTags;
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
          color: CONCEPT_COLORS.collection,
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
      conceptCount,
      linkCount: linkList.length,
      truncated,
      tagsShown,
      tagsOmitted,
      minTagCount,
    },
  };
}
