import { tool } from "ai";
import { z } from "zod";
import {
  describeAction,
  formatActionToken,
  type LibrarianAction,
} from "@/lib/agent/actions";
import { displayTitle } from "@/lib/catalog/display";
import {
  getItemById,
  getItemText,
  listLocationsWithCounts,
  searchCatalog,
} from "@/lib/catalog/query";
import { listCollections } from "@/lib/collections/manage";
import { SYSTEM_HELP_TOPICS } from "@/lib/agent/prompt";
import { probeMachine } from "@/lib/machine/probe";
import { ITEM_KINDS } from "@/lib/types";
import { formatBytes } from "@/lib/format";

/** Cap body size returned to the model (tokens / latency). */
const BODY_MAX_CHARS = 24_000;
const PREVIEW_CHARS = 400;

function summarizeItem(item: NonNullable<ReturnType<typeof getItemById>>) {
  const text = getItemText(item.id);
  const hasBody = Boolean(text?.body?.trim());
  const catalogUrl = `/catalog/${item.id}`;
  const label = displayTitle(item);
  return {
    id: item.id,
    name: item.name,
    title: item.title,
    displayTitle: label,
    kind: item.kind,
    location: item.locationName,
    path: item.path,
    relPath: item.relPath,
    sizeBytes: item.sizeBytes,
    sizeHuman: formatBytes(item.sizeBytes),
    mime: item.mime,
    /** Always surface this so the model links every hit. */
    catalogUrl,
    /** Markdown ready: [display title](/catalog/id) */
    catalogMarkdownLink: `[${label}](${catalogUrl})`,
    isMissing: Boolean(item.isMissing),
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    /** True when note/PDF text was extracted into the catalog for FTS + reading. */
    hasExtractedText: hasBody,
    bodyPreview: hasBody
      ? text!.body.slice(0, PREVIEW_CHARS) +
        (text!.body.length > PREVIEW_CHARS ? "…" : "")
      : null,
  };
}

function readItemBody(itemId: number, maxChars: number) {
  const item = getItemById(itemId);
  if (!item) return { error: "Item not found", id: itemId };

  const text = getItemText(itemId);
  const raw = text?.body?.trim() ?? "";
  if (!raw) {
    return {
      ...summarizeItem(item),
      body: null,
      bodyChars: 0,
      truncated: false,
      note:
        item.kind === "document" || item.mime === "application/pdf"
          ? "No extracted text yet (scanned PDF, empty layer, or reindex needed). Metadata only."
          : item.kind === "text" || item.kind === "code"
            ? "No body sample stored. Reindex this location."
            : "This kind usually has no text body (e.g. pure image/video).",
    };
  }

  const limit = Math.min(Math.max(1_000, maxChars), BODY_MAX_CHARS);
  const truncated = raw.length > limit;
  const body = truncated ? raw.slice(0, limit) : raw;

  return {
    ...summarizeItem(item),
    body,
    bodyChars: raw.length,
    returnedChars: body.length,
    truncated,
    extractedAt: text?.extractedAt ?? null,
    note: truncated
      ? `Body truncated to ${limit} characters for the model; full sample is longer in the catalog.`
      : "Full indexed text sample returned.",
  };
}

