# Architecture — Helix Library

## Goals

1. Index personal files under **explicit** roots into a queryable catalog.
2. Present a library-style web surface (browse, locate, curate, preview).
3. Provide one conversational **Librarian** over the same catalog (read-only).
4. Stay **localhost-only** and privacy-first.

## System diagram

```text
┌─────────────────────────────────────────────────────────────┐
│  Web surface (Next.js 15 App Router + React 19)             │
│  /  /catalog  /catalog/[id]  /graph  /collections           │
│  /locations  /acquire  /services  /ask  /docs  /lens        │
│  Header (client hamburger < lg) · Footer · tooltips         │
└───────────────────────────┬─────────────────────────────────┘
                            │ RSC / fetch
┌───────────────────────────▼─────────────────────────────────┐
│  API routes (Node runtime)                                  │
│  reindex · media · thumbs · locations · collections · tags  │
│  ask · threads · bulk · acquire · backup · restore · insights · lens  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Library core (`src/lib`)                                   │
│  config · db · indexer · catalog · collections · locations  │
│  media · agent · machine · graph · acquire · lens · backup  │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
        SQLite library.db              Filesystem roots
        (+ FTS5, thumbs on disk)       (archive/, …)
```

## Config

**File:** `library.config.json` (gitignored; commit `library.config.example.json`).

| Field | Role |
| --- | --- |
| `bind` | Must be `127.0.0.1` / `localhost` / `::1` |
| `port` | Documented as 4747 (Next scripts also pin host/port) |
| `dbPath` | Default `./data/library.db` |
| `locations[]` | `{ name, root, enabled? }` — absolute or project-relative |
| `ignore[]` | picomatch globs |
| `maxFileBytes` | Skip larger files |
| `hashFullUnderBytes` | Full SHA-256 under this size; else sampled hash |

Loader: `src/lib/config.ts`  
- Resolves relative paths against `process.cwd()`  
- Caches config; `clearConfigCache()` after UI writes  
- `saveLocationsToConfig()` rewrites the locations array

## Data model (SQLite)

Bootstrap: `src/lib/db/migrate.ts` (idempotent `CREATE IF NOT EXISTS`).  
Drizzle types: `src/lib/db/schema.ts`.  
Client singleton: `src/lib/db/client.ts` (`globalThis` for HMR).

### Core tables

| Table | Purpose |
| --- | --- |
| `locations` | Scan roots (branches) |
| `items` | Holdings: path, kind, mime, size, mtimes, hash, title, width/height, duration_ms, is_missing |
| `item_text` | Extracted text body sample for FTS |
| `jobs` | Unified job log (reindex, backup, restore, acquire, `lens_analyze`) |
| `collections` / `collection_items` | Manual shelves + smart shelves (`kind` / `query_json`) |
| `tags` / `item_tags` | Labels on items (`source`, optional `hidden`) |
| `chat_threads` / `chat_messages` | Librarian conversations |
| `insights` | Human Deep Lens quotes/notes (not machine output) |
| `lens_analyses` | Cached machine dossier per item (fingerprint-fresh) |

### Search (FTS5)

- `items_fts` — content-synced to `items` (name, rel_path, title, ext) via triggers  
- `item_body_fts` — content-synced to `item_text`  
- Query union in `src/lib/catalog/query.ts` when `q` is non-empty  
- Catalog filters: kind, locationId, collectionId, tagId; only **enabled** locations; hide missing by default  

## Indexer

Entry: `runReindex()` in `src/lib/indexer/run.ts`  
CLI: `npm run reindex` → `scripts/reindex.ts`  
HTTP: `POST /api/reindex`

Pipeline per enabled location:

1. `syncLocationsFromConfig()`  
2. `walkFiles` — ignore globs + hard skip of heavy dir names  
3. classify kind (`classify.ts`) + mime  
4. hash if mtime/size changed (`hash.ts`)  
5. upsert `items`  
6. **enrich** (`enrich.ts`):  
   - image → sharp dimensions + webp thumb  
   - video → ffprobe duration/dims + ffmpeg poster  
   - audio → duration  
   - text/code → body sample into `item_text`  
   - PDF documents → text layer via `pdftotext` or `pdf-parse` into `item_text`  
7. mark missing paths `is_missing = 1`  
8. heal empty FTS tables if needed  

Incremental: unchanged mtime+size+hash skips rewrite unless enrichment is incomplete (`needsEnrichment`).

## Media

| Route | Behavior |
| --- | --- |
| `GET /api/media/[id]` | Stream original file; supports `Range`; `?download=1` attachment |
| `GET /api/thumbs/[id]` | WebP thumb if present |

Security (`resolveMediaItem`): item exists, location enabled, realpath under location root, file on disk.

Preview types: `src/lib/media/preview.ts` → image / video / audio / pdf / text / none.  
UI: `ItemMediaViewer`, `MediaLightbox` (neighbors for next/prev).  
EXIF: `readExif()` via system exiftool when available.

## Librarian agent

