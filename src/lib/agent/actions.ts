/**
 * Librarian mutations for sole-user local Helix Library.
 *
 * Allowed: catalog / config-location / reindex operations inside the app.
 * Forbidden: shell, deleting project source, wiping the DB, writing arbitrary files.
 *
 * All writes run only after explicit human confirmation (UI button or chat “approve”).
 */

import {
  addItemToCollection,
  addItemsToCollection,
  addTagToItem,
  addTagToItems,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeItemFromCollection,
  removeTagFromItem,
  updateCollection,
} from "@/lib/collections/manage";
import { getItemById, listLocationsWithCounts } from "@/lib/catalog/query";
import {
  addLocation,
  removeLocation,
  updateLocation,
} from "@/lib/locations/manage";
import { startReindexAsync } from "@/lib/indexer/run";

export type LibrarianAction =
  | { type: "reindex" }
  | { type: "tag"; itemId: number; tagName: string }
  | { type: "untag"; itemId: number; tagId: number }
  | { type: "collect"; itemId: number; collectionId: number }
  /** Shelve by collection name (resolves at execute time — use after create in same batch). */
  | { type: "collect_by_name"; itemId: number; collectionName: string }
  | { type: "uncollect"; itemId: number; collectionId: number }
  | { type: "bulk_tag"; itemIds: number[]; tagName: string }
  | { type: "bulk_collect"; itemIds: number[]; collectionId: number }
  | { type: "create_collection"; name: string; description?: string }
  | {
      type: "update_collection";
      collectionId: number;
      name?: string;
      description?: string | null;
    }
  | { type: "delete_collection"; collectionId: number }
  | { type: "set_location_enabled"; locationId: number; enabled: boolean }
  | { type: "add_location"; name: string; root: string }
  | { type: "remove_location"; locationId: number };

export type ActionResult = {
  ok: boolean;
  action: LibrarianAction;
  message: string;
  data?: Record<string, unknown>;
};

const ACTION_TYPES = new Set([
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
]);

/** Serialize one action for chat UI buttons. */
export function formatActionToken(action: LibrarianAction): string {
  return `[[action:${JSON.stringify(action)}]]`;
}

/** Legacy propose tokens used by older local replies. */
export function parseLegacyPropose(payload: string): LibrarianAction | null {
  const p = payload.trim();
  if (p === "reindex") return { type: "reindex" };
  const tag = p.match(/^tag item=(\d+) name=(.+)$/);
  if (tag) {
    return { type: "tag", itemId: Number(tag[1]), tagName: tag[2].trim() };
  }
  const coll = p.match(/^collect item=(\d+) collection=(\d+)$/);
  if (coll) {
    return {
      type: "collect",
      itemId: Number(coll[1]),
      collectionId: Number(coll[2]),
    };
  }
  return null;
}

/**
 * Extract actions from assistant text.
 * Supports `[[action:{json}]]` and legacy `[[propose:...]]`.
 */
export function extractActionsFromText(text: string): LibrarianAction[] {
  const out: LibrarianAction[] = [];
  const seen = new Set<string>();

  const actionRe = /\[\[action:(\{[\s\S]*?\})\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = actionRe.exec(text)) !== null) {
    try {
      const raw = JSON.parse(m[1]) as LibrarianAction;
      if (!raw || typeof raw !== "object" || !ACTION_TYPES.has(raw.type)) {
        continue;
      }
      const key = JSON.stringify(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(raw);
    } catch {
      // skip bad json
    }
  }

  const proposeRe = /\[\[propose:([^\]]+)\]\]/g;
  while ((m = proposeRe.exec(text)) !== null) {
    const legacy = parseLegacyPropose(m[1]);
    if (!legacy) continue;
    const key = JSON.stringify(legacy);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(legacy);
  }

  return out;
}

export function actionLabel(action: LibrarianAction): string {
  switch (action.type) {
    case "reindex":
      return "Approve reindex";
    case "tag":
      return `Tag #${action.itemId}`;
    case "untag":
      return `Remove tag`;
    case "collect":
      return `Shelf #${action.itemId}`;
    case "collect_by_name":
      return `Shelf #${action.itemId}`;
    case "uncollect":
      return `Unshelf`;
    case "bulk_tag":
      return `Tag ${action.itemIds.length} items`;
    case "bulk_collect":
      return `Shelf ${action.itemIds.length} items`;
    case "create_collection":
      return `Create “${action.name}”`;
    case "update_collection":
      return "Update collection";
    case "delete_collection":
      return `Delete collection`;
    case "set_location_enabled":
      return action.enabled ? "Enable location" : "Disable location";
    case "add_location":
      return `Add location`;
    case "remove_location":
      return `Remove location`;
    default:
      return "Approve";
  }
}