export const librarianTools = {
  catalog_search: tool({
    description:
      "Search the personal library catalog by keyword and optional filters. Each hit includes catalogUrl and catalogMarkdownLink — always paste catalogMarkdownLink into your reply when you mention a hit.",
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
    description:
      "Get metadata for one catalog item by id, including whether extracted text is available and a short bodyPreview. For full document content (evaluate resume, summarize PDF/notes), call catalog_read next.",
    inputSchema: z.object({
      id: z.number().int().positive().describe("Catalog item id"),
    }),
    execute: async ({ id }) => {
      const item = getItemById(id);
      if (!item) return { error: "Item not found", id };
      return summarizeItem(item);
    },
  }),

  catalog_read: tool({
    description:
      "Read the indexed text content of a holding (PDF text layer, notes, code samples). Use this whenever the user asks to evaluate, review, summarize, critique, or discuss what a document/note says. Do not claim you cannot read documents without trying this tool first.",
    inputSchema: z.object({
      id: z
        .number()
        .int()
        .positive()
        .describe("Catalog item id from search or catalog_get"),
      maxChars: z
        .number()
        .int()
        .min(1000)
        .max(BODY_MAX_CHARS)
        .optional()
        .describe(`Max characters of body to return (default 16000, max ${BODY_MAX_CHARS})`),
    }),
    execute: async ({ id, maxChars }) => {
      return readItemBody(id, maxChars ?? 16_000);
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
    description:
      "List curated collections (manual shelves and smart query shelves) with live item counts. Collect only works for kind=manual.",
    inputSchema: z.object({}),
    execute: async () => {
      const collections = listCollections();
      return {
        collections: collections.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          itemCount: c.itemCount,
          kind: c.kind,
          querySummary:
            c.kind === "smart" && c.queryJson
              ? c.queryJson.slice(0, 200)
              : null,
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
      "Get short how-to text for using Helix Library. Topics: overview, reindex, locations, collections, search, safety.",
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
      "Stage one or more in-app mutations for the user to approve. Does not change the catalog until the user confirms. Use for reindex, tags, collections, locations, and acquire (arXiv / OpenAlex / clip / Grokipedia / YouTube / Grok image / image URL).",
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
              "collect_by_name",
              "uncollect",
              "bulk_tag",
              "bulk_collect",
              "create_collection",
              "update_collection",
              "delete_collection",
              "set_location_enabled",
              "add_location",
              "remove_location",
              "acquire_arxiv",
              "acquire_youtube",
              "acquire_image",
              "acquire_openalex",
              "acquire_clip",
              "acquire_grokipedia",
              "acquire_image_url",
              "merge_tags",
              "rename_tag",
            ]),
            itemId: z.number().int().positive().optional(),
            tagId: z.number().int().positive().optional(),
            tagName: z.string().optional(),
            collectionId: z.number().int().positive().optional(),
            /** For collect_by_name — shelf title resolved when the user approves. */
            collectionName: z.string().optional(),
            itemIds: z.array(z.number().int().positive()).optional(),
            name: z.string().optional(),
            description: z.string().optional(),
            locationId: z.number().int().positive().optional(),
            enabled: z.boolean().optional(),
            root: z.string().optional(),
            /** acquire_arxiv — bare id or arxiv.org URL from user text only */
            idOrUrl: z.string().optional(),
            /** acquire_youtube / clip / image_url — full https URL from user text only */
            url: z.string().optional(),
            mode: z.enum(["video", "audio"]).optional(),
            /** acquire_image — generation prompt from user */
            prompt: z.string().optional(),
            filenameHint: z.string().optional(),
            /** acquire_openalex — DOI or W… id from user text only */
            idOrDoi: z.string().optional(),
            /** acquire_grokipedia — title, slug, or grokipedia.com/page/… URL */
            titleOrSlug: z.string().optional(),
            sourceTagIds: z.array(z.number().int().positive()).optional(),
            targetTagId: z.number().int().positive().optional(),
            targetName: z.string().optional(),
            mergeIfExists: z.boolean().optional(),
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
          case "collect_by_name":
            if (a.itemId && a.collectionName) {
              actions.push({
                type: "collect_by_name",
                itemId: a.itemId,
                collectionName: a.collectionName,
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
          case "acquire_arxiv":
            if (a.idOrUrl?.trim()) {
              actions.push({
                type: "acquire_arxiv",
                idOrUrl: a.idOrUrl.trim(),
              });
            }
            break;
          case "acquire_youtube":
            if (a.url?.trim()) {
              actions.push({
                type: "acquire_youtube",
                url: a.url.trim(),
                mode: a.mode === "audio" ? "audio" : "video",
              });
            }
            break;
          case "acquire_image":
            if (a.prompt?.trim()) {
              actions.push({
                type: "acquire_image",
                prompt: a.prompt.trim(),
                filenameHint: a.filenameHint?.trim() || undefined,
              });
            }
            break;
          case "acquire_openalex":
            if (a.idOrDoi?.trim()) {
              actions.push({
                type: "acquire_openalex",
                idOrDoi: a.idOrDoi.trim(),
              });
            }
            break;
          case "acquire_clip":
            if (a.url?.trim()) {
              actions.push({
                type: "acquire_clip",
                url: a.url.trim(),
              });
            }
            break;
          case "acquire_grokipedia":
            if (a.titleOrSlug?.trim()) {
              actions.push({
                type: "acquire_grokipedia",
                titleOrSlug: a.titleOrSlug.trim(),
              });
            }
            break;
          case "acquire_image_url":
            if (a.url?.trim()) {
              actions.push({
                type: "acquire_image_url",
                url: a.url.trim(),
                filenameHint: a.filenameHint?.trim() || undefined,
              });
            }
            break;
          case "merge_tags":
            if (a.sourceTagIds?.length) {
              actions.push({
                type: "merge_tags",
                sourceTagIds: a.sourceTagIds,
                targetTagId: a.targetTagId,
                targetName: a.targetName?.trim() || undefined,
              });
            }
            break;
          case "rename_tag":
            if (a.tagId && a.name?.trim()) {
              actions.push({
                type: "rename_tag",
                tagId: a.tagId,
                name: a.name.trim(),
                mergeIfExists: a.mergeIfExists,
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
