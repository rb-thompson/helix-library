# Season Design: Discovery Depth & Reading Room — Helix Library

| Field | Value |
| --- | --- |
| **Document** | Season design — Discovery depth & reading room |
| **Author** | Helix owner + design loop |
| **Date** | 2026-08-06 |
| **Status** | **Implemented** (PR1a–PR5 + PR7 on main, 2026-08-07) — rev 3; PR6 `item_events` in review (`discovery/pr6-item-events`) |
| **Approval** | Owner approved design + PR plan; required PRs landed |
| **Workspace** | `/home/brandon/Projects/non-os` (package `helix-library`) |
| **Baseline tip** | `7fcfdd3` on `main` (synced with origin; 83 tests pass) |
| **Prior season** | [Curation & intake integrity](./2026-08-curation-intake.md) — **Implemented** PR1–PR7 |
| **Audience** | Senior engineers implementing on `main` |
| **Revision** | rev 3 (2026-08-06) — smart-shelf id expansion vs pageSize clamp |

---

## Overview

Helix Library is a localhost personal OPAC: Next.js 15 App Router + SQLite FTS5 over explicit scan roots, hybrid catalog search, media preview, collections/tags, 3D knowledge graph, Ask the Librarian (Grok/local), Acquire desk, weeding, rescue, and unified jobs.

**Curation & intake** made holdings *curatable* (titles, tag provenance, jobs, rescue, graph filters). This season makes holdings *usable in place*: **find → open → understand → return**, without becoming Zotero, Immich, or a full e-reader platform.

**Season thesis:** **Discovery depth & reading room.** Deepen the open/understand half of the OPAC loop—continuous document reading with memory, structural related holdings, query-backed smart shelves, graph scale that stays personal-library sized, and a thin bridge from a holding into Ask—while staying single-user, localhost-first, and approval-gated.

Success looks like: open a PDF or note and resume where you left off; see “same shelf / same folder / shared tags” neighbors without leaving the holding; pin a catalog filter as a living smart shelf; browse the graph at multi-k without the tab locking; ask the librarian about *this* holding with `catalog_read` context already in play.

---

## Background & Motivation

### What the prior season shipped (Curation & intake — FULL)

Design: `docs/designs/2026-08-curation-intake.md` (status **Implemented**).

| PR | Theme landed |
| --- | --- |
| 1 | `items.title` + `title_source` + `displayTitle()` + arXiv enrich; reindex preserves non-filename titles |
| 2 | `item_tags.source` + backfill; merge/rename tags |
| migrate fix | legacy `item_tags.source` via `ensureColumn` |
| 3 | Unified SQLite `jobs` + Services `JobsPanel` |
| 4 | Ask `acquire_*` after approve → async job |
| 5 | Home rescue desk, `?untagged=1`, client open history (`helix-open-history`) |
| 6 | Graph server filters + catalog **Map these** |
| 7 | `tags.hidden`, manual title editor, agent merge/rename, header jobs strip, PDF/YT titles |

**Product today (anchors in tree):**

| Area | Reality |
| --- | --- |
| PDF / text “read” | Browser `<iframe src=/api/media/{id}>` for PDF; 64 KB text preview in theater; collapsible `ExtractedTextPanel` shows first ~1.2k of FTS body only (`ItemMediaViewer.tsx`, `ExtractedTextPanel.tsx`, `media/preview.ts`) |
| PDF extract | `extractPdfText` / `extractPdfTitle` in `src/lib/indexer/pdf.ts` → `item_text` + FTS at reindex (`enrich.ts`, `run.ts`). Cap ~40k chars. Not a page-addressable reader. |
| Agent read | `catalog_read` / `catalog_get` in `src/lib/agent/tools.ts` — body from `item_text`, max 24k to model. No UI “about this holding” entry. |
| Open history | Client-only `src/lib/client/open-history.ts` + `OpenHistoryRecorder` on item detail. No server events, no scroll/page position. |
| Collections | Manual shelves only: `collections` + `collection_items` (`collections/manage.ts`). No query-as-shelf. |
| Related | Lightbox neighbors are same-kind media or collection members for image/video/audio only (`catalog/[id]/page.tsx`). Documents get no structural “more like this”. |
| Graph | `buildKnowledgeGraph` caps 600/800 items, 36–48 tags (`graph/build.ts`); client `KnowledgeGraph.tsx` (~1k lines) is **3D only** (`3d-force-graph`). Filtered graphs help; force layout still heavy at multi-k. |
| Search | Hybrid FTS + LIKE in `catalog/query.ts`; `CatalogSearchParams` already has `q`, `kind`, `locationId`, `collectionId`, `tagId`, `under`, missing/untagged. No embeddings. |
| Brand | `public/helix-mark.{png,webp,jpg}` + `HelixMark.tsx` — no dedicated light-theme mark asset. |

### Pain points (post-curation gaps)

1. **Preview ≠ reading room.** PDF is a passive iframe; notes are truncated; no page/scroll memory; selection cannot tag or ask; user bounces to external readers and loses OPAC context.
2. **Open is a dead end for discovery.** After opening a paper, there is no “same folder / shared tags / co-shelved” rail—only metadata + curation sidebar.
3. **Filters are ephemeral.** Powerful catalog query state (`under`, tag, kind, q) dies when the tab closes; manual shelves require hand-filing every item.
4. **Graph at scale still hurts.** Caps truncate truthfully but UX does not explain the sample; 3D WebGL is overkill (and costly) for many “show me this cluster” sessions.
5. **Ask and holdings are weakly coupled.** Librarian can `catalog_read` if the model finds the id; the item page cannot prefill “ask about this holding.”
6. **Recent opens are browser-local only.** Fine for sole machine sole browser; weak for “what did I open this week” after cache clear or second profile.

### Constraints (non-negotiable)

From `AGENTS.md` / product hard rules:

1. **Localhost by default** — loopback bind; LAN only with password + explicit env.
2. **Explicit scan roots** — never default-scan `$HOME`.
3. **Librarian mutations approval-gated** — no shell, no unsolicited writes, no deleting project source.
4. **SuperGrok ≠ developer API** — in-app Grok needs `XAI_API_KEY`.
5. **Paths from tools only** — agent must not invent file paths.
6. **Media serve gated** — `/api/media/[id]` only under enabled location roots (`media/serve.ts`).
7. **Do not commit** `library.config.json`, `data/`, personal `archive/**`, secrets.

Additional season constraints:

- Prefer **editing existing modules** over new frameworks.
- No multi-user SaaS, no federated live catalog, no arbitrary agent shell.
- Reading room must not become a second catalog or offline-first sync product.
- Related / smart shelves stay **structural and query-backed**, not vector-first.

---

## Goals & Non-Goals

### Goals (season)

