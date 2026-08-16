# AGENTS.md — Helix Library (session handoff)

**Read this first** if you are an AI agent or a human resuming work on this repo.

## What this project is

**Helix Library** is a **personal library system** for files on one machine:

- Backend catalog (SQLite) over configured scan roots
- Next.js web UI (catalog, collections, locations, services, media preview)
- Single **Librarian** agent (default: **local**, no API key; optional xAI developer API)

Product metaphor: public-library OPAC (holdings, branches, services, “ask a librarian”) mapped to personal files + host machine limits. Reference UX inspiration: Pike County Public Library site (IA only — do not copy assets).

**Workspace:** `/home/brandon/Projects/non-os`  
**Owner intent:** personal use, localhost-only, library-native domain language (`Item`, `Location`, `Collection`, `CatalogQuery`).

## Doc map

| Doc | Audience | Purpose |
| --- | --- | --- |
| [AGENTS.md](./AGENTS.md) | Agents / new sessions | **Start here** — rules, run, status, where to edit |
| [README.md](./README.md) | Humans | Quick start, features, env vars |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Agents / engineers | Layers, data model, modules, APIs |
| [docs/SESSION-HANDOFF.md](./docs/SESSION-HANDOFF.md) | Next session | Done / not done / next work / gotchas |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Product | Scope, metaphor, non-goals |
| In-app `/docs` | End users | Getting started (UI) |

## Hard constraints (do not violate)

