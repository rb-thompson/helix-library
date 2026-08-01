# Architecture — non-os

## Goals

1. Index personal files under **explicit** roots into a queryable catalog.
2. Present a library-style web surface (browse, locate, curate, preview).
3. Provide one conversational **Librarian** over the same catalog (read-only).
4. Stay **localhost-only** and privacy-first.

## System diagram

```text
┌─────────────────────────────────────────────────────────────┐
│  Web surface (Next.js 15 App Router + React 19)             │
│  /  /catalog  /catalog/[id]  /collections  /locations       │
│  /services  /ask  /docs                                     │
│  Header (client hamburger < lg) · Footer · tooltips         │
└───────────────────────────┬─────────────────────────────────┘
                            │ RSC / fetch
┌───────────────────────────▼─────────────────────────────────┐
│  API routes (Node runtime)                                  │
│  reindex · media · thumbs · locations · collections · tags  │
│  ask · threads                                              │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Library core (`src/lib`)                                   │
│  config · db · indexer · catalog · collections · locations  │
│  media · agent · machine                                    │
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
| `jobs` | Reindex job log + stats_json |
| `collections` / `collection_items` | Manual shelves |
| `tags` / `item_tags` | Labels on items |
| `chat_threads` / `chat_messages` | Librarian conversations |

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
| Mode resolution | `src/lib/agent/mode.ts` |
| Local answers | `src/lib/agent/local.ts` (intent → catalog/machine/help) |
| LLM tools | `src/lib/agent/tools.ts` (AI SDK `tool()`) |
| System prompt | `src/lib/agent/prompt.ts` |
| Persistence | `src/lib/agent/threads.ts` |
| HTTP | `POST /api/ask`, `GET /api/ask` (status), threads API |
| UI | `src/components/LibrarianChat.tsx` |

**local:** `createUIMessageStream` of `localLibrarianReply(userText)`.  
**xai:** `streamText` + `createXai` + `xai.responses(model)` + tools, `stopWhen: stepCountIs(8)`.

Tools (read-only): `catalog_search`, `catalog_get`, `list_locations`, `list_collections`, `machine_status`, `system_help`.

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
| `/services` | Reindex + machine facts |
| `/ask` | Chat |
| `/docs` | End-user getting started |

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