| # | Theme | Outcome |
| --- | --- | --- |
| **G1** | Document reading room | Continuous PDF + text/code reading UX on holding detail (or dedicated focus mode); remember last page/scroll per item; usable on phone→desktop. |
| **G2** | Read → act | Select text → **direct** tag UI (manual source) and/or “Ask about selection”; one-click **Ask about this holding** with server `holdingItemId` → `catalog_read`. |
| **G3** | Related holdings | Structural neighbors: same directory, shared tags, shared collections; ranked panel on item detail; links into catalog/`under` where natural. |
| **G4** | Smart shelves | Saved catalog queries as auto-updating collections; **single resolve facade** for list counts, catalog filter, graph filter, paginated detail; hard-fail add-to-smart. |
| **G5** | Graph scale | `meta.totalItems` caps UX + **2D `force-graph`** (MIT, transpilePackages); progressive expand optional; hard max ≤ 800. |
| **G6** | Stretch (pick one) | **Server open events** (`item_events`) dual-write with localStorage so rescue/home can show durable recent opens; optional reading-position column later. |
| **G7** | Polish | Light-theme brand mark asset + SESSION-HANDOFF / `/docs` / PRODUCT notes for the season. |

### Non-goals (this season)

| Out of scope | Why |
| --- | --- |
| Multi-user / hosted Helix / multi-tenant auth | Product hard boundary |
| Full SBERT / embeddings as **primary** search | Optional later season; hybrid FTS stays primary |
| Full Zotero (citations, CSL, PDF annotations DB, sync) | Weight and metaphor drift |
| Immich-style photo product, OCR pipeline for every scan | Host tools optional; no mandatory OCR |
| Live OpenAlex / Semantic Scholar as catalog backend | Acquire search-then-save only if ever; not this season |
| Federated live catalog | Privacy / localhost |
| Arbitrary agent shell or unsolicited disk writes | Hard constraint |
| Full-text re-extract every page on open | Keep reindex-time `item_text`; reader uses original file + optional indexed body |
| Infinite graph / remove all caps | Sampled constellation remains intentional |
| Export/backup product, yt-dlp deno runtime, watch status UI | Deferred (known gaps elsewhere) |
| Annotation layers (highlights stored as first-class objects) | Selection → tag/ask is enough; no PDF annotation store |

---

## Proposed Design

### Architecture (season delta)

```mermaid
flowchart TB
  subgraph UI
    Detail["/catalog/id item detail"]
    Room[DocumentReadingRoom]
    Related[RelatedHoldingsPanel]
    Smart[Smart shelves UI]
    Graph["/graph 2D|3D"]
    Ask["/ask + holding context"]
    Home[Home recent / rescue]
  end

  subgraph ClientMem
    PosLS[helix-read-position]
    OpenLS[helix-open-history]
  end

  subgraph Lib
    Media["/api/media/id gated serve"]
    TextAPI["/api/items/id/text"]
    Query[searchCatalog]
    Rel[getRelatedHoldings]
    Resolve[resolveCollectionItemIds]
    GraphBuild[buildKnowledgeGraph]
    Events[recordItemEvent optional]
    Agent["/api/ask + holdingItemId"]
  end

  subgraph DB
    Items[items]
    ItemText[item_text]
    Coll[collections + query_json]
    CollItems[collection_items manual only]
    Ev[item_events stretch]
  end

  Detail --> Room
  Detail --> Related
  Room -->|PDF bytes Range| Media
  Room -->|text/code| TextAPI
  Room --> PosLS
  Room -->|Ask about holding| Ask
  Related --> Rel --> Items
  Smart --> Resolve
  Resolve -->|smart| Query
  Resolve -->|manual| CollItems
  Query --> Items
  Query --> ItemText
  Query --> Resolve
  Graph --> GraphBuild
  GraphBuild --> Resolve
  Ask --> Agent --> ItemText
  Detail --> OpenLS
  Detail -.->|stretch dual-write| Events
  Events --> Ev
  Home --> OpenLS
  Home -.-> Ev
  Coll --> Resolve
```

### OPAC loop (product metaphor)

| Library metaphor | Helix behavior this season |
| --- | --- |
| Find in catalog | Existing hybrid search + filters (unchanged core) |
| Open holding | Item detail + **reading room** for documents/text |
| Read in reading room | Continuous view, resume position, select → tag/ask |
| Related on the shelf | Structural related rail |
| Smart shelf / standing order | Saved query collections |
| Map of the stacks | Graph with 2D/progressive scale UX |
| Ask a librarian about a book | Prefilled Ask with holding id + `catalog_read` |

---

### Theme A — Document reading room (G1, G2)

#### Product shape

**Reading room** is the document/text focus surface for holdings where preview today is inadequate:

| Kind / mime | Today | This season |
| --- | --- | --- |
| PDF (`document` + pdf mime/ext) | `<iframe>` media theater | `DocumentReadingRoom` (page-aware viewer) replacing/augmenting theater |
| `text` / `code` | 64 KB `<pre>` | Full continuous reader (stream or chunked fetch; still media-gated) |
| Other documents (docx, etc.) | often `none` | Unchanged unless already extracted text only — show indexed body in room if present |
| Image/video/audio | theater + lightbox | Unchanged |

Placement: **primary surface on item detail** for document/text/code (same column as today’s `ItemMediaViewer`), not a separate global app. Optional **“Focus room”** query flag `?room=1` expands layout (hide secondary chrome on small screens) without a new top-level nav item.

#### PDF approach (chosen)

Use **PDF.js** client-side against existing gated media URL `/api/media/{id}`.

**Verified fact (no route change needed):** `GET /api/media/[id]` already sends `Accept-Ranges: bytes` and honors `Range` (206) — PDF.js progressive range fetches work without inventing a byte API.

##### PR1b spike checklist (required — do not invent a second path)

```text
1. Direct dep pin: "pdfjs-dist": "5.4.296" (match pdf-parse transitive; no second major).
2. Worker (same origin only):
   copy node_modules/pdfjs-dist/build/pdf.worker.min.mjs → public/pdf.worker.min.mjs
   (verify exact filename for 5.4.x; adjust if package layout differs).
   GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs".
3. DocumentReadingRoom: "use client"; dynamic import of pdfjs-dist (not serverExternalPackages
   unless proven necessary). Optional: wrap room in next/dynamic({ ssr: false }) from item page.
4. getDocument({ url: `/api/media/${id}`, withCredentials: false }).
5. Ship **page canvas + text layer** in foundation PDF work (even if selection toolbar is PR2).
   Import PDF.js text-layer CSS; selection is a G2 prerequisite — canvas-only is not mergeable for PR1b.
6. Modes: **page** first (keyboard ←/→, page input); continuous scroll only if cheap after page mode green.
7. Fallback: existing iframe path in ItemMediaViewer when getDocument rejects / worker fails.
8. Manual smoke: DevTools Network shows 206 Range; large PDF page nav; phone; password-protected →
   clear error + Download; image-only PDF → empty selection but holding-level Ask/Tag still work.
9. next.config.ts: do **not** add pdfjs-dist to serverExternalPackages for the reader; keep client-bundled.
   (pdf-parse remains server-external for indexer.)
10. Soft size warning when sizeBytes > 50 MiB; still attempt page-at-a-time render.
```

- Do **not** re-parse PDF on the server for each open; do **not** store per-page blobs in SQLite.
- Prefer thin `pdfjs-dist` + own component over `react-pdf` (bundle control) — **Q4 resolved**.

**Rejected for primary:** bare browser PDF plugin only — no reliable selection/tag.

**Fallback:** iframe + Download always available; PR1 can merge with text path even if PDF.js is temporarily behind `?pdfjs=1` during spike (see PR plan).

