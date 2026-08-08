import {
  getItemById,
  listLocationsWithCounts,
  searchCatalog,
} from "@/lib/catalog/query";
import { listCollections } from "@/lib/collections/manage";
import {
  findCollectionByName,
  findLocationByName,
  formatProposalMessage,
  tryHandleConfirmOrCancel,
  type LibrarianAction,
} from "@/lib/agent/actions";
import {
  isGenericHoldingQuery,
  localHoldingReadReply,
} from "@/lib/agent/holding-context";
import { SYSTEM_HELP_TOPICS } from "@/lib/agent/prompt";
import { listMessages } from "@/lib/agent/threads";
import { formatBytes } from "@/lib/format";
import { probeMachine } from "@/lib/machine/probe";
import { ITEM_KINDS, type ItemKind } from "@/lib/types";

/**
 * Local Librarian: catalog tools + approval-gated mutations.
 * No cloud LLM. Sole-user local system.
 */

function detectKind(q: string): ItemKind | undefined {
  const lower = q.toLowerCase();
  const map: Array<[RegExp, ItemKind]> = [
    [/\b(images?|photos?|pictures?|jpe?g|png|webp)\b/, "image"],
    [/\b(videos?|movies?|mp4|clips?)\b/, "video"],
    [/\b(audio|music|mp3|sound)\b/, "audio"],
    [/\b(pdfs?|documents?|docs?)\b/, "document"],
    [/\b(code|scripts?|source)\b/, "code"],
    [/\b(notes?|markdown|text files?)\b/, "text"],
    [/\b(archives?|zips?)\b/, "archive"],
  ];
  for (const [re, kind] of map) {
    if (re.test(lower)) return kind;
  }
  return undefined;
}

