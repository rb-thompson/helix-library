import { tool } from "ai";
import { z } from "zod";
import {
  describeAction,
  formatActionToken,
  type LibrarianAction,
} from "@/lib/agent/actions";
import {
  getItemById,
  listLocationsWithCounts,
  searchCatalog,
} from "@/lib/catalog/query";
import { listCollections } from "@/lib/collections/manage";
import { SYSTEM_HELP_TOPICS } from "@/lib/agent/prompt";
import { probeMachine } from "@/lib/machine/probe";
import { ITEM_KINDS } from "@/lib/types";
import { formatBytes } from "@/lib/format";

function summarizeItem(item: NonNullable<ReturnType<typeof getItemById>>) {
  return {
    id: item.id,
    name: item.name,
    title: item.title,
    kind: item.kind,
    location: item.locationName,
    path: item.path,
    relPath: item.relPath,
    sizeBytes: item.sizeBytes,
    sizeHuman: formatBytes(item.sizeBytes),
    mime: item.mime,
    catalogUrl: `/catalog/${item.id}`,
    isMissing: Boolean(item.isMissing),
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
  };
}

export const librarianTools = {
  catalog_search: tool({
    description:
      "Search the personal library catalog by keyword and optional filters. Returns holdings with absolute paths. Use this to find files before answering location questions.",
    inputSchema: z.object({
      q: z
        .string()
        .optional()
        .describe("Search query (name, path, title, or text body)"),
      kind: z
        .enum(ITEM_KINDS)
        .optional()
        .describe("Filter by format kind"),
      locationId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Filter by location id from list_locations"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Max results (default 10)"),
      under: z
        .string()
        .optional()
        .describe("Relative path prefix within a location (e.g. documents)"),
      sort: z
        .enum(["mtime", "name", "size", "indexed"])
        .optional()
        .describe("Sort field (default mtime)"),
    }),
    execute: async ({ q, kind, locationId, limit, under, sort }) => {
      const result = searchCatalog({
        q: q ?? "",
        kind: kind ?? "",
        locationId: locationId ?? "",
        under: under ?? "",
        sort: sort ?? "mtime",
        page: 1,
        pageSize: limit ?? 10,
      });
      return {
        total: result.total,
        items: result.items.map(summarizeItem),
      };
    },
  }),

  catalog_get: tool({
    description: "Get full metadata for one catalog item by numeric id.",
    inputSchema: z.object({
      id: z.number().int().positive().describe("Catalog item id"),
    }),
    execute: async ({ id }) => {
      const item = getItemById(id);
      if (!item) return { error: "Item not found", id };
      return summarizeItem(item);
    },
  }),

  list_locations: tool({
    description:
      "List configured scan roots (library locations/branches) with item counts and enabled status.",
    inputSchema: z.object({}),
    execute: async () => {
      const locations = listLocationsWithCounts();
      return {
        locations: locations.map((l) => ({
          id: l.id,
          name: l.name,
          rootPath: l.rootPath,
          enabled: Boolean(l.enabled),
          itemCount: l.itemCount,
        })),
      };
    },
  }),

  list_collections: tool({
    description: "List curated collections (shelves) and their item counts.",
    inputSchema: z.object({}),
    execute: async () => {
      const collections = listCollections();
      return {
        collections: collections.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          itemCount: c.itemCount,
          url: `/collections/${c.id}`,
        })),
      };
    },
  }),

  machine_status: tool({
    description:
      "Read-only host machine facts: CPU, memory, disk, optional tools, last reindex job. The 'brick and mortar' of this personal library.",
    inputSchema: z.object({}),
    execute: async () => {
      const m = probeMachine();
      return {
        hostname: m.hostname,
        platform: `${m.platform} ${m.release}`,
        cpuCount: m.cpuCount,
        loadavg: m.loadavg,
        memory: {
          total: formatBytes(m.memory.total),
          free: formatBytes(m.memory.free),
          used: formatBytes(m.memory.used),
        },
        disk: m.disk
          ? {
              free: formatBytes(m.disk.free),
              total: formatBytes(m.disk.total),
            }
          : null,
        bind: `${m.bind}:${m.port}`,
        tools: m.tools,
        latestJob: m.latestJob,
      };
    },
  }),

  system_help: tool({
    description:
      "Get short how-to text for using non-os. Topics: overview, reindex, locations, collections, search, safety.",
    inputSchema: z.object({
      topic: z
        .enum([
          "overview",
          "reindex",
          "locations",
          "collections",
          "search",
          "safety",
        ])
        .describe("Help topic"),
    }),
    execute: async ({ topic }) => {
      return {
        topic,
        text: SYSTEM_HELP_TOPICS[topic] ?? SYSTEM_HELP_TOPICS.overview,
      };
    },
  }),

  /**
   * Stage mutations for human approval. Does NOT execute.
   * Model must paste returned tokens into the user-visible reply.
   */
  propose_actions: tool({
    description:
      "Stage one or more in-app mutations for the user to approve. Does not change the catalog until the user confirms in the UI or replies approve/yes. Use for reindex, tags, collections, locations.",
    inputSchema: z.object({
      title: z
        .string()
        .optional()
        .describe("Short plan title, e.g. Tag resume"),
      summary: z
        .string()
        .optional()
        .describe("One-line explanation for the user"),
      actions: z
        .array(
          z.object({
            type: z.enum([
              "reindex",
              "tag",
              "untag",
              "collect",
              "uncollect",
              "bulk_tag",
              "bulk_collect",
              "create_collection",
              "update_collection",
              "delete_collection",
              "set_location_enabled",
              "add_location",
              "remove_location",
            ]),
            itemId: z.number().int().positive().optional(),
            tagId: z.number().int().positive().optional(),
            tagName: z.string().optional(),
            collectionId: z.number().int().positive().optional(),
            itemIds: z.array(z.number().int().positive()).optional(),
            name: z.string().optional(),
            description: z.string().optional(),
            locationId: z.number().int().positive().optional(),
            enabled: z.boolean().optional(),
            root: z.string().optional(),
          }),
        )
        .min(1)
        .max(25),
    }),
    execute: async ({ title, summary, actions: raw }) => {
      const actions: LibrarianAction[] = [];
      for (const a of raw) {
        switch (a.type) {
          case "reindex":
            actions.push({ type: "reindex" });
            break;
          case "tag":
            if (a.itemId && a.tagName) {
              actions.push({
                type: "tag",
                itemId: a.itemId,
                tagName: a.tagName,
              });
            }
            break;
          case "untag":
            if (a.itemId && a.tagId) {
              actions.push({
                type: "untag",
                itemId: a.itemId,
                tagId: a.tagId,
              });
            }
            break;
          case "collect":
            if (a.itemId && a.collectionId) {
              actions.push({
                type: "collect",
                itemId: a.itemId,
                collectionId: a.collectionId,
              });
            }
            break;
          case "uncollect":
            if (a.itemId && a.collectionId) {
              actions.push({
                type: "uncollect",
                itemId: a.itemId,
                collectionId: a.collectionId,
              });
            }
            break;
          case "bulk_tag":
            if (a.itemIds?.length && a.tagName) {
              actions.push({
                type: "bulk_tag",
                itemIds: a.itemIds,
                tagName: a.tagName,
              });
            }
            break;
          case "bulk_collect":
            if (a.itemIds?.length && a.collectionId) {
              actions.push({
                type: "bulk_collect",
                itemIds: a.itemIds,
                collectionId: a.collectionId,
              });
            }
            break;
          case "create_collection":
            if (a.name) {
              actions.push({
                type: "create_collection",
                name: a.name,
                description: a.description,
              });
            }
            break;
          case "update_collection":
            if (a.collectionId && (a.name || a.description !== undefined)) {
              actions.push({
                type: "update_collection",
                collectionId: a.collectionId,
                name: a.name,
                description: a.description,
              });
            }
            break;
          case "delete_collection":
            if (a.collectionId) {
              actions.push({
                type: "delete_collection",
                collectionId: a.collectionId,
              });
            }
            break;
          case "set_location_enabled":
            if (a.locationId != null && a.enabled != null) {
              actions.push({
                type: "set_location_enabled",
                locationId: a.locationId,
                enabled: a.enabled,
              });
            }
            break;
          case "add_location":
            if (a.name && a.root) {
              actions.push({
                type: "add_location",
                name: a.name,
                root: a.root,
              });
            }
            break;
          case "remove_location":
            if (a.locationId) {
              actions.push({
                type: "remove_location",
                locationId: a.locationId,
              });
            }
            break;
          default:
            break;
        }
      }

      if (!actions.length) {
        return {
          ok: false,
          error: "No valid actions could be built from input",
        };
      }

      const tokens = actions.map((act) => formatActionToken(act));
      const descriptions = actions.map((act) => describeAction(act));

      return {
        ok: true,
        requiresConfirmation: true,
        title: title ?? "Actions",
        summary:
          summary ??
          "These changes run only after the user approves in the UI or says approve/yes.",
        descriptions,
        /** Paste these tokens verbatim into your assistant message so Approve buttons appear. */
        tokens,
        markdownHint: [
          `### Proposed: ${title ?? "Actions"}`,
          "",
          summary ?? "Review and approve:",
          "",
          ...descriptions.map((d) => `• ${d}`),
          "",
          ...tokens,
          "",
          "_Confirm with **approve** / **yes**, or click the buttons._",
        ].join("\n"),
      };
    },
  }),
};