#### Text / code approach (**decided route**)

**Dedicated JSON API only** — do not overload `/api/media` with `?text=1` (media stays binary/Range).

```http
GET /api/items/[id]/text?max=524288
```

Response JSON:

```ts
{ text: string; truncated: boolean; byteLength: number; encoding: "utf-8" }
```

Rules:

| Rule | Detail |
| --- | --- |
| Jail | `resolveMediaItem(id)` — enabled location, realpath under root, file on disk |
| Allowlist | After resolve, require `kind ∈ {text, code}` **or** `mime` starts with `text/`; reject others with 415 |
| Binary guard | Same null-byte heuristic as `loadMediaPreview` in `preview.ts` → 415 |
| Cap | Default max **512 KiB**; clamp query `max` to [1 KiB, 512 KiB] |
| Encoding | UTF-8 only; document in API |
| Missing | 404 if item missing / not resolvable |

- Indexed `item_text` remains the source for FTS + **Ask** (`catalog_read`); room may toggle “Show indexed sample” vs “Full file (capped)” when they differ.
- Syntax highlighting: **non-goal** this season (plain monospaced).
- Prefer client-fetch in room over stuffing large bodies into RSC HTML props.

#### Position memory (last page / scroll)

Client-first (matches open-history pattern):

```ts
// src/lib/client/read-position.ts
export type ReadPosition = {
  itemId: number;
  /** 1-based PDF page; omit for pure scroll docs */
  page?: number;
  /** 0..1 scroll progress for continuous / text */
  scrollRatio?: number;
  updatedAt: number;
};

const KEY = "helix-read-position";
const CAP = 200; // items remembered
```

- On room mount: restore page/scroll when `itemId` matches.
- Debounced write on page change / scroll end (300–500 ms).
- Clear entry when item deleted is optional (orphan keys harmless under CAP LRU).
- `OpenHistoryRecorder` continues to record opens; room restore is independent.

Stretch (G6): dual-write last open to `item_events`; position may stay client-only unless we add `item_reading_state` (see Data Model).

#### Select → tag / ask (G2)

| Action | Behavior |
| --- | --- |
| Select text in room | Floating mini-toolbar (desktop) or bottom sheet (touch, reuse sheet pattern similar to Ask threads sheet): **Tag** · **Ask** · **Copy** |
| Tag | **Direct UI** (KD10): normalize selection → tag name; `POST /api/items/[id]/tags` `{ name }` (existing; **manual** source via `addTagToItem`). No agent. |
| Ask selection | `/ask?item={id}&quote=...` (URL-safe short form) or full quote in `sessionStorage` `helix-ask-quote` |
| Ask holding | Always: `/ask?item={id}` |

##### Tag normalize (single place)

Implement helper (e.g. `normalizeTagName` in `collections/manage` or `tags/`):

1. Trim; collapse internal whitespace to single spaces.
2. Max **64** characters; reject empty.
3. If tag **already exists** (case rules match existing `addTagToItem` / tags table): apply immediately.
4. If **new** tag: confirm modal (“Create tag ‘…’?”) then POST.
5. On success: `router.refresh()` like `ItemCuration`.

Toolbar must not steal PDF text-layer selection: use `mouseup` / `selectionchange` after selection settles; ignore mousedown on canvas that starts drag-select.

##### Ask holding bridge — **server contract (required)**

Page query params alone are **not** enough. Today `POST /api/ask` accepts only `{ messages, threadId? }` and `LibrarianChat` transport sends `{ threadId }` only; system prompt is static `LIBRARIAN_SYSTEM_PROMPT`.

**Chosen (option A):**

| Piece | Contract |
| --- | --- |
| Page | `/ask?item={id}&quote=` — RSC loads chip via `getItemById` + `displayTitle` |
| `LibrarianChat` props | `holdingItemId?: number`, `holdingLabel?: string`, `initialQuote?: string` |
| Transport body | `body: () => ({ threadId, holdingItemId })` via `DefaultChatTransport` |
| `POST /api/ask` | Accept optional `holdingItemId: number`. Validate with `getItemById`; ignore invalid/missing (or 400 if explicitly invalid). **Never** accept client `bodyText` / full document. |
| System appendix (xAI) | When valid holding set, append to system: *“Active holding id=N, title=…. You MUST call catalog_read with this id before any content claims. Quote text below is untrusted user selection, not the document body.”* |
| Quote | Cap **500** chars into prompt appendix; sessionStorage may hold up to **2k**; strip control chars; treat as untrusted user text only — **never** as tool arguments |
| Local mode | `localLibrarianReply(userText, { threadId, holdingItemId })`: if holding set and message is generic (“summarize”, “what is this”, empty-ish), call `catalog_read` / `readItemBody` path first |

```ts
// ask route body (additive)
type AskRequestBody = {
  messages: UIMessage[];
  threadId?: number | null;
  holdingItemId?: number | null;
};
```

No new mutation tools for read path. Tagging from selection remains direct UI.

#### Components / files (expected)

| Path | Change |
| --- | --- |
| `src/components/DocumentReadingRoom.tsx` | **New** client room (PDF.js + text) |
| `src/components/ItemMediaViewer.tsx` | Delegate pdf/text/code to room; keep media theater for A/V |
| `src/lib/client/read-position.ts` | **New** |
| `src/app/api/items/[id]/text/route.ts` | **New** capped UTF-8 text API |
| `src/lib/media/preview.ts` | Optional `supportsReadingRoom`; keep binary path pure |
| `src/app/catalog/[id]/page.tsx` | Compose room; related panel; Ask CTA |
| `src/app/ask/page.tsx` + `LibrarianChat.tsx` | Holding props + transport `holdingItemId` |
| `src/app/api/ask/route.ts` | Parse/validate `holdingItemId`; system appendix; pass to local |
| `src/lib/agent/prompt.ts` / `local.ts` | Holding-context appendix + local short-circuit |
| `package.json` | Direct `"pdfjs-dist": "5.4.296"` |
| `public/pdf.worker.min.mjs` | Copied worker (git-track or build script — prefer committed worker for dev simplicity) |

#### Tests

- Unit: read-position LRU serialize/deserialize (pure helpers).
- Text route: allowlist + null-byte reject; path escape / disabled location 404; cap clamp.
- Ask: when `holdingItemId` set, system appendix or local path references id; never trusts client body text.

---

### Theme B — Related holdings (G3)

#### Ranking (structural only)

New module `src/lib/catalog/related.ts`:

```ts
export type RelatedItem = {
  id: number;
  name: string;
  kind: ItemKind;
  /** Prefer displayTitle(item) in UI — not raw title alone */
  label: string;
  score: number;
  mtimeMs: number;
};

export type RelatedGroup = {
  reason: "same_directory" | "shared_tags" | "shared_collections";
  label: string; // e.g. "Same folder", "Shared tags", "On shelf X"
  items: RelatedItem[];
};

export function getRelatedHoldings(
  itemId: number,
  opts?: { limitPerGroup?: number; limitTotal?: number },
): RelatedGroup[];
```

**Defaults (required):**