1. **Localhost by default** — bind is loopback unless explicit LAN preview (`NON_OS_LAN=1` + `NON_OS_ACCESS_PASSWORD` + `npm run dev:lan`). Never expose without a password.
2. **Explicit scan roots** — never default-scan `$HOME`; privacy-first.
3. **Librarian mutations are approval-gated** — no shell, no unsolicited writes, no deleting project source. After user confirm (button or “approve”/“yes”), in-app actions may run: reindex, tags, collections, location config. Never arbitrary filesystem/shell.
4. **Grok chat subscription ≠ developer API** — SuperGrok/X Premium power grok.com and partner OAuth (e.g. OpenClaw), **not** Helix Library Ask. In-app Grok needs `XAI_API_KEY` from [console.x.ai](https://console.x.ai). Default mode is **auto**: use Grok when a key is present, else local. Opt out with `NON_OS_USE_XAI=0` or force local with `NON_OS_AGENT_MODE=local`.
5. **Paths from tools only** — agent system prompt + local librarian must not invent file paths.
6. **Media serve is gated** — `/api/media/[id]` only serves indexed files under enabled location roots (`src/lib/media/serve.ts`).
7. **Do not commit** `library.config.json`, `data/`, personal `archive/**` (except `archive/README.md`), or secrets. See `.gitignore`.

## Run (local)

```bash
cd /home/brandon/Projects/non-os
npm install
# library.config.json should exist (gitignored); example is committed
npm run reindex          # index archive/ + other locations
npm run backup           # catalog → data/exports/ (add -- --full for holdings)
npm run restore          # list exports; --inspect <name>; apply --name <name> --phrase RESTORE
npm run dev              # http://127.0.0.1:4747
npm run typecheck
npm run test
npm run build && npm start
```

Port is **4747** (not 3000). Scripts pin hostname to `127.0.0.1`.

### Optional env

| Variable | Default | Meaning |
| --- | --- | --- |
| `NON_OS_CONFIG` | `./library.config.json` | Config path override |
| `NON_OS_AGENT_MODE` | `auto` | `local` \| `xai` \| `auto` (prefer Grok when key exists) |
| `NON_OS_USE_XAI` | allow | Set `0`/`false` to force local even if `XAI_API_KEY` is set |
| `XAI_API_KEY` | unset | xAI **developer** key from console.x.ai (not SuperGrok) |
| `NON_OS_MODEL` | `grok-4.3` | Model id when using Grok API (override if your team has others) |
| `NON_OS_IMAGE_MODEL` | `grok-imagine-image-quality` | xAI Imagine model for Acquire desk |
| `NON_OS_OPENALEX_API_KEY` | unset | Free OpenAlex key (or `OPENALEX_API_KEY`) for Papers desk reliability |
| `NON_OS_OPENALEX_MAILTO` | unset | Optional mailto in OpenAlex User-Agent (courtesy) |
| `NON_OS_RESTORE` | allow | Set `0`/`false` to refuse apply (inspect may still run) |
| `NON_OS_RESTORE_OK` | unset | Allow restore HTTP when LAN mode is on |

### Optional host tools

| Tool | Used for |
| --- | --- |
| `ffmpeg` | Video poster thumbs (+ often required by yt-dlp merges) |
| `ffprobe` | Duration + video dimensions |
| `exiftool` | Optional EXIF panel (`libimage-exiftool-perl`) |
| `yt-dlp` | Acquire desk: YouTube / podcast downloads |
| `sharp` (npm) | Image dimensions + thumbs |

## Architecture snapshot

```text
Browser → Next.js App Router (127.0.0.1:4747)
            ├─ pages (RSC + client components)
            ├─ API routes (reindex, media, ask, CRUD)
            └─ lib/
                 config → db (SQLite + FTS5)
                 indexer (walk, hash, enrich)
                 catalog query, collections, locations
                 media (serve, preview, exif)
                 agent (local | xai tools)
                 machine probe
```

- **DB:** `./data/library.db` (WAL). Schema bootstrapped in `src/lib/db/migrate.ts` (not drizzle-kit migrate for app runtime).
- **Config locations** sync into DB; UI location changes rewrite `library.config.json`.
- **Thumbs:** `./data/thumbs/{itemId}.webp`

## Source layout (edit map)

```text
src/
  app/                 # routes + API (/graph knowledge map)
  components/          # AppShell + AppSidebar, Header, catalog, graph, chat
  lib/
    agent/             # modes, tools, threads, local NLP, actions
    catalog/           # hybrid searchCatalog, FTS, stats
    collections/       # shelves + tags
    graph/             # buildKnowledgeGraph for /graph
    db/                # client, schema, migrate
    indexer/           # walk, hash, classify, enrich, runReindex
    locations/         # add/update/remove locations + config persist
    media/             # secure serve, preview types, exif
    machine/           # host probe
    config.ts, types.ts, nav.ts, format.ts
public/                # helix-mark.*, hero-helix.jpg
scripts/reindex.ts     # + optional vision_tag_images.py (gallery tooling)
archive/               # primary personal holdings (gitignored files)
fixtures/sample-root/  # tiny fixture tree (optional)
library.config.example.json
```

Domain language in code: **Item**, **Location**, **Collection**, **Job**, **CatalogSearchParams**.

## Conventions

- **Server-first** for data: RSC pages call `lib/*` directly; mutations via `app/api/*` or client fetch.
- **Client components** only when needed (`"use client"`): AppShell/sidebar, Header, chat, lightbox, admin forms, reindex button, catalog results.
- **Tooltips:** `.tip` + `data-tip` in `globals.css` (`Tooltip.tsx` / `HelpTip`). On touch devices CSS hides custom tips; use `title` for nav.
- **Responsive:** left sidebar at `lg+` (collapsible); hamburger drawer below `lg`. Layout max width `max-w-7xl`.
- **Native modules:** `next.config.ts` marks `better-sqlite3` and `sharp` as `serverExternalPackages`.
- Prefer **editing existing modules** over new frameworks. No Payload CMS — custom catalog is intentional.

## Verification checklist

After meaningful changes:

```bash
npm run typecheck
npm run test             # classify, indexer fixtures, local librarian, PDF
npm run reindex          # if indexer/enrichment/schema touched
npm run build            # before calling a slice “done”
# manual smoke: /  /catalog  /graph  /catalog/{id}  /ask  /docs  /collections  /locations
# media: GET /api/media/{id}  and Range request on video
```

## Current status (high level)

**Daily-usable Helix Library (2026-08-16 handoff):**

- Config + SQLite catalog + hybrid FTS/LIKE + snippets/highlights
- Indexer + enrichment; media (unicode-safe serve); EXIF; optional `npm run watch`
- Catalog + weeding (`?missing=1`); video **thumb editor**; tag hygiene
- **`/acquire`** ILL desk: arXiv; OpenAlex OA PDFs; web clip; **Grokipedia**; image URL; yt-dlp; Grok Imagine; Ask propose+approve for acquires
- **Export/backup** — Services panel + `npm run backup` → `data/exports/*.tar.gz` (catalog or full holdings)
- **Restore from snapshot** — Services inspect + typed `RESTORE` + undo snapshot; `npm run restore`. Holdings not overwritten.
- **Reading room** — text/code continuous + PDF.js page mode (text layer); `helix-read-position`
- **Smart shelves** — query-backed collections; catalog/graph resolve; live counts
- **Related holdings** on item detail (folder / tags / co-shelved)
- **`/graph`** 2D + 3D map (`force-graph` / `3d-force-graph`); `totalItems` cap UX; mobile defaults 2D
- **`/ask`** viewport chat; holding-context bridge; Grok when keyed; server-side approve
- Responsive shell; **collapsible left sidebar**; space UI; H+helix mark (dark + light) + favicon
- **Look-feel craft** — starlight tokens, lamp circulation, toasts, adaptive jobs poll, catalog replace-while-typing, holding folios, optimistic tags/shelves/dismiss, shared ProgressBar. Design: [look-feel craft](./docs/designs/2026-08-look-feel-craft.md)
- Tests: `npm test` — **270 pass** (toasts + catalogHref + restore/Deep Lens/hours)

**Shipped:** daily OPAC + Curation + Discovery + Acquire depth + **export/backup** + **Deep Lens S2 dossier** + **restore UI** + **left sidebar** + **look-feel craft (PR1a–7)**. Designs: [discovery](./docs/designs/2026-08-discovery-reading.md), [acquire depth](./docs/designs/2026-08-acquire-depth.md), [deep lens dossier](./docs/designs/2026-08-deep-lens-dossier.md), [restore](./docs/designs/2026-08-restore.md), [look-feel craft](./docs/designs/2026-08-look-feel-craft.md). Optional leftover: catalog j/k (craft PR8).

**Next work:** SESSION-HANDOFF — Discovery PR6 `item_events` (optional Gutenberg). Do not start embeddings.

## Safety for future agent features

When adding write capabilities later: human approval UI, stay inside configured roots, no arbitrary shell, keep localhost bind.