function stripNoise(q: string): string {
  return q
    .replace(
      /\b(where is|where's|find|locate|search for|show me|list|get me|do i have|have i got|can you|please|what|which|are|is|in|on|the|my|a|an|all|any|available|archive|library|catalog|holdings?|files?|there)\b/gi,
      " ",
    )
    .replace(
      /\b(images?|photos?|pictures?|jpe?g|png|webp|videos?|movies?|mp4|clips?|audio|music|mp3|pdfs?|documents?|docs?|notes?|markdown|code|scripts?)\b/gi,
      " ",
    )
    .replace(/[?!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatItemLine(item: {
  id: number;
  name: string;
  kind: string;
  locationName?: string;
  location?: string;
  path: string;
  sizeBytes: number;
}): string {
  const loc = item.locationName ?? item.location ?? "";
  return `• [${item.name}](/catalog/${item.id}) (${item.kind}) — ${loc}
  Path: \`${item.path}\` · ${formatBytes(item.sizeBytes)}`;
}

function lastAssistantContent(threadId: number | undefined): string | null {
  if (threadId == null) return null;
  const msgs = listMessages(threadId);
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant" && msgs[i].content.trim()) {
      return msgs[i].content;
    }
  }
  return null;
}

function resolveSearchHits(q: string, limit = 8) {
  return searchCatalog({
    q: q.replace(/\b(the|my|a|an)\b/gi, " ").trim(),
    pageSize: limit,
  });
}

export function localLibrarianReply(
  userText: string,
  opts?: { threadId?: number; holdingItemId?: number | null },
): string {
  const q = userText.trim();
  const threadId = opts?.threadId;
  const holdingItemId =
    opts?.holdingItemId != null &&
    Number.isFinite(opts.holdingItemId) &&
    opts.holdingItemId > 0
      ? Math.floor(opts.holdingItemId)
      : null;

  // --- Active holding short-circuit (PR2): catalog_read path first ---
  if (holdingItemId != null && isGenericHoldingQuery(q)) {
    const reply = localHoldingReadReply(holdingItemId, q);
    if (reply) return reply;
  }

  if (!q) {
    return "Ask me to find a file, curate shelves/tags, reindex, or manage locations. Mutations need your **approve**.";
  }

  const lower = q.toLowerCase();

  // --- Confirm / cancel pending proposals (no LLM — real DB writes) ---
  {
    const handled = tryHandleConfirmOrCancel(q, lastAssistantContent(threadId));
    if (handled != null) return handled;
  }

  // --- Mutation proposals ---

  // reindex (action, not how-to)
  if (
    /\breindex\b/.test(lower) &&
    !/\b(how|what|explain|mean|does)\b/.test(lower)
  ) {
    return formatProposalMessage(
      "Reindex",
      "Refresh the catalog from enabled locations. Files on disk are not modified.",
      [{ type: "reindex" }],
    );
  }

  // acquire arxiv: "fetch arxiv 1706.03762" / "acquire paper 2604.01262"
  {
    const arxivIntent =
      /\b(fetch|get|download|acquire|pull)\b/.test(lower) &&
      /\b(arxiv|paper)\b/.test(lower);
    if (arxivIntent) {
      const idMatch =
        q.match(
          /\b(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)\b/i,
        ) ||
        q.match(
          /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i,
        ) ||
        q.match(/arxiv:\s*(\S+)/i);
      const idOrUrl = idMatch?.[1] ?? idMatch?.[0];
      if (idOrUrl) {
        return formatProposalMessage(
          "Acquire arXiv",
          "Downloads the PDF into Archive and reindexes. Network required; approve to start a background job.",
          [{ type: "acquire_arxiv", idOrUrl: idOrUrl.trim() }],
        );
      }
      return "Give an arXiv id or abs URL, e.g. **fetch arxiv 1706.03762**.";
    }
  }

  // acquire youtube: "download youtube https://..."
  {
    const ytIntent =
      /\b(download|fetch|acquire|pull|get)\b/.test(lower) &&
      /\b(youtube|youtu\.be|podcast|video)\b/.test(lower);
    const urlMatch = q.match(/https?:\/\/[^\s<>"']+/i);
    if (ytIntent && urlMatch) {
      const mode = /\b(audio|mp3|podcast)\b/.test(lower) ? "audio" : "video";
      return formatProposalMessage(
        "Acquire media",
        `yt-dlp ${mode} into Archive. Network required; approve to start a background job.`,
        [
          {
            type: "acquire_youtube",
            url: urlMatch[0].replace(/[),.;]+$/, ""),
            mode,
          },
        ],
      );
    }
    if (ytIntent && !urlMatch) {
      return "Paste a full **https** YouTube/podcast URL, e.g. **download youtube https://…**.";
    }
  }

  // generate image
  {
    const imgMatch = q.match(
      /\b(?:generate|make|create)\s+(?:an?\s+)?(?:grok\s+)?image\s+(?:of\s+|for\s+|prompt\s+)?(.+)$/i,
    );
    if (imgMatch) {
      const prompt = imgMatch[1].replace(/^["']|["']$/g, "").trim();
      if (prompt.length >= 3) {
        return formatProposalMessage(
          "Acquire Grok image",
          "Needs XAI_API_KEY. Saves under archive/images and reindexes after approve.",
          [{ type: "acquire_image", prompt }],
        );
      }
    }
  }

  // Multi-step first: create collection X and put/place/add Y (one approve batch)
  const createAndShelve = q.match(
    /\b(?:create|make|new)\s+(?:a\s+)?(?:collection|shelf)\s+(?:titled\s+|called\s+|named\s+)?(.+?)\s+and\s+(?:add|put|place|shelve)\s+(.+)$/i,
  );
  if (createAndShelve) {
    const colName = createAndShelve[1]
      .replace(/^["']|["']$/g, "")
      .replace(/[.!]+$/, "")
      .trim();
    const itemQ = createAndShelve[2]
      .replace(/\b(to it|on it|into it|inside of it|inside it|in it)\b/gi, "")
      .replace(/^["']|["']$/g, "")
      .replace(/[.!]+$/, "")
      .trim();
    if (colName.length >= 1 && colName.length <= 80) {
      const hits = resolveSearchHits(itemQ, 5);
      if (hits.total === 0) {
        return formatProposalMessage(
          "Create collection",
          `No holdings matched “${itemQ}” yet — I can still create the shelf **${colName}**.`,
          [{ type: "create_collection", name: colName }],
        );
      }
      const item = hits.items[0];
      const actions: LibrarianAction[] = [
        { type: "create_collection", name: colName },
        {
          type: "collect_by_name",
          itemId: item.id,
          collectionName: colName,
        },
      ];
      return formatProposalMessage(
        "Create collection & shelve",
        `One approval will create **${colName}** and add **${item.name}**.`,
        actions,
      );
    }
  }

  // create collection (title only — not multi-step create+shelve)
  const createCol =
    lower.match(
      /\b(?:create|make|new)\s+(?:a\s+)?(?:collection|shelf)\s+(?:titled\s+|called\s+|named\s+)?["']?(.+?)["']?\s*$/,
    ) ||
    lower.match(
      /\b(?:create|make)\s+(?:collection|shelf)\s+["']([^"']+)["']/,
    );
  if (createCol && !/\band\s+(?:add|put|place|shelve)\b/.test(lower)) {
    const name = createCol[1].replace(/[.!]+$/, "").trim();
    if (name.length >= 1 && name.length <= 80) {
      return formatProposalMessage(
        "Create collection",
        "Adds a shelf in the catalog only (no files moved).",
        [{ type: "create_collection", name }],
      );
    }
  }

  // rename collection: "rename collection X to Y"
  const renameCol = lower.match(
    /\b(?:rename|retitle)\s+(?:collection|shelf)\s+(.+?)\s+to\s+["']?(.+?)["']?\s*$/,
  );
  if (renameCol) {
    const col = findCollectionByName(renameCol[1].trim());
    if (!col) return `No collection matching “${renameCol[1]}”.`;
    const newName = renameCol[2].replace(/[.!]+$/, "").trim();
    return formatProposalMessage(
      "Rename collection",
      `**${col.name}** → **${newName}** (title-cased on save).`,
      [
        {
          type: "update_collection",
          collectionId: col.id,
          name: newName,
        },
      ],
    );
  }

  // set description: "describe collection X as ..." / "set description of collection X to ..."
  const descCol =
    lower.match(
      /\b(?:describe|set description of)\s+(?:collection|shelf)\s+(.+?)\s+(?:as|to)\s+["']?(.+?)["']?\s*$/,
    ) ||
    lower.match(
      /\bset\s+(?:collection|shelf)\s+(.+?)\s+description\s+to\s+["']?(.+?)["']?\s*$/,
    );
  if (descCol) {
    const col = findCollectionByName(descCol[1].trim());
    if (!col) return `No collection matching “${descCol[1]}”.`;
    const description = descCol[2].replace(/[.!]+$/, "").trim();
    return formatProposalMessage(
      "Update description",
      `Shelf **${col.name}** description → “${description}”.`,
      [
        {
          type: "update_collection",
          collectionId: col.id,
          description,
        },
      ],
    );
  }

  // delete collection
  const delCol = lower.match(
    /\b(?:delete|remove)\s+(?:collection|shelf)\s+(?:called\s+|named\s+)?["']?(.+?)["']?\s*$/,
  );
  if (delCol) {
    const col = findCollectionByName(delCol[1].replace(/[.!]+$/, "").trim());
    if (!col) {
      return `No collection matching “${delCol[1]}”.`;
    }
    return formatProposalMessage(
      "Delete collection",
      "Removes the shelf only. Holdings stay in the catalog and on disk.",
      [{ type: "delete_collection", collectionId: col.id }],
    );
  }

  // enable / disable location
  const locToggle = lower.match(
    /\b(enable|disable)\s+location\s+(?:called\s+|named\s+)?["']?(.+?)["']?\s*$/,
  );
  if (locToggle) {
    const loc = findLocationByName(locToggle[2].replace(/[.!]+$/, "").trim());
    if (!loc) return `No location matching “${locToggle[2]}”.`;
    const enabled = locToggle[1] === "enable";
    return formatProposalMessage(
      enabled ? "Enable location" : "Disable location",
      enabled
        ? "Location will appear in catalog after the next reindex."
        : "Holdings from this root will hide from search (files stay).",
      [
        {
          type: "set_location_enabled",
          locationId: loc.id,
          enabled,
        },
      ],
    );
  }

  // add location: "add location Name at /path"
  const addLoc = lower.match(
    /\badd\s+location\s+(.+?)\s+(?:at|path)\s+(.+)$/,
  );
  if (addLoc) {
    const name = addLoc[1].trim();
    const root = addLoc[2].trim().replace(/^["']|["']$/g, "");
    return formatProposalMessage(
      "Add location",
      "Registers a scan root (must already exist on disk). Reindex afterward to inventory.",
      [{ type: "add_location", name, root }],
    );
  }

  // tag item
  const tagMatch =
    lower.match(
      /\btag\s+(?:item\s*#?\s*)?(\d+)\s+(?:as|with)\s+([a-z0-9][\w-]{0,40})\b/,
    ) ||
    lower.match(/\btag\s+(.+?)\s+(?:as|with)\s+([a-z0-9][\w-]{0,40})\b/);
  if (tagMatch) {
    const left = tagMatch[1];
    const tagName = tagMatch[2];
    if (/^\d+$/.test(left)) {
      const item = getItemById(Number(left));
      if (!item) return `No catalog item with id **${left}**.`;
      return formatProposalMessage(
        "Tag holding",
        describeShort(item.name, tagName),
        [{ type: "tag", itemId: item.id, tagName }],
      );
    }
    const hits = resolveSearchHits(left, 5);
    if (hits.total === 0) {
      return `No holdings matched “${left}” to tag as \`${tagName}\`.`;
    }
    if (hits.items.length === 1) {
      const item = hits.items[0];
      return formatProposalMessage(
        "Tag holding",
        describeShort(item.name, tagName),
        [{ type: "tag", itemId: item.id, tagName }],
      );
    }
    // Multiple: propose bulk if "all", else one-each
    if (/\ball\b/.test(lower) || hits.total <= 5) {
      const actions: LibrarianAction[] = hits.items.map((item) => ({
        type: "tag" as const,
        itemId: item.id,
        tagName,
      }));
      return formatProposalMessage(
        `Tag ${hits.items.length} holdings`,
        `Matched “${left}” — approve to tag each as \`${tagName}\`.`,
        actions,
      );
    }
    return formatProposalMessage(
      "Tag (pick one)",
      `Several matches for “${left}”. Approving runs **all** listed, or refine the name.`,
      hits.items.map((item) => ({
        type: "tag" as const,
        itemId: item.id,
        tagName,
      })),
    );
  }

  // shelve: add X to collection Y
  const collMatch = lower.match(
    /\b(?:add|put|shelve)\s+(.+?)\s+(?:to|on|into)\s+(?:collection|shelf)\s+(.+)$/,
  );
  if (collMatch) {
    const qPart = collMatch[1]
      .replace(/\b(the|my|a|an|item)\b/gi, " ")
      .trim();
    const colPart = collMatch[2].replace(/[.!]+$/, "").trim();
    const col = findCollectionByName(colPart);
    if (!col) {
      return `No collection named “${colPart}”. Say **create collection ${colPart}** first, or open [/collections](/collections).`;
    }
    const idOnly = qPart.match(/^#?(\d+)$/);
    if (idOnly) {
      const item = getItemById(Number(idOnly[1]));
      if (!item) return `No catalog item with id **${idOnly[1]}**.`;
      return formatProposalMessage(
        "Add to shelf",
        `**${item.name}** → **${col.name}**`,
        [{ type: "collect", itemId: item.id, collectionId: col.id }],
      );
    }
    const hits = resolveSearchHits(qPart, 5);
    if (hits.total === 0) {
      return `No holdings matched “${qPart}” for shelf **${col.name}**.`;
    }
    if (hits.items.length === 1) {
      const item = hits.items[0];
      return formatProposalMessage(
        "Add to shelf",
        `**${item.name}** → **${col.name}**`,
        [{ type: "collect", itemId: item.id, collectionId: col.id }],
      );
    }
    return formatProposalMessage(
      `Shelf ${hits.items.length} matches`,
      `“${qPart}” → **${col.name}**. Approve to add all listed.`,
      hits.items.map((item) => ({
        type: "collect" as const,
        itemId: item.id,
        collectionId: col.id,
      })),
    );
  }

  // Help topics
  if (
    /\b(how (do|to)|help|what is (?:non-os|helix(?: library)?)|explain)\b/.test(lower) ||
    /\b(add location|scan root)\b/.test(lower) ||
    (/\breindex\b/.test(lower) &&
      /\b(how|what|explain|mean|does)\b/.test(lower))
  ) {
    if (/\breindex\b/.test(lower)) {
      return `### Reindex\n\n${SYSTEM_HELP_TOPICS.reindex}\n\nSay **reindex now** — I will propose it; you approve.`;
    }
    if (/\blocation\b/.test(lower)) {
      return `### Locations\n\n${SYSTEM_HELP_TOPICS.locations}`;
    }
    if (/\bcollection\b/.test(lower) || /\btag\b/.test(lower)) {
      return `### Collections\n\n${SYSTEM_HELP_TOPICS.collections}\n\nI can also **create collection …**, **tag … as …**, **add … to collection …** with your approve.`;
    }
    if (/\bsearch\b/.test(lower) || /\bcatalog\b/.test(lower)) {
      return `### Search\n\n${SYSTEM_HELP_TOPICS.search}`;
    }
    if (/\bsafe|privacy|security\b/.test(lower)) {
      return `### Safety\n\n${SYSTEM_HELP_TOPICS.safety}`;
    }
    return `### Overview\n\n${SYSTEM_HELP_TOPICS.overview}\n\n_(Local mode — no API key. I can mutate the catalog **after you approve**.)_`;
  }

  // Machine
  if (
    /\b(machine|disk|memory|ram|cpu|hostname|load|building|facility|status|ffprobe)\b/.test(
      lower,
    )
  ) {
    const m = probeMachine();
    const disk = m.disk
      ? `${formatBytes(m.disk.free)} free / ${formatBytes(m.disk.total)}`
      : "—";
    const job = m.latestJob
      ? `#${m.latestJob.id} ${m.latestJob.status}`
      : "none yet";
    return `### Machine (brick & mortar)

- **Host:** ${m.hostname} · ${m.platform} ${m.release}
- **CPUs:** ${m.cpuCount} · load ${m.loadavg.map((n) => n.toFixed(2)).join(" / ")}
- **Memory:** ${formatBytes(m.memory.used)} used / ${formatBytes(m.memory.total)}
- **Disk /**: ${disk}
- **Bind:** ${m.bind}:${m.port}
- **ffprobe:** ${m.tools.ffprobe ? "available" : "not found"}
- **ffmpeg:** ${m.tools.ffmpeg ? "available" : "not found"}
- **exiftool:** ${m.tools.exiftool ? "available" : "not found (optional)"}
- **pdftotext:** ${m.tools.pdftotext ? "available" : "not found (pdf-parse fallback)"}
- **Last reindex job:** ${job}

Paths still come only from catalog tools.`;
  }

  // Locations list
  if (
    /\b(locations?|scan roots?|branches?)\b/.test(lower) &&
    !/\b(in|under|from|enable|disable|add)\b/.test(lower)
  ) {
    const locations = listLocationsWithCounts();
    if (!locations.length) {
      return "No locations configured. Say **add location Archive at ./archive** (after the folder exists) or use **Locations** in the UI.";
    }
    const lines = locations.map(
      (l) =>
        `• **${l.name}** ${l.enabled ? "" : "(disabled) "}— \`${l.rootPath}\` · ${l.itemCount} holdings`,
    );
    return `### Locations\n\n${lines.join("\n")}`;
  }

  // Collections list
  if (
    /\bcollections?\b/.test(lower) &&
    !/\bin collection\b/.test(lower) &&
    !/\b(create|delete|add|put|shelve)\b/.test(lower)
  ) {
    const collections = listCollections();
    if (!collections.length) {
      return "No collections yet. Say **create collection STEM** or open **/collections**.";
    }
    const lines = collections.map(
      (c) =>
        `• **${c.name}** — ${c.itemCount} item${c.itemCount === 1 ? "" : "s"} → /collections/${c.id}`,
    );
    return `### Collections\n\n${lines.join("\n")}`;
  }

  // Explicit item id
  const idMatch =
    q.match(/\b(?:item|catalog)\s*#?\s*(\d+)\b/i) || q.match(/^#?(\d+)$/);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const item = getItemById(id);
    if (!item) return `No catalog item with id **${id}**.`;
    return `### Item #${id}\n\n${formatItemLine(item)}`;
  }

  // Catalog search
  const kind = detectKind(q);
  let query = stripNoise(q);
  if (
    kind &&
    (!query || query.length < 2 || ITEM_KINDS.includes(query as ItemKind))
  ) {
    query = "";
  }

  const result = searchCatalog({
    q: query,
    kind: kind ?? "",
    page: 1,
    pageSize: 12,
  });

  if (result.total === 0) {
    return `No holdings matched${query ? ` “${query}”` : ""}${kind ? ` (${kind})` : ""}.

Try a filename fragment, **reindex now**, or browse the [catalog](/catalog).`;
  }

  const header = kind
    ? `### Found ${result.total} ${kind} holding${result.total === 1 ? "" : "s"}${query ? ` for “${query}”` : ""}`
    : `### Found ${result.total} holding${result.total === 1 ? "" : "s"}${query ? ` for “${query}”` : ""}`;

  const lines = result.items.map((item) => formatItemLine(item));
  const more =
    result.total > result.items.length
      ? `\n\n…and ${result.total - result.items.length} more in the [catalog](/catalog${query ? `?q=${encodeURIComponent(query)}` : ""}).`
      : "";

  return `${header}\n\n${lines.join("\n\n")}${more}

_Tasks: **tag X as Y**, **add X to collection Z**, **create collection …**, **reindex now** — then **approve**._`;
}

function describeShort(name: string, tag: string) {
  return `**${name}** → tag \`${tag}\``;
}