export function describeAction(action: LibrarianAction): string {
  switch (action.type) {
    case "reindex":
      return "Refresh the catalog (walk locations; no file changes on disk).";
    case "tag": {
      const item = getItemById(action.itemId);
      return `Tag **${item?.name ?? `#${action.itemId}`}** as \`${action.tagName}\`.`;
    }
    case "untag":
      return `Remove tag #${action.tagId} from item #${action.itemId}.`;
    case "collect": {
      const item = getItemById(action.itemId);
      const col = getCollection(action.collectionId);
      return `Add **${item?.name ?? `#${action.itemId}`}** to shelf **${col?.name ?? action.collectionId}**.`;
    }
    case "collect_by_name": {
      const item = getItemById(action.itemId);
      return `Add **${item?.name ?? `#${action.itemId}`}** to shelf **${action.collectionName}**.`;
    }
    case "uncollect":
      return `Remove item #${action.itemId} from collection #${action.collectionId}.`;
    case "bulk_tag":
      return `Tag ${action.itemIds.length} holdings as \`${action.tagName}\`.`;
    case "bulk_collect": {
      const col = getCollection(action.collectionId);
      return `Add ${action.itemIds.length} holdings to **${col?.name ?? action.collectionId}**.`;
    }
    case "create_collection":
      return `Create collection **${action.name}**${action.description ? ` — ${action.description}` : ""}.`;
    case "update_collection": {
      const col = getCollection(action.collectionId);
      const bits: string[] = [];
      if (action.name !== undefined) bits.push(`name → **${action.name}**`);
      if (action.description !== undefined) {
        bits.push(
          action.description
            ? `description → “${action.description}”`
            : "clear description",
        );
      }
      return `Update shelf **${col?.name ?? action.collectionId}**: ${bits.join(", ") || "no changes"}.`;
    }
    case "delete_collection": {
      const col = getCollection(action.collectionId);
      return `Delete shelf **${col?.name ?? action.collectionId}** (items stay in catalog).`;
    }
    case "set_location_enabled": {
      const loc = listLocationsWithCounts().find(
        (l) => l.id === action.locationId,
      );
      return `${action.enabled ? "Enable" : "Disable"} location **${loc?.name ?? action.locationId}**.`;
    }
    case "add_location":
      return `Add location **${action.name}** at \`${action.root}\`.`;
    case "remove_location": {
      const loc = listLocationsWithCounts().find(
        (l) => l.id === action.locationId,
      );
      return `Remove location **${loc?.name ?? action.locationId}** from catalog config (files untouched).`;
    }
    default:
      return "Perform an in-app action.";
  }
}

function assertItem(id: number) {
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid item id");
  const item = getItemById(id);
  if (!item) throw new Error(`Item #${id} not found`);
  return item;
}

function clampIds(ids: number[], max = 100): number[] {
  const unique = [
    ...new Set(ids.filter((id) => Number.isFinite(id) && id > 0)),
  ];
  if (unique.length === 0) throw new Error("No valid item ids");
  if (unique.length > max) {
    throw new Error(`At most ${max} items per action`);
  }
  return unique;
}

