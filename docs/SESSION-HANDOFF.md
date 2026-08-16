# Session handoff — Helix Library

**Last updated:** 2026-08-16 (docs handbook + Circulation brand wave)  
**Repo:** `/home/brandon/Projects/non-os` (package name `helix-library`)  
**Tip:** `origin/main` — restore UI + left sidebar + look-feel craft + expanded `/docs` + Circulation stills. Lucide nav (custom glyphs reverted).  
**Status:** Daily-usable OPAC. **Curation, Discovery, Acquire, export/backup, Deep Lens S2, restore UI, left rail, look-feel craft, handbook `/docs`, Circulation brand wave** shipped. Required craft PRs 1a–7 done. Optional leftover: craft PR8 catalog j/k (after living with PR3). Next product: Discovery PR6 `item_events`. Do not start embeddings.

Read [AGENTS.md](../AGENTS.md) first, then this file.

---

## One-paragraph summary

**Helix Library** is a localhost personal OPAC: Next.js 15 + SQLite FTS over explicit scan roots (`archive/` primary), media preview, collections/tags/**smart shelves**, hybrid search with snippets, **reading room** (text/code + PDF.js), related holdings, **2D/3D knowledge graph**, dark/light space UI (theme-swapped brand mark), **Ask the Librarian** (Grok when keyed, else local; holding-context bridge; server-side approve), **`/acquire`** (ILL desk: arXiv, **OpenAlex OA PDFs**, **web clip → notes**, yt-dlp YouTube/podcast, Grok Imagine images), and Services **restore from snapshot**. **Collapsible left sidebar** (desktop rail; phone drawer). SuperGrok chat ≠ developer API key.

---

## Locked product decisions

| Decision | Choice |
| --- | --- |
| Product name | **Helix Library** (UI/docs); env prefix still `NON_OS_*` |
| Metaphor | Personal library OPAC |
| Stack | Next.js 15 + React 19 + SQLite + Tailwind v4 |
| Bind | Loopback default; LAN + Basic auth optional |
| Agent | Grok-first with `XAI_API_KEY`; else local |
| Agent writes | Approval-gated only; no shell |
| SuperGrok | Does **not** power Ask or Acquire images |
| Primary holdings | `./archive` |
| Acquisitions | Own route **`/acquire`** (not buried only in Services) |
| Brand | Generated H+helix mark (dark + light assets); favicon from mark; no logo hover scale |
| Reading position | Client `helix-read-position` only (no server open events unless PR6) |

---

## What works (verify before new work)

| Area | Notes |
| --- | --- |
| Catalog | Hybrid FTS+LIKE, **snippets + highlight**, sort, `under`, facets, grid/list, bulk Select |
| Weeding | `/catalog?missing=1`; bulk **Remove from catalog** (DB only, never disk) |
| Tags | Collapsible; **hygiene panel** (Collections); `vision-tagged` hidden from facets/graph |
| Media | Stream + Range; **unicode filenames fixed** in `Content-Disposition` |
| Video thumbs | Auto poster via ffmpeg; **VideoThumbEditor** on item detail (frame seek / upload / clear) |
| PDF/notes | Body → FTS; agent `catalog_read` |
| Collections | Manual shelves + **smart shelves** (`kind`/`query_json`) + tag hygiene |
| Graph `/graph` | Theme-aware phosphor; **2D + 3D**; physics; cap chips + `totalItems`; client-only load |
| Reindex | Async + poll; `npm run watch` optional |
| Ask | Viewport chat; sticky composer; **holding chip** + `holdingItemId`; Grok/local approve |
| **Acquire `/acquire`** | arXiv; OpenAlex OA PDF; web clip; **Grokipedia**; **image URL**; YT/podcast; Grok image; Ask propose+approve for all acquire kinds; SSRF outbound; jobs + auto-tags |
| Theme / nav | Dark/light; **light helix mark** swap; **left sidebar** (Stacks + Library ops); header is jobs + theme |
| Shell | `.app-frame` offset by `--sidebar-rail`; `.shell-x`, `--shell-max` wider at 2xl |
| Tests | `npm test` — **270 pass** (toasts + catalogHref + restore/Deep Lens/hours) |
| **Look-feel craft** | Design: [docs/designs/2026-08-look-feel-craft.md](./designs/2026-08-look-feel-craft.md). Tokens + lamp + overlay; toast/ProgressBar/InlineStatus; header adaptive poll; catalog `replace` while typing; holding folios + optimistic tags/dismiss; item room + lamp `?room=1`; Hours lamp; Ask bubbles; shared job bars; graph/collections/services chrome. `/design` is the living spec. Optional **PR8** j/k browse. |
| Docs | In-app `/docs` is a full handbook (map, building, every desk, privacy, keyboard). Field guide: `archive/documents/Helix-Library-Field-Guide.md` |
| **Reading room (PR1a+1b)** | Text/code continuous + PDF.js page mode (canvas + text layer); `helix-read-position` scroll/page; `?room=1`; public unbundled pdf.min.mjs |
| **Read → act (PR2)** | Selection toolbar Tag/Ask/Copy; `/ask?item=`; transport `holdingItemId` + quote; system appendix; local summarize → indexed body |
| **Related (PR3)** | `getRelatedHoldings` — same folder / shared tags / co-shelved; panel on item detail; exclude missing |
| **Smart shelves (PR4)** | `collections.kind` + `query_json`; resolve facade; catalog/graph expand ≤2000; hard-fail add; detail `?page=` |
| **Graph scale (PR5)** | `meta.totalItems` / `maxItems`; 2D `force-graph` + 3D toggle (`helix-graph-mode`); cap chips 200/400/600 |
| **Brand + docs (PR7)** | `helix-mark-light.png`; HelixMark CSS theme swap; PRODUCT / `/docs` / AGENTS / design status |
| **Deep Lens** | `/lens` + `/lens/[id]` dossier: 3D kind-object, `lens_analyses` cache, Run analysis (local/xAI), related, Your insights, Ask |
| **Restore** | Services **Restore from snapshot** — inspect `helix-backup-v1`, type `RESTORE`, undo snapshot, ATTACH copy-in. Holdings not overwritten. `npm run restore`. LAN HTTP off unless `NON_OS_RESTORE_OK=1`. |

---

## Git baseline

**This wrap:** look-feel craft season on `main` (tokens/primitives + PR2–PR7).  
**Older landmark:** `ba23e55` — first daily Helix ship.

**Do not commit:** `.env.local`, `library.config.json`, `data/` (db, thumbs, exports), personal `archive/**`, `scripts/__pycache__/`.  

---

## Environment

```bash
# .env.local (gitignored) — typical:
# XAI_API_KEY=...
# NON_OS_AGENT_MODE=auto
# NON_OS_USE_XAI=1
# NON_OS_MODEL=grok-4.3
# NON_OS_IMAGE_MODEL=grok-imagine-image-quality   # Acquire Grok images
# NON_OS_OPENALEX_API_KEY=...   # free key from openalex.org/settings/api
# NON_OS_OPENALEX_MAILTO=you@example.com   # optional polite UA
```

| Item | Value |
| --- | --- |
| Port | **4747** |
| Dev | `npm run dev` → `http://127.0.0.1:4747` |
| Watch reindex | `npm run watch` (enabled roots only) |

### Host tools

| Tool | Used for |
| --- | --- |
| `ffmpeg` / `ffprobe` | Video thumbs, duration, yt-dlp merges |
| `exiftool` | EXIF panel + **Acquire auto-tags** from embedded metadata |
| `yt-dlp` | Acquire YouTube/podcast (`pip3 install -U yt-dlp`) |
| `sharp` (npm) | Image dims/thumbs + custom thumb upload |

---

## Key code map (this session)

| Path | Role |
| --- | --- |
| `src/lib/acquire/*` | paths jail, outbound SSRF, arxiv, openalex, clip, youtube, grok-image, jobs (SQLite unified), auto-tags |
| `src/app/acquire/page.tsx` | Acquisitions desk UI shell |
| `src/components/AcquireDesk.tsx` | Papers/OpenAlex, clip, arXiv, YT, Grok image cards + job poll |
| `src/app/api/acquire/**` | status, arxiv, openalex, clip, youtube, image, jobs/[id] |
| `src/lib/catalog/weed.ts` | Purge missing catalog rows only |
| `src/lib/catalog/snippet.ts` | Search snippets + highlight segments |
| `src/lib/graph/colors.ts` | Theme-aware graph palette |
| `src/components/KnowledgeGraph.tsx` | 3D graph + controls; layout-safe mount order |
| `src/components/KnowledgeGraph2D.tsx` | 2D canvas force-graph renderer |
| `src/components/KnowledgeGraphLoader.tsx` | `dynamic(..., { ssr: false })` + mode toggle |
| `src/lib/client/graph-mode.ts` | `helix-graph-mode` preference |
| `src/components/LibrarianChat.tsx` | Viewport chat, thread sheet, textarea |
| `src/components/AskChatClient.tsx` | Holding-context Ask shell |
| `src/components/VideoThumbEditor.tsx` | Frame grab / upload / clear thumb |
| `src/lib/media/thumb.ts` | Thumb set/clear helpers |
| `src/app/api/media/[id]/route.ts` | **RFC 5987** Content-Disposition (unicode titles) |
| `src/components/DocumentReadingRoom.tsx` | Text + PDF room shell; iframe fallback |
| `src/components/PdfPageViewer.tsx` | PDF.js page mode + text layer (dynamic import) |
| `src/components/SelectionToolbar.tsx` | Tag / Ask / Copy from selection |
| `src/components/RelatedHoldingsPanel.tsx` | Item detail related rail |
| `public/pdf.min.mjs` + `pdf.worker.min.mjs` | Unbundled PDF.js 5.4.296 (do **not** webpack-import `pdfjs-dist` — breaks). `npm run sync:pdfjs` |
| `src/lib/media/pdfjs-client.ts` | Client loader: `import(/* webpackIgnore */ '/pdf.min.mjs')` |
| `src/lib/client/read-position.ts` | `helix-read-position` LRU (scroll/page) |
| `src/lib/media/text.ts` | Capped UTF-8 load + clamp; jail via resolveMediaItem |
| `src/lib/media/reading-room.ts` | Client-safe allowlist / modes / `supportsReadingRoom` |
| `src/app/api/items/[id]/text/route.ts` | Text API JSON (not media `?text=1`) |
| `src/lib/catalog/related.ts` | Structural related holdings (dir / tags / shelves) |
| `src/lib/collections/manage.ts` | Smart shelves facade: resolve/count/assert |
| `src/lib/catalog/query.ts` | `searchCatalogItemIds` + `SMART_ID_HARD_CAP` |
| `next.config.ts` | `transpilePackages` for three / 3d-force-graph / force-graph |
| `src/components/HelixMark.tsx` | Dark + light mark; CSS theme swap |
| `public/helix-mark.png` / `helix-mark-light.png` | Brand assets |
| `src/lib/lens/*` | Focus, human insights, dossier analyses, kind-object specs, run-analyze |
| `src/app/lens/**` | Deep Lens routes |
| `src/components/lens/*` | Dossier shell, KindObject, analysis panel, Your insights |
| `src/app/api/insights/**` | Human insight create/list/delete |
| `src/app/api/lens/analyses/**` | Machine dossier GET/POST |
| `src/lib/client/library-hours.ts` | Time-of-day phase + hourly cart pick |
| `src/components/HoursDesk.tsx` | Home due-slip (“left on the cart”) |
| `src/lib/client/toasts.ts` | Toast store (max 3, href sanitizer, 6s dismiss) |
| `src/lib/catalog/href.ts` | Catalog URL builder + default-param omit table |
| `src/components/CatalogSearch.tsx` | Client catalog search; `replace` while typing, `push` on submit |
| `src/components/CatalogResultsShell.tsx` | Pending dim XOR skeletons |
| `src/components/ItemCardSkeleton.tsx` | Folio-shaped loading cards |
| `src/lib/client/sidebar.ts` | `helix-sidebar` expanded/collapsed; ThemeScript sets `data-sidebar` before paint |
| `src/components/AppShell.tsx` | Sidebar context + `[` toggle on desktop |
| `src/components/AppSidebar.tsx` | Left rail / phone drawer |
| `src/components/Header.tsx` | Jobs + theme; hamburger opens the same drawer |
| `src/lib/backup/*` | Create/list/inspect/apply restore; session + sidecar + LAN gate |
| `src/components/RestorePanel.tsx` | Services typed-`RESTORE` confirm |
| `scripts/restore.ts` | `npm run restore` (list by default; `--inspect <name>`; apply with `--name` + `--phrase RESTORE`) |

---

## Gotchas

| Gotcha | Detail |
| --- | --- |
| Port | **4747** |
| SuperGrok | ≠ `XAI_API_KEY` for Ask or Acquire images |
| YT progress | Jobs async + poll; unified SQLite `jobs` (legacy `acquire-jobs.json` imported then abandoned) |
| YT codecs | Prefer H.264+AAC; AV1 often fails in HTML5 video |
| Media 500 | Unicode in `Content-Disposition` must use ASCII fallback + `filename*` |
| Custom thumbs | Reindex does **not** overwrite existing `data/thumbs/{id}.webp` |
| Graph mount | `graphData` before other props / pauseAnimation — avoid `layout.tick` crash |
| RSC → client | No functions as props; graph is client-only loaded |
| PDF.js + Next | Never static/webpack-bundle `pdfjs-dist` (SSR/client both break). Serve from `public/` + `webpackIgnore` dynamic import; worker + main pin **5.4.296**. |
| Build + dev | Don’t run `npm run build` while `npm run dev` shares `.next` — wipe `.next` if modules go missing. |
| Smart shelves | Resolution facade must stay wired in catalog/graph/counts. Lazy `require()` of `resolveCollectionItemIds` is intentional; put `eslint-disable-next-line no-require-imports` **on the `require(` line**, not the destructure. |
| ESLint build | `next build` fails on `@typescript-eslint/no-require-imports` even when `tsc` is clean. |
| Restore LAN | Restore HTTP is refused when `lanModeEnabled()` unless `NON_OS_RESTORE_OK=1`. |
| Restore holdings | In-app never overwrites live stacks. Full archives list `holdings/` as present-not-applied. |
| Restore + watch | Stop `npm run watch` if apply reports another process has the catalog open. |
| Sidebar FOUC | Collapse width is `html[data-sidebar]`; ThemeScript must set it (same pattern as theme). |
| Sidebar `[` | Desktop only; ignored in inputs. Phone drawer ignores collapse. |
| Reindex percent | Header compact bar only if `percent != null`. Reindex jobs never fake-fill. |
| Catalog history | Search `replace` while typing; `push` on submit / facet / sort. Do not toast every default tone at once (max 3). |
| Optimistic catalog | Tags / shelves / dismiss only. Restore stays ugly (typed `RESTORE`). |

---

## Known gaps / natural next work

**Best next:**

1. **Discovery PR6** — in review on `discovery/pr6-item-events` (`item_events` dual-write with `helix-open-history`).

**Stretch / later:**

2. Gutenberg / Standard Ebooks (known-host EPUB only)  
3. yt-dlp JS runtime (optional deno)  
4. Lens leftovers: DELETE analyses API, agent `lens_analyze` tool  
5. Holdings restore (sibling `archive.restored-<stamp>/` + Locations remap — not live-root overwrite)  
6. Embeddings / semantic search — **explicit non-goal**

**Season “Curation & intake” (2026-08):** PR1–PR7 landed — see [designs/2026-08-curation-intake.md](./designs/2026-08-curation-intake.md).  

**Season “Discovery depth & reading room” (2026-08):** PR1a–PR5 + PR7 landed; PR6 stretch open — see [designs/2026-08-discovery-reading.md](./designs/2026-08-discovery-reading.md).

**Season “Look-feel craft” (2026-08):** PR1a–7 landed — see [designs/2026-08-look-feel-craft.md](./designs/2026-08-look-feel-craft.md). Optional PR8 catalog j/k after living with PR3.

**Season “Acquire depth & accuracy” (2026-08):** Tier 1 + Grokipedia + image URL + Ask acquire parity landed. Gutenberg remains stretch.

---

## Resume script (next session)

```bash
cd /home/brandon/Projects/non-os
git status && git log -3 --oneline
# AGENTS.md → this file
npm install
npm run typecheck && npm test
npm run dev    # http://127.0.0.1:4747
# optional: yt-dlp, ffmpeg, exiftool; XAI_API_KEY for Grok Ask/images
```

**Smoke:** home → **sidebar** (collapse, `[`, reload keeps collapsed; phone hamburger drawer) → catalog → **text** holding (scroll restore) → **PDF** holding (page nav, text select, reload restores page; Network 206 Range) → Tag/Ask from selection → related panel → smart shelf filter → `/graph` 2D/3D (fullscreen still covers rail) → `/ask?item=` → theme toggle (light mark) → `/docs#services` → `/acquire` → `/lens/{id}` (kind-object + Run analysis) → `/services` inspect a catalog archive **without** applying → mini player (play audio/video, navigate away, bar persists).

---

## Session wrap (2026-08-07) — Acquire depth Tier 1

**Closed Acquire depth Tier 1:** shared `outbound.ts` SSRF helper; Grok image default `grok-imagine-image-quality` + b64/url + cloud gate; OpenAlex search/DOI → OA PDF (accuracy badges); web clip URL → `notes/*.md`; job kinds `openalex`/`clip`; desk cards; PRODUCT / SESSION-HANDOFF / AGENTS / `/docs` updated. Design: [2026-08-acquire-depth.md](./designs/2026-08-acquire-depth.md).

**Still optional:** Discovery PR6 open events; Gutenberg. Restore UI shipped.

## Session wrap (2026-08-08) — Export / backup

**Shipped:** catalog + full backups to `data/exports/*.tar.gz` (SQLite snapshot, config, thumbs, optional holdings); Services **Export / backup** panel; `npm run backup`; download/delete APIs; job kind `backup`.

## Session wrap (2026-08-13–15) — Deep Lens S2 dossier

**Shipped:** `/lens` + `/lens/[id]` dossier (3D kind-objects + KindPoster fallback), `insights` + `lens_analyses`, Run analysis (local extractive / xAI `generateObject`), vision stretch for image/video, jobs `lens_analyze` with durable `progress.itemId`, suggested-tag apply. Design: [2026-08-deep-lens-dossier.md](./designs/2026-08-deep-lens-dossier.md).

**Also on main since prior wrap:** Grokipedia + image URL + Ask acquire parity; multi-location acquire; mini player; `/design` lab; rescue dismiss; lightbox zoom.

## Session wrap (2026-08-15 morning) — land + handoff

**This session:** reviewed gaps; found Deep Lens fully built but **uncommitted**; verified (`tsc`, tests, `next build`); fixed pre-existing `require()` ESLint; committed **`1aae6bc`** and **pushed** to `origin/main`. Tests now **183**.

**Docs:** SESSION-HANDOFF, ARCHITECTURE, AGENTS test count, Acquire design status (Grokipedia is shipped).

**Delight (not a product season):** home **Hours desk** — time-of-day line + one hourly “left on the cart” due-slip (`src/lib/client/library-hours.ts`, `HoursDesk`). Deep Lens: tap the kind-object **three times** for a “Date due / never” stamp.

**Still optional:** Discovery PR6; Gutenberg.

**Do not start:** embeddings, batch-analyze, auto-apply AI tags.

## Session wrap (2026-08-15) — Restore UI

**Shipped:** inspect `helix-backup-v1` + tar jail; `restore` job kind + confirm session; ATTACH copy-in + undo snapshot + path rewrite; `/api/restore*` + `npm run restore` + LAN gate; Services **Restore from snapshot** (typed `RESTORE`); archive `RESTORE.md` leads with the in-app path. Holdings stay a non-goal. SuperGrok and API keys are still not archived. Design: [2026-08-restore.md](./designs/2026-08-restore.md) **Implemented** (PR1–PR6).

**Still optional:** Discovery PR6 `item_events`; Gutenberg.

**Do not start:** embeddings, batch-analyze, auto-apply AI tags, holdings overwrite, upload desk, agent restore action.

## Session wrap (2026-08-15 evening) — left sidebar

**Shipped:** collapsible left rail (`AppShell` / `AppSidebar`). Desktop: Stacks + Library ops, collapse to icons (`helix-sidebar` + `data-sidebar`, `[` toggle). Phone: hamburger opens the same list as a drawer under the header. Header is jobs + theme. Graph fullscreen still covers the rail.

**Still optional:** Discovery PR6 `item_events`; Gutenberg.

**Do not start:** embeddings, batch-analyze, auto-apply AI tags.

## Session wrap (2026-08-16) — handbook + Circulation brand wave

**Shipped:** `/docs` rewritten as a comprehensive Helix overview (library map, building chrome, weeding, thumbs, mini player, smart shelves, Deep Lens, Acquire, Ask, restore, privacy, keyboard). Pushed as `440fd81`. Hands-on field guide with 15 labs written to `archive/documents/Helix-Library-Field-Guide.md` (holding, gitignored). Brand wave: night/day heroes, card lattices, folio banner, nameplate study, `btn-helix` / `btn-lamp`. Nav stays Lucide — custom glyphs were well-intentioned and not good enough.

**Still optional:** Discovery PR6 `item_events`; Gutenberg; craft PR8 catalog j/k.

**Do not start:** embeddings, batch-analyze, auto-apply AI tags.