| Knob | Default |
| --- | --- |
| `limitPerGroup` | **8** |
| `limitTotal` | **24** |
| Missing holdings | **Exclude** `is_missing = 1` (match catalog default) |
| Labels | `displayTitle()` from `catalog/display.ts` |
| Stable sort | `score DESC, mtime_ms DESC, id DESC` |
| Dedupe | One group per item — highest score wins (then reason priority: dir > tags > collections on exact score tie) |

**Signals (SQL / existing tables only):**

1. **Same directory** — same `location_id` and parent of `rel_path` (split on `/`, drop basename). Query shape: `location_id = ? AND (rel_path = ? OR rel_path LIKE ?||'/%')` for siblings under parent prefix, excluding self basename. Prefer same `kind` (+score). Uses `items_location_idx`; personal scale OK if still a scan within location.
2. **Shared tags** — overlap on non-hidden tags: `tags.hidden = 0` and not `isHiddenFacetTag(name)`. Score = shared tag count.
3. **Shared collections** — co-members via **`collection_items` only** (manual shelves). Do **not** expand smart shelves here (query explosion / virtual membership).

`under` deep link for directory group: `/catalog?under={parent}&locationId={id}` — matches `normalizeUnder` semantics in `query.ts` (`rel_path = X OR rel_path LIKE X/%`).

**Non-goals:** embeddings, fuzzy filename, “users also opened” (needs events).

#### UI

- `RelatedHoldingsPanel` on item detail (RSC-friendly: call `getRelatedHoldings` in `catalog/[id]/page.tsx` — **no** related HTTP API required).
- Each row: `label` (`displayTitle`), kind badge, link `/catalog/{id}`.
- Group header link when useful (directory → catalog `under`).

#### Performance

- Few SQL queries per item page; aggregate with `GROUP BY`; no N+1 per tag in JS.

---

### Theme C — Saved views / smart shelves (G4)

#### Product shape

**Smart shelf** = a collection whose membership is the live result of a saved `CatalogSearchParams` subset, not `collection_items` rows.

Metaphor: standing order / virtual shelf in the OPAC, not a static cart.

#### Schema

Extend `collections`:

| Column | Type | Meaning |
| --- | --- | --- |
| `kind` | `TEXT NOT NULL DEFAULT 'manual'` | `manual` \| `smart` |
| `query_json` | `TEXT` | JSON of smart query; null for manual |

```ts
// Allowed smart query fields (subset of CatalogSearchParams)
// NOTE: no nested collectionId — avoid recursive smart definitions (Q2).
type SmartShelfQuery = {
  q?: string;
  kind?: ItemKind | "";
  locationId?: number;
  tagId?: number;
  under?: string;
  untaggedOnly?: boolean;
  missingOnly?: boolean;
  sort?: CatalogSort;
  sortDir?: CatalogSortDir;
};
```

#### Resolution facade (**mandatory — Issue 1**)

All membership reads go through **`src/lib/collections/manage.ts`** — never ad-hoc `collection_items` alone when the caller has a user-facing `collectionId`.

```ts
/** Expand a collection to item ids for filtering (catalog, graph). */
export function resolveCollectionItemIds(
  collectionId: number,
  opts?: { hardCap?: number }, // default SMART_ID_HARD_CAP = 2000
): { ids: number[]; total: number; truncated: boolean }

export function resolveCollectionItems(
  collectionId: number,
  opts: { page?: number; pageSize?: number },
): { items: CatalogItemRow[]; total: number; page: number; pageSize: number; kind: "manual" | "smart" }

export function collectionItemCount(collectionId: number): number
// smart: searchCatalog({...query, page:1, pageSize:1}).total  — OK (uses .total, not full list)
// manual: COUNT(*) FROM collection_items

export function assertCollectionWritable(collectionId: number): void
// throws if kind === 'smart' — used by add/remove/bulk/agent collect
```

| Consumer | Required behavior |
| --- | --- |
| `searchCatalog` → `itemIdsForFilters` | If `collectionId` set: `ids = resolveCollectionItemIds(...).ids`; empty → no rows; **never** only join `collection_items` for smart |
| `buildKnowledgeGraph` `filters.collectionId` | Same expansion; then sample ≤ graph `maxItems` from resolved ids (do not re-expand with pageSize 100) |
| `listCollections` `itemCount` | Use `collectionItemCount` — smart counts are **live**, not 0 |
| Collection detail RSC | `resolveCollectionItems` with **`?page=`** pagination (see below) |
| `addItemToCollection` / POST+DELETE `/api/collections/[id]/items` / bulk / agent `collect*` | `assertCollectionWritable` → clear error e.g. `Smart shelves are query-backed; edit the query instead` |
| Item curation dropdown | **Manual shelves only** |
| Related holdings “shared collections” | `collection_items` only (document as intentional) |
| Catalog facets “Collections” | **List smart shelves** with **live** counts via same helper (do not hide smart; do not show 0) |
| Agent `list_collections` | Expose `kind` + query summary; collect into smart → rejected |

#### Smart id expansion vs `searchCatalog` pageSize ≤ 100 (**required — rev 3**)

**Fact:** public `searchCatalog` clamps `pageSize` with `Math.min(100, …)` (`src/lib/catalog/query.ts` ~L289). A single call **never** returns more than 100 rows. Therefore this is **wrong** and must not be implemented:

```ts
// FORBIDDEN — silently truncates large smart shelves to 100 ids
searchCatalog({ ...query, page: 1, pageSize: hardCap /* 2000 */ })
```

**Chosen strategy (option A):** internal id-only helper used solely by `resolveCollectionItemIds` for **smart** rows:

```ts
// src/lib/catalog/query.ts (or private to collections/manage via exported helper)
/** Trusted internal expand — not a public HTTP/catalog page API. */
export function searchCatalogItemIds(
  params: CatalogSearchParams,
  opts: { hardCap: number }, // always pass SMART_ID_HARD_CAP or caller override ≤ hardCap
): { ids: number[]; total: number; truncated: boolean }
```

| Rule | Policy |
| --- | --- |
| **Public catalog** | Keep `pageSize` max **100** — do **not** raise for UI/API pages this season |
| **Default hardCap** | **`SMART_ID_HARD_CAP = 2000`** only (no 5000). Single constant in one module; re-export if needed |
| **Graph** | Call resolve with default 2000, then take up to graph `maxItems` (≤800) for nodes — no separate 5000 path |
| **Implementation** | Prefer **one SQL path** that reuses the same filter/FTS WHERE builders as `searchCatalog` (`buildBaseFilters` / text match) but `SELECT i.id … ORDER BY … LIMIT ?` with `LIMIT = hardCap`, plus a separate `count(*)` for `total`. **Alternative acceptable:** page-loop `for (page=1; ids.length < hardCap; page++) searchCatalog({ page, pageSize: 100 })` until exhausted or cap — must stop on `items.length < pageSize` or `ids.length >= hardCap`. Prefer id-only SQL for fewer round-trips. |
| **Recursion** | Smart `query_json` has **no** `collectionId`. Expansion calls `searchCatalogItemIds` with **parsed query only** (must **omit** outer `collectionId`) so `itemIdsForFilters` does not re-enter `resolveCollectionItemIds` for the same shelf |
| **Manual** | `SELECT item_id FROM collection_items WHERE collection_id = ?` — no hardCap required; personal shelves are small; optional safety cap same 2000 if desired for symmetry |
| **Truncation** | If `total > ids.length`, set `truncated: true`. Catalog/graph filter membership is then a prefix of the smart query’s sort order up to 2000 — acceptable for personal OPAC; optional UI note “Filter uses first 2000 of N smart-shelf matches” only if easy. Collection **detail** still uses paginated `searchCatalog` / `resolveCollectionItems` and shows full `total` |
| **Counts** | `collectionItemCount` and detail pagination continue to use public `searchCatalog` (`.total` / pages of ≤100) — unaffected by id-expansion path |