| Piece | Path |
| --- | --- |
| Mode resolution | `src/lib/agent/mode.ts` (`auto` → Grok if key, else local) |
| Local answers | `src/lib/agent/local.ts` (intent + propose/confirm via thread) |
| Mutations | `src/lib/agent/actions.ts` + `POST /api/agent/actions` |
| LLM tools | `src/lib/agent/tools.ts` (AI SDK `tool()`) |
| System prompt | `src/lib/agent/prompt.ts` |
| Persistence | `src/lib/agent/threads.ts` |
| HTTP | `POST /api/ask`, `GET /api/ask`, threads API |
| UI | `LibrarianChat.tsx` + `AssistantMarkdown.tsx` |

**local:** stream of `localLibrarianReply(userText, { threadId })`.  
**xai (Grok):** `streamText` + `createXai` + **`xai(model)`** (chat completions; default model `grok-4.3`) + tools, `stopWhen: stepCountIs(8)`.

**Tools:** `catalog_search`, `catalog_get`, **`catalog_read`** (indexed body), `list_locations`, `list_collections`, `machine_status`, `system_help`, **`propose_actions`** (stages mutations; user must approve).

**Search hybrid:** `searchTokens` + FTS prefix OR + `LIKE %token%` on name/rel_path/title (compound filenames).

## Locations & collections

- **Locations UI** → `src/lib/locations/manage.ts` + `/api/locations`  
  Mutations update DB then rewrite config.  
- **Collections/tags** → `src/lib/collections/manage.ts` + `/api/collections*`, `/api/items/[id]/tags`  
  Curation panel on item detail.

## Frontend map

| Route | Notes |
| --- | --- |
| `/` | Stats, search, service cards, recent items |
| `/catalog` | Filters, grid/list (`CatalogResults`), lightbox |
| `/catalog/[id]` | Preview, metadata, EXIF, curation, lightbox neighbors |
| `/collections` | Create + list |
| `/collections/[id]` | Grid/list of shelf items |
| `/locations` | Admin + ignore display + reindex |
| `/services` | Reindex, export/backup, restore from snapshot, machine facts, jobs |
| `/ask` | Chat (optional `?item=` holding context) |
| `/docs` | End-user getting started |
| `/lens` / `/lens/[id]` | Deep Lens dossier (kind-object + analysis + Your insights) |
| `/acquire` | ILL desk (arXiv, OpenAlex, clip, Grokipedia, YT, images) |
| `/graph` | 2D/3D knowledge map |
| `/design` | Internal design-assets lab |

Shared nav: `src/lib/nav.ts` (Header + Footer).  
Responsive: Header client drawer below `lg`; layout `max-w-7xl`.

## API reference (concise)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/reindex` | Run indexer |
| GET | `/api/media/[id]` | Stream file (+ Range) |
| GET | `/api/thumbs/[id]` | Thumb webp |
| POST | `/api/locations` | Add location |
| PATCH/DELETE | `/api/locations/[id]` | Update / remove |
| GET/POST | `/api/collections` | List / create |
| PATCH/DELETE | `/api/collections/[id]` | Update / delete |
| POST/DELETE | `/api/collections/[id]/items` | Add/remove item |
| POST/DELETE | `/api/items/[id]/tags` | Tag add/remove |
| GET/POST | `/api/ask` | Status / chat stream |
| GET/POST | `/api/threads` | List / create thread |
| GET/DELETE | `/api/threads/[id]` | Load / delete thread |
| GET/POST | `/api/insights` | Human Lens insights |
| DELETE | `/api/insights/[id]` | Delete one insight |
| GET/POST | `/api/lens/analyses` | Dossier cache / run analysis |
| GET | `/api/jobs/[id]` | Poll any job including `lens_analyze` |
| GET/POST | `/api/backup` | List / create catalog or full export |
| DELETE | `/api/backup/[name]` | Delete one export |
| GET | `/api/backup/download/[name]` | Download a jail-safe archive |
| POST | `/api/restore/inspect` | Preview `helix-backup-v1` + mint confirm token (no live writes) |
| GET/POST | `/api/restore` | Sidecar status / apply (typed `RESTORE`; sync until COMMIT) |
| POST | `/api/restore/cancel` | Best-effort cancel before copy-in |
| DELETE | `/api/restore/session` | Drop the confirm token |

Backup/restore live under `src/lib/backup/*`. In-app restore copies the snapshot into the open `library.db` (same inode); holdings trees are not overwritten. Restore HTTP is refused when LAN mode is on unless `NON_OS_RESTORE_OK=1`. Archives never include `.env` / API keys / SuperGrok credentials.

All data routes: `runtime = "nodejs"`, `dynamic = "force-dynamic"` where used.

## Trust & threat model (v1)

- Process binds loopback; no auth (acceptable only for single-user localhost).  
- Do not change bind without adding authentication.  
- Agent cannot leave configured roots (tools only return catalog data).  
- Media API path-traversal checks are mandatory for any new file-serving endpoints.

## Dependencies (intentional)

- **Next 15** App Router  
- **better-sqlite3** + **drizzle-orm** (typed schema; raw SQL for FTS)  
- **sharp**, **picomatch**, **mime**, **zod**  
- **ai** + **@ai-sdk/xai** + **@ai-sdk/react** for optional cloud agent  
- **Tailwind v4** (`@import "tailwindcss"`)

No Payload CMS — custom catalog domain by design.