/** Execute a single confirmed action. Never runs shell or deletes project files. */
export function executeLibrarianAction(action: LibrarianAction): ActionResult {
  try {
    switch (action.type) {
      case "reindex": {
        const { jobId, alreadyRunning } = startReindexAsync();
        return {
          ok: true,
          action,
          message: alreadyRunning
            ? `Reindex job #${jobId} already running.`
            : `Started reindex job #${jobId}.`,
          data: { jobId, alreadyRunning },
        };
      }
      case "tag": {
        assertItem(action.itemId);
        const tagName = action.tagName.trim().toLowerCase();
        if (!tagName || tagName.length > 48) {
          throw new Error("Invalid tag name");
        }
        addTagToItem(action.itemId, tagName);
        return {
          ok: true,
          action,
          message: `Tagged item #${action.itemId} as “${tagName}”.`,
        };
      }
      case "untag": {
        assertItem(action.itemId);
        removeTagFromItem(action.itemId, action.tagId);
        return {
          ok: true,
          action,
          message: `Removed tag #${action.tagId} from item #${action.itemId}.`,
        };
      }
      case "collect": {
        assertItem(action.itemId);
        if (!getCollection(action.collectionId)) {
          throw new Error(`Collection #${action.collectionId} not found`);
        }
        addItemToCollection(action.collectionId, action.itemId);
        return {
          ok: true,
          action,
          message: `Shelved item #${action.itemId} → collection #${action.collectionId}.`,
        };
      }
      case "collect_by_name": {
        assertItem(action.itemId);
        const col = findCollectionByName(action.collectionName);
        if (!col) {
          throw new Error(
            `Collection “${action.collectionName}” not found — create it first or approve a create+shelve batch together.`,
          );
        }
        addItemToCollection(col.id, action.itemId);
        return {
          ok: true,
          action,
          message: `Shelved item #${action.itemId} → **${col.name}** (#${col.id}).`,
          data: { collectionId: col.id, name: col.name },
        };
      }
      case "uncollect": {
        assertItem(action.itemId);
        removeItemFromCollection(action.collectionId, action.itemId);
        return {
          ok: true,
          action,
          message: `Removed item #${action.itemId} from collection #${action.collectionId}.`,
        };
      }
      case "bulk_tag": {
        const ids = clampIds(action.itemIds);
        const tagName = action.tagName.trim().toLowerCase();
        if (!tagName) throw new Error("Tag name required");
        const r = addTagToItems(ids, tagName);
        return {
          ok: true,
          action,
          message: `Tagged ${r.tagged} holding(s) as “${tagName}” (${r.skipped} skipped).`,
          data: r,
        };
      }
      case "bulk_collect": {
        const ids = clampIds(action.itemIds);
        const r = addItemsToCollection(action.collectionId, ids);
        return {
          ok: true,
          action,
          message: `Shelved ${r.added} holding(s) (${r.skipped} skipped).`,
          data: r,
        };
      }
      case "create_collection": {
        const name = action.name.trim();
        if (!name) throw new Error("Collection name required");
        const id = createCollection(name, action.description);
        const created = getCollection(id);
        return {
          ok: true,
          action,
          message: `Created collection **${created?.name ?? name}** (#${id}).`,
          data: { id, name: created?.name ?? name },
        };
      }
      case "update_collection": {
        if (action.name === undefined && action.description === undefined) {
          throw new Error("Provide name and/or description to update");
        }
        updateCollection(action.collectionId, {
          name: action.name,
          description: action.description,
        });
        const updated = getCollection(action.collectionId);
        return {
          ok: true,
          action,
          message: `Updated collection **${updated?.name ?? action.collectionId}**.`,
          data: {
            id: action.collectionId,
            name: updated?.name,
            description: updated?.description,
          },
        };
      }
      case "delete_collection": {
        const col = getCollection(action.collectionId);
        if (!col) throw new Error("Collection not found");
        deleteCollection(action.collectionId);
        return {
          ok: true,
          action,
          message: `Deleted collection **${col.name}** (items remain in catalog).`,
        };
      }
      case "set_location_enabled": {
        updateLocation(action.locationId, { enabled: action.enabled });
        return {
          ok: true,
          action,
          message: `Location #${action.locationId} ${action.enabled ? "enabled" : "disabled"}.`,
        };
      }
      case "add_location": {
        const name = action.name.trim();
        const root = action.root.trim();
        if (!name || !root) throw new Error("Name and root path required");
        const { id } = addLocation({ name, root, enabled: true });
        return {
          ok: true,
          action,
          message: `Added location **${name}** (#${id}). Reindex to inventory it.`,
          data: { id },
        };
      }
      case "remove_location": {
        removeLocation(action.locationId);
        return {
          ok: true,
          action,
          message: `Removed location #${action.locationId} from config/catalog (disk untouched).`,
        };
      }
      default:
        return {
          ok: false,
          action,
          message: "Unknown action type.",
        };
    }
  } catch (err) {
    return {
      ok: false,
      action,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute actions in order. After a successful create_collection, later
 * collect_by_name / collect steps can resolve the new shelf in the same batch.
 */
export function executeLibrarianActions(
  actions: LibrarianAction[],
): ActionResult[] {
  const results: ActionResult[] = [];
  let lastCreatedId: number | undefined;
  let lastCreatedName: string | undefined;

  for (const raw of actions) {
    let action = raw;

    // Wire collect → newly created shelf in this batch when id is missing/placeholder.
    if (
      raw.type === "collect" &&
      lastCreatedId != null &&
      (!Number.isFinite(raw.collectionId) || raw.collectionId <= 0)
    ) {
      action = { ...raw, collectionId: lastCreatedId };
    }

    // Prefer name resolution after create in the same batch.
    if (raw.type === "collect_by_name" && lastCreatedName) {
      const want = raw.collectionName.trim().toLowerCase();
      if (
        want === lastCreatedName.toLowerCase() ||
        lastCreatedName.toLowerCase().includes(want) ||
        want.includes(lastCreatedName.toLowerCase())
      ) {
        action = {
          type: "collect",
          itemId: raw.itemId,
          collectionId: lastCreatedId!,
        };
      }
    }

    const result = executeLibrarianAction(action);
    results.push(result);

    if (
      result.ok &&
      raw.type === "create_collection" &&
      typeof result.data?.id === "number"
    ) {
      lastCreatedId = result.data.id as number;
      lastCreatedName = String(result.data.name ?? raw.name);
    }
  }

  return results;
}

/**
 * Handle chat confirm/cancel without involving an LLM.
 * Returns a reply string, or null if the utterance is not confirm/cancel.
 */
export function tryHandleConfirmOrCancel(
  userText: string,
  lastAssistantText: string | null | undefined,
): string | null {
  const q = userText.trim();
  if (!q) return null;

  if (isConfirmUtterance(q)) {
    if (!lastAssistantText?.trim()) {
      return "Nothing pending to approve. Ask me to do something first (e.g. **create collection Outer Space**).";
    }
    const actions = extractActionsFromText(lastAssistantText);
    if (!actions.length) {
      return (
        "The last reply had **no pending action tokens** (`[[action:…]]`), so nothing was executed.\n\n" +
        "That usually means the assistant described a plan without staging it. Ask again in one message " +
        "(e.g. **create collection Outer Space and add HFTZJn-WQAAV0Gp.jpeg**), then **approve** when buttons appear — " +
        "or click **Approve** on a message that shows them."
      );
    }
    const results = executeLibrarianActions(actions);
    return formatActionResults(results);
  }

  if (isCancelUtterance(q)) {
    const actions = lastAssistantText
      ? extractActionsFromText(lastAssistantText)
      : [];
    if (!actions.length) {
      return "No pending plan to cancel.";
    }
    return "Cancelled — pending proposals were not applied. Ask again anytime.";
  }

  return null;
}

export function formatActionResults(results: ActionResult[]): string {
  if (!results.length) return "No actions executed.";
  const lines = results.map((r) => {
    const mark = r.ok ? "✓" : "✗";
    return `${mark} ${r.message}`;
  });
  const ok = results.filter((r) => r.ok).length;
  return `### Done (${ok}/${results.length})\n\n${lines.join("\n")}`;
}

/** Human-readable proposal block for chat. */
export function formatProposalMessage(
  title: string,
  intro: string,
  actions: LibrarianAction[],
): string {
  if (!actions.length) return intro;
  const bullets = actions.map((a) => `• ${describeAction(a)}`).join("\n");
  const tokens = actions.map((a) => formatActionToken(a)).join("\n");
  return `### Proposed: ${title}

${intro}

${bullets}

${tokens}

_Confirm with **approve** / **yes** / **do it**, or click the buttons. Nothing runs until then._

_I will not shell out, delete project source, or wipe the database._`;
}

export function isConfirmUtterance(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /^(yes|yep|yeah|y|ok|okay|sure|go|go ahead|do it|proceed|confirm|approved?|accept|run it|make it so)[!?.]*$/i.test(
      t,
    ) ||
    /^(please\s+)?(approve|confirm|execute|apply)(\s+(all|them|that|this|the plan|the actions?))?[!?.]*$/i.test(
      t,
    ) ||
    /^approve\s+(all|everything|the plan)[!?.]*$/i.test(t)
  );
}

export function isCancelUtterance(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|nope|cancel|nevermind|never mind|stop|don't|dont)[!?.]*$/i.test(
    t,
  );
}

/** Resolve collection by exact or substring name. */
export function findCollectionByName(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const all = listCollections();
  return (
    all.find((c) => c.name.toLowerCase() === n) ??
    all.find((c) => c.name.toLowerCase().includes(n)) ??
    null
  );
}

export function findLocationByName(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const all = listLocationsWithCounts();
  return (
    all.find((l) => l.name.toLowerCase() === n) ??
    all.find((l) => l.name.toLowerCase().includes(n)) ??
    null
  );
}