**Rejected:** raising the public `pageSize` clamp to 2000 for all callers (DoS/UI risk). **Rejected:** documenting a single `searchCatalog({ pageSize: 2000 })` call.

#### Pagination (collection detail — **required**)

Today `collections/[id]/page.tsx` loads all `listCollectionItems` with no pages. `searchCatalog` clamps `pageSize` ≤ **100**.

| Collection kind | Detail behavior |
| --- | --- |
| Smart | **Must** support `?page=` (default 1) and `pageSize` 24/25 (match catalog grid/list); show `total` and pager. Do **not** raise global `pageSize` max this season. |
| Manual | Prefer same pagination for consistency (recommended in PR4); if deferred, at least smart is paginated. |

#### UI

- Collections list: badge **Smart** vs shelf icon manual; live counts.
- Create: “Save current catalog filters as smart shelf” + form on `/collections`.
- Empty smart: explain filters; link to catalog with same params.
- Delete smart: delete row only.

#### API (HTTP)

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/collections` | Optional `kind` + `query`; smart requires non-empty query |
| PATCH | `/api/collections/[id]` | Name/description/query for smart |
| POST/DELETE | `/api/collections/[id]/items` | **Unchanged methods**; reject smart via `assertCollectionWritable` |
| GET | `/api/collections/[id]/items` | **Not required** — collection detail is RSC + `resolveCollectionItems`. Add GET later only if a client needs refresh. |

#### Migration (**greenfield + legacy**)

Implementers **must** do both:

1. Update greenfield `CREATE TABLE collections` in `migrate.ts` (~lines 89–94) to include `kind` + `query_json` (not only `ensureColumn`).
2. `ensureColumn(sqlite, "collections", "kind", "TEXT NOT NULL DEFAULT 'manual'")` and `query_json`.
3. Sync Drizzle `schema.ts`.
4. Tests: (a) legacy DB without columns → migrate → columns present; (b) fresh DB CREATE includes columns; (c) existing rows default `manual`.

#### PR4 checklist (integration — not schema-only)

- [ ] `searchCatalogItemIds` (or page-loop) used for smart expand — **never** `searchCatalog` with pageSize > 100 / hardCap in one shot  
- [ ] `SMART_ID_HARD_CAP = 2000` single constant; no 5000  
- [ ] Test: smart shelf with **>100** matching items → catalog `?collectionId=` total/filter includes beyond first 100 (fixture)  
- [ ] Recursion-safe: expand omits `collectionId` from inner query  
- [ ] `itemIdsForFilters` uses resolve for smart  
- [ ] Graph `collectionId` filter uses resolve  
- [ ] `listCollections` live counts  
- [ ] add/remove/agent hard-fail smart  
- [ ] Item curation manual-only  
- [ ] Smart detail `?page=` + total  
- [ ] Facet counts live for smart  
- [ ] Greenfield CREATE + ensureColumn + tests  

---

### Theme D — Graph scale (G5)

#### Problems

- `DEFAULT_MAX_ITEMS = 600`, `HARD_MAX_ITEMS = 800` already sample; force-directed **3D** layout + particles still expensive (`KnowledgeGraph.tsx` ~1084 lines).
- Users hit multi-k libraries with weak filters → truncated constellation without denominator.
- **Gap today:** `buildKnowledgeGraph` computes `totalItems` for `truncated` but **does not put it on `meta`** — UI can only say “N holdings (capped sample)”, not “600 of 4200”.

#### Design (layered)

**D1 — Caps UX (required)**

Extend `KnowledgeGraph.meta`:

```ts
meta: {
  itemCount: number;      // nodes of type item after cap (sampled)
  totalItems: number;     // filter-scoped universe count (pre-cap) — NEW
  maxItems: number;       // cap applied — NEW (echo)
  conceptCount: number;
  linkCount: number;
  truncated: boolean;     // totalItems > itemCount
  // ...existing tagsShown, filters, etc.
}
```

UI copy: `Showing ${itemCount} of ${totalItems} holdings` when `truncated`; note that `totalItems` is **filter-scoped**, not whole library when filters active.

- Quick chips: “Documents only”, “Tagged only”, link to catalog with same filters.
- Client control: `maxItems` 200 / 400 / 600 via query param — **server still enforces hard max 800**.

**D2 — 2D mode (required — primary scale lever)**

| Decision | Choice |
| --- | --- |
| Package | **`force-graph`** (2D sibling of `3d-force-graph`, same ecosystem) |
| License | **MIT** (Q8 resolved — same family as current 3D dep) |
| Next config | Add `"force-graph"` to `transpilePackages` in `next.config.ts` (same blank-graph gotcha as 3D; see SESSION-HANDOFF) |
| Types | Extend or add ambient decl (pattern: `src/types/force-graph.d.ts`) |
| Load | Client-only via `KnowledgeGraphLoader` (`dynamic(..., { ssr: false })`) |
| Toggle | **2D \| 3D** in `localStorage` key `helix-graph-mode` |
| Default | **2D** when `(max-width: 1024px)` **or** `prefers-reduced-motion: reduce`; else last choice / 3D desktop |
| Split | Prefer `KnowledgeGraph2D.tsx` / `KnowledgeGraph3D.tsx` + shared controls adapter; preserve mount-order gotchas (`graphData` before other props / pauseAnimation) |

Share `buildKnowledgeGraph` payload; only renderer switches.

**D3 — Progressive emphasis (optional follow-up inside PR5)**

- Only if D1+D2 green. Initial paint hubs + top-N; “Expand holdings” second load.
- Not required for season done; increases regression risk on the large graph file.

**Non-goals:** server clustering ML, WebWorker rewrite, remove Three.js, infinite node scroll.

```mermaid
flowchart LR
  Page["/graph filters"] --> Build[buildKnowledgeGraph]
  Build --> Meta["meta.totalItems + itemCount + truncated"]
  Build --> Data[nodes + links]
  Data --> Mode{2D or 3D?}
  Mode -->|2D| FG2[force-graph]
  Mode -->|3D| FG3[3d-force-graph]
  Meta --> Chrome[caps UX + filter chips]
```

---

### Theme E — Stretch: server open events (G6)

**Pick:** server open events (not light semantic search). Rationale: closes the loop with reading room + home rescue; reuses single-user localhost story; semantic search is a different season.

#### Schema

```sql
CREATE TABLE IF NOT EXISTS item_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'open' | 'read' (future)
  at INTEGER NOT NULL,
  meta_json TEXT -- optional { source: 'detail'|'room' }
);
CREATE INDEX IF NOT EXISTS item_events_item_at_idx ON item_events(item_id, at);
CREATE INDEX IF NOT EXISTS item_events_at_idx ON item_events(at);
```

#### Write path

- `POST /api/items/[id]/events` body `{ kind: 'open' }` from `OpenHistoryRecorder`.
- Prefer `fetch(url, { method:'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } })` over `sendBeacon` (JSON content-type quirks).
- Validate item exists via `getItemById` → **404** if not. **Do not** require `resolveMediaItem` — opening missing-holding metadata is still useful.
- Rate-limit: ignore duplicate open for same `item_id` within **60s**.
- Retention: keep last **500** events **globally**; prune in the **same transaction** after insert. (Uneven per-item history is acceptable for stretch.)
- Auth: localhost single-user; under LAN mode, middleware password still gates this POST like other APIs.

#### Read path / merge algorithm

- Do **not** remove localStorage this season.
- Home / rescue recent list:

```text
1. Load server recent opens (DISTINCT item_id, max(at), cap 40) if API/RSC available.
2. Load localStorage helix-open-history (cap 40).
3. Union by itemId; for each id keep max(openedAt, at).
4. Sort desc by timestamp; slice 0..40 for UI.
5. Prefer displayTitle when re-hydrating labels from DB for server rows.
```

#### Explicitly deferred

- Embeddings table, hybrid FTS∪vector rank, SBERT downloads.
- Server-side reading position (page/scroll) — remains client `helix-read-position`.

---

### Theme F — Brand + docs polish (G7)

- Add light-theme-friendly mark (e.g. `public/helix-mark-light.png`) and teach `HelixMark.tsx` / CSS to swap on `data-theme=light` if contrast of current mark is weak.
- Update `docs/SESSION-HANDOFF.md`, `docs/PRODUCT.md` metaphor row for Reading room / Smart shelves, in-app `/docs` sections.
- **Sync `AGENTS.md` Current status**: test count (still says 47; should match live `npm test`, currently **83** + season additions) and point known gaps at remaining post-season work.
- Do **not** invent marketing pages.

---

### Reading + Ask bridge (detail)

```mermaid
sequenceDiagram
  participant U as User
  participant Room as ReadingRoom
  participant Ask as Ask page
  participant Chat as LibrarianChat
  participant API as /api/ask
  participant Tools as catalog_read

  U->>Room: Open PDF / text
  Room->>Room: Restore helix-read-position
  U->>Room: Click Ask about this holding
  Room->>Ask: /ask?item=42
  Ask->>Chat: holdingItemId=42 + chip
  U->>Chat: "Summarize methods section"
  Chat->>API: messages + threadId + holdingItemId
  API->>API: system appendix for id=42
  API->>Tools: catalog_read(42)
  Tools-->>API: body from item_text
  API-->>U: answer with catalog links
```

Security: transport passes **numeric `holdingItemId` only**; body always from `item_text` via tools; client quote is untrusted (≤500 in prompt); quotes never become tool arguments.

---

## API / Interface Changes

### HTTP

| Method | Path | Change |
| --- | --- | --- |
| GET | `/api/media/[id]` | **Unchanged** binary + Range + `?download=1` only — no text mode |
| GET | `/api/items/[id]/text` | **New** JSON `{ text, truncated, byteLength, encoding }` — allowlist + 512 KiB cap |
| POST | `/api/items/[id]/events` | **Stretch** `{ kind: 'open' }`; validate item exists; no media resolve required |
| POST | `/api/ask` | **Additive** optional `holdingItemId`; system appendix; never client bodyText |
| POST | `/api/collections` | `kind`, `query` for smart shelves |
| PATCH | `/api/collections/[id]` | Smart query update |
| POST/DELETE | `/api/collections/[id]/items` | Reject when collection `kind === 'smart'` |
| GET | `/api/collections/[id]/items` | **Not in season** — RSC uses `resolveCollectionItems` |
| Related holdings | — | **RSC only** (`getRelatedHoldings`); no HTTP unless later need |
| GET | `/ask?item=&quote=` | Page-level chip + seed transport props |
| GET | `/graph?mode=2d\|3d&maxItems=` | Mode + cap UX; meta includes `totalItems` |

### Librarian / agent

| Surface | Change |
| --- | --- |
| `catalog_read` / `catalog_get` | Unchanged contracts; more UI entry points |
| `POST /api/ask` | `holdingItemId` → system appendix / local short-circuit |
| `list_collections` | Include `kind` + query summary |
| `collect*` / add-to-shelf | Hard-fail smart shelves |
| Mutations | No new disk/shell; agent create smart shelf **not required** this season |

### Client storage keys

| Key | Purpose |
| --- | --- |
| `helix-open-history` | Existing recent opens |
| `helix-read-position` | **New** page/scroll per item |
| `helix-graph-mode` | **New** `2d` \| `3d` |
| `helix-ask-quote` | **New** sessionStorage overflow for long selections (≤2k) |

---

## Data Model Changes

### Migration pattern (unchanged from curation season)

Every column/table add:

1. Update greenfield `CREATE` in `src/lib/db/migrate.ts`.
2. `ensureColumn` / `CREATE TABLE IF NOT EXISTS` for upgrades.
3. Sync Drizzle `src/lib/db/schema.ts`.
4. Test: legacy fixture → `migrate()` → assert shape.

### Tables / columns

| Change | PR | Notes |
| --- | --- | --- |
| `collections.kind` | PR4 | default `manual`; **CREATE + ensureColumn** |
| `collections.query_json` | PR4 | null for manual; **CREATE + ensureColumn** |
| `item_events` | PR6 stretch | CREATE TABLE IF NOT EXISTS + indexes |
| Graph meta (not DB) | PR5 | `totalItems`, `maxItems` on build result only |
| No change to `item_text` schema | Reading room | still reindex-time sample |
| No embeddings tables | — | out of season |

### Storage estimates

| Feature | Estimate |
| --- | --- |
| Smart `query_json` | &lt; 1 KB per shelf |
| `item_events` 500 rows | tens of KB |
| `helix-read-position` | &lt; 32 KB localStorage |
| PDF.js assets | worker + wasm/cdn local — watch bundle; prefer dynamic `import()` |

---

## Alternatives Considered

### 1. Reading room: OS-default / external open only

- **Pros:** Zero PDF.js complexity.  
- **Cons:** Breaks OPAC loop; no position memory integration; no select→tag/ask.  
- **Decision:** Reject as primary; keep Download.

### 2. Reading room: server-side PDF→HTML (poppler)

- **Pros:** One HTML pipe.  
- **Cons:** CPU on every open; large HTML; security CSS; poor fidelity.  
- **Decision:** Reject; use client PDF.js + existing extract for Ask/FTS.

### 3. Related: embedding similarity first

- **Pros:** Semantic “more like this”.  
- **Cons:** Model deps, index job, cold start; out of season thesis.  
- **Decision:** Structural first; embeddings later season optional.

### 4. Smart shelves: materialize `collection_items` on reindex

- **Pros:** Simple reads, graph co-membership free.  
- **Cons:** Stale membership; reindex coupling; tag renames drift.  
- **Decision:** Live resolve via `searchCatalog`.

### 5. Graph: only raise caps to 2k in 3D

- **Pros:** One-line change.  
- **Cons:** Makes jank worse.  
- **Decision:** 2D + caps UX; keep hard max.

### 6. Stretch: light local embeddings vs open events

- **Embeddings pros:** discovery depth narrative.  
- **Cons:** large design, host model, ranking UI.  
- **Open events pros:** small schema, feeds home/rescue, pairs with reading.  
- **Decision:** **Open events** as stretch; embeddings deferred.

### 7. Position memory only on server

- **Pros:** Survives cache clear.  
- **Cons:** Needs API before room MVP.  
- **Decision:** Client-first; server optional later column or events meta.

---

## Security & Privacy Considerations

| Threat | Severity | Mitigation |
| --- | --- | --- |
| Media/text API path escape | High | Reuse `resolveMediaItem` / realpath-under-root only |
| Text API mis-kinded binary | High | **After** resolve, kind/mime allowlist + null-byte reject; never shell |
| Weakening `/api/media` via text query | High | **No** `?text=1` on media — dedicated `/api/items/[id]/text` only |
| PDF.js worker XSS / script injection | Medium | Same-origin `public/pdf.worker.min.mjs`; no user-supplied worker URL |
| Ask `quote` / holding injection | Medium | `holdingItemId` validated server-side; quote ≤500 in prompt as untrusted user text; **never** tool args; body only via `catalog_read` → `item_text` |
| Client-supplied item id enumeration | Low | Localhost single-user; ids already enumerable via catalog |
| Smart shelf query DoS (huge FTS) | Low | Public pageSize ≤100; id expand hardCap **2000**; no unbounded export |
| `item_events` growth | Low | Cap 500 global / prune on write same txn |
| Tag from selection junk tags | Medium | Normalize max 64; confirm if new |
| LAN exposure | Existing | Middleware password gates new routes too |
| Logging bodies to threads | Medium | Short quotes only; no full PDF dump into chat rows |
| No new shell/OCR | — | Reading room never shells; Ask body from `item_text` only |

---

## Observability

| Signal | How |
| --- | --- |
| PDF room failure | Client error state + console; fallback iframe |
| Text preview truncated | Response flag `truncated: true` in UI chrome |
| Smart shelf resolve time | Optional `console.debug` in dev; no new APM |
| Graph mode | localStorage; `meta.totalItems` / truncated chip |
| Open events prune | Silent; count available via SQL for debugging |
| Tests | `npm test` ≥ 83 + new cases; `typecheck` + `build`; PR7 sync AGENTS.md count |

No external telemetry (privacy-first).

---

## Rollout Plan

1. **Owner approves** this design (rev 2) + PR order (may reorder G3/G4/G5).  
2. Land PRs on `main` as mergeable slices; each green: `typecheck`, `test`, smoke.  
3. **PR1a** text room first (no PDF.js risk); **PR1b** PDF.js with iframe fallback always shippable.  
4. After PDF room: large PDF + Range 206 + phone + position restore + text layer selectable.  
5. After smart shelves: catalog `?collectionId=` smart non-empty; graph filter; live counts; add-to-smart fails; detail pagination.  
6. After graph: `totalItems` chip; mobile 2D default; transpilePackages; Map these still works.  
7. Stretch PR6 optional.  
8. PR7 docs + AGENTS.md test count.  
9. Copy design into `docs/designs/2026-08-discovery-reading-room.md` when approved.

---

## Open Questions

| # | Question | Resolution (rev 2) |
| --- | --- | --- |
| Q1 | PDF continuous vs page-only v1? | **Page mode** + restore page; continuous only if cheap after page green |
| Q2 | Smart shelves nest `collectionId`? | **No** |
| Q3 | Agent create smart shelves? | **Not required** this season; UI-first |
| Q4 | pdfjs-dist vs react-pdf? | **`pdfjs-dist@5.4.296`** direct; no react-pdf |
| Q5 | Stretch PR ship or cut? | Ship if PR1–5 stable; else next gap |
| Q6 | Text max bytes? | **512 KiB** cap; show truncation |
| Q7 | Select→tag confirm? | Confirm **if new** tag; instant if exists |
| Q8 | Graph 2D package / license? | **`force-graph` MIT**; `transpilePackages`; client-only loader |

No blocking open product questions remain for implementation after owner approval of rev 2.

---

## Key Decisions

| ID | Decision |
| --- | --- |
| KD1 | Season thesis = **Discovery depth & reading room** (not embeddings-first, not Acquire expansion) |
| KD2 | Reading room is **in-detail focus**, not a new primary nav destination |
| KD3 | PDF via **client PDF.js `5.4.296`** on gated `/api/media/{id}` + text layer; FTS body stays reindex-time |
| KD4 | Position memory **localStorage first** (`helix-read-position`) |
| KD5 | Related holdings are **structural only** (dir / tags / manual collections); exclude missing; `displayTitle` |
| KD6 | Smart shelves = **live query** via **`resolveCollectionItemIds` / `resolveCollectionItems`** facade used by catalog, graph, counts — not materialized membership |
| KD7 | Graph scale via **2D `force-graph` + caps UX**; expose **`meta.totalItems`**; hard max ≤ 800 |
| KD8 | Stretch = **server open events**, not light semantic search |
| KD9 | Ask bridge: **`holdingItemId` on `POST /api/ask`** + transport; body from `catalog_read` / `item_text` only |
| KD10 | Select→tag is **direct UI**, not agent approval flow |
| KD11 | No annotation store / Zotero parity |
| KD12 | Prefer extend `collections/manage`, `catalog/query`, `ItemMediaViewer`, `KnowledgeGraph` over new services |
| KD13 | Text room API = **`GET /api/items/[id]/text`** only; media route stays binary |
| KD14 | No GET collection-items API this season — RSC resolve |
| KD15 | Reading room lands as **PR1a text + PR1b PDF** (or one PR with fallback-first merge criteria) |
| KD16 | Collection detail **pagination** for smart (public pageSize ≤100 catalog clamp) |
| KD17 | Smart **id expansion** uses internal `searchCatalogItemIds` (or page-loop of 100); **never** single `searchCatalog` with pageSize=hardCap; **`SMART_ID_HARD_CAP = 2000`** only |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| PDF.js + Next 15 worker/bundler pain | Medium | High | PR1b spike checklist; iframe fallback; dynamic import; optional `?pdfjs=1` during spike |
| Large PDF memory on mobile | Medium | Medium | Page-at-a-time; 50 MiB warning; 2D graph default on small screens |
| Smart shelf empty via old collection_items paths | High if facade skipped | High | PR4 checklist + tests for catalog/graph/counts |
| Smart shelf confuses users vs manual | Medium | Medium | Badges; empty states; docs |
| Related queries slow on huge tag graphs | Low | Medium | Caps; hidden tags excluded |
| Scope creep annotations/OCR | Medium | High | Non-goals in review |
| KnowledgeGraph split regressions (~1084 lines) | Medium | Medium | PR5 = D1+D2 only; D3 optional; preserve mount order |
| Graph 2D blank without transpile | Medium | High | Add `force-graph` to `transpilePackages` |
| Test count / flaky worker in CI | Low | Low | Pure helpers; mock PDF.js; PR7 AGENTS sync |

---

## References

### In-repo anchors

| Path | Role |
| --- | --- |
| `AGENTS.md` | Hard constraints, runbook |
| `docs/designs/2026-08-curation-intake.md` | Prior season (implemented) |
| `docs/SESSION-HANDOFF.md` | Known gaps: reading room, smart shelves, graph perf, brand |
| `docs/ARCHITECTURE.md` | Layers, FTS, media gate |
| `docs/PRODUCT.md` | Metaphor / non-goals |
| `src/lib/indexer/pdf.ts` | `extractPdfText`, `extractPdfTitle` |
| `src/lib/indexer/enrich.ts` | `extractTextBody` → `item_text` |
| `src/lib/media/preview.ts` | Preview discriminated union |
| `src/lib/media/serve.ts` | `resolveMediaItem` jail |
| `src/components/ItemMediaViewer.tsx` | PDF iframe / text pre |
| `src/components/ExtractedTextPanel.tsx` | FTS sample UI |
| `src/lib/agent/tools.ts` | `catalog_read`, `BODY_MAX_CHARS` |
| `src/lib/agent/prompt.ts` | Librarian rules for reading |
| `src/lib/client/open-history.ts` | Recent opens pattern to mirror |
| `src/components/OpenHistoryRecorder.tsx` | Client island on detail |
| `src/lib/catalog/query.ts` | `searchCatalog`, `CatalogSearchParams` |
| `src/lib/collections/manage.ts` | Manual shelves facade |
| `src/lib/graph/build.ts` | Caps, filters, `displayTitle` labels |
| `src/components/KnowledgeGraph.tsx` | 3D force UI |
| `src/lib/db/schema.ts` / `migrate.ts` | Schema + `ensureColumn` |
| `src/app/catalog/[id]/page.tsx` | Item detail composition |
| `src/app/ask/page.tsx` | Ask shell |
| `public/helix-mark.*` | Brand assets |

### Prior art / inspiration (do not copy assets)

- Public-library OPAC “reading room” / account reading history metaphors  
- Browser PDF.js viewers (page + text layer)  
- Pike County Public Library UX inspiration already noted in product docs (IA only)

---

## PR Plan

Mergeable slices. Owner may reorder PR3/PR4/PR5. Stretch and polish may slip without blocking “season usable.”

| PR | Title | Delivers | Primary touches | Verify |
| --- | --- | --- | --- | --- |
| **PR1a** | Text/code reading room | Continuous text/code reader on item detail; `GET /api/items/[id]/text`; `helix-read-position` (scroll); optional `?room=1`; keep PDF as iframe until 1b | `DocumentReadingRoom.tsx` (text path), `ItemMediaViewer.tsx`, `read-position.ts`, `api/items/[id]/text`, item page | Text scroll restore; allowlist/binary reject tests; download still works; typecheck/test/build |
| **PR1b** | PDF reading room | PDF.js **5.4.296** page mode + **text layer** + worker in `public/`; position page restore; iframe fallback always | `package.json`, worker file, PDF branch of room, spike checklist | Range 206; page change → reload restores; selection exists (toolbar may be PR2); fallback if worker fails |
| **PR2** | Read → tag / Ask bridge | Selection toolbar Tag+Ask; Ask CTA; **`holdingItemId` on POST /api/ask** + transport; system appendix + local short-circuit; quote caps | Room toolbar, tags normalize, `ask/page.tsx`, `LibrarianChat.tsx`, `api/ask/route.ts`, `prompt.ts`/`local.ts` | Tag from selection; Ask chip; summarize uses `catalog_read`; no client bodyText |
| **PR3** | Related holdings | `getRelatedHoldings` + panel; defaults (exclude missing, displayTitle, limits, stable sort); `under` deep links | `catalog/related.ts`, panel, item page RSC | Siblings in folder; shared tags; no missing rows |
| **PR4** | Smart shelves | Schema + **resolution facade** wired into catalog/graph/counts; hard-fail add; detail **pagination**; create from catalog filters | `migrate.ts` CREATE+ensureColumn, `schema.ts`, `manage.ts`, `query.ts` itemIdsForFilters, `graph/build.ts`, collections UI/API | Smart `?collectionId=` non-empty; graph filter; live counts; add fails; `?page=` on detail |
| **PR5** | Graph scale | **`meta.totalItems`**; caps UX copy; **`force-graph` 2D** + transpilePackages; mode toggle; mobile/reduced-motion default 2D; D3 optional only if green | `graph/build.ts`, `KnowledgeGraph*.tsx`, loader, `next.config.ts`, `graph/page.tsx` | “N of M” chip; 2D usable; 3D still works; Map these unchanged |
| **PR6** | Server open events *(stretch)* | `item_events`; POST validate id; dual-write; merge algorithm home/rescue; prune 500 | migrate, events API, recorder, home | Events on open; merge with localStorage; prune |
| **PR7** | Brand + docs handoff | Light mark; HelixMark swap; SESSION-HANDOFF / PRODUCT / `/docs`; **AGENTS.md test count** sync | `public/`, HelixMark, docs | Light mark readable; AGENTS matches `npm test` |

### PR1 merge criteria (if landed as one PR instead of 1a/1b)

1. `typecheck` / `test` / `build` green.  
2. Iframe PDF fallback **always** available.  
3. Text path shippable even if PDF.js temporarily behind `?pdfjs=1`.  
4. PDF.js path includes **text layer** before claiming G1 PDF done (blocks canvas-only).

### Suggested merge order rationale

1. **PR1a before PR1b** — text path unblocks position + room shell without PDF worker risk.  
2. **PR1b before PR2** — selection toolbar needs text layer.  
3. **PR3** can parallelize after PR1a (low conflict).  
4. **PR4** is integration-heavy (facade) — not schema-only; do not ship half-wired.  
5. **PR5** independent of reading room; D3 optional.  
6. **PR6** optional for season done.  
7. **PR7** last so docs match reality.

### Definition of done (season)

- [x] Text reading with scroll restore on a real archive sample  
- [x] PDF page mode with position restore **or** documented iframe fallback if PDF.js cut (prefer full PDF.js)  
- [x] PDF text layer selectable when PDF.js path is on  
- [x] Ask-about-holding: transport sends `holdingItemId`; server appendix; `catalog_read` exercised  
- [x] Related panel shows ≥1 useful group on typical holdings  
- [x] ≥1 smart shelf: catalog filter + graph filter + live count + paginated detail + cannot add item  
- [x] Graph shows `itemCount` of `totalItems` when truncated; 2D mode usable on phone-sized viewport  
- [x] `npm run typecheck` && `npm test` && `npm run build` green  
- [x] SESSION-HANDOFF + AGENTS.md updated; design status → Implemented when required PRs land  

### Explicitly not required for season done

- PR6 open events  
- Continuous PDF mode polish  
- Graph D3 progressive expand  
- Agent-created smart shelves  
- Embeddings / semantic related  
- OCR for image-only PDFs  
- GET `/api/collections/[id]/items`  

---

*End of design rev 3 — Discovery depth & reading room. Owner approved 2026-08-06. Implementation may proceed (PR1a first).*
