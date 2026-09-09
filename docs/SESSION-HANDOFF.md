# Session handoff — Helix Library

**Last updated:** 2026-08-19 (Night Moth presence + tight craft)  
**Repo:** clone root (`$REPO_ROOT` / this directory) (package name `helix-library`)  
**Tip:** `origin/ship-grade/presence` — Arcade Night Moth world, fauna, craft. `origin/main` is still Discovery PR6 + craft PR8.  
**Status:** Daily-usable OPAC plus **ship-grade pass** plus **Night Moth** as a real after-hours game (Ward/Acre, collision, moon key, cabinet menus). Stretch: Gutenberg. Do not start embeddings.

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
| Catalog | Hybrid FTS+LIKE, **snippets + highlight**, sort, `under`, facets, grid/list, bulk Select, **j/k browse ring** |
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
| Tests | `npm test` — **317 pass** (Night Moth terrain, fauna, collision, cabinet, shot parse) |
| **Look-feel craft** | Design: [docs/designs/2026-08-look-feel-craft.md](./designs/2026-08-look-feel-craft.md). Tokens + lamp + overlay; toast/ProgressBar/InlineStatus; header adaptive poll; catalog `replace` while typing; holding folios + optimistic tags/dismiss; item room + lamp `?room=1`; Hours lamp; Ask bubbles; shared job bars; graph/collections/services chrome; **PR8 j/k browse**. `/design` is the living spec. |
| Docs | In-app `/docs` is a presentation handbook (floor plan + workflows). Field guide: `archive/documents/Helix-Library-Field-Guide.md` |
| Night moth | Circulation clerk (not the logo). Hours due-slip, `/docs` hero, `/design` stills, `public/og-helix.jpg` |
| **Reading room (PR1a+1b)** | Text/code continuous + PDF.js page mode (canvas + text layer); `helix-read-position` scroll/page; `?room=1`; public unbundled pdf.min.mjs |
| **Read → act (PR2)** | Selection toolbar Tag/Ask/Copy; `/ask?item=`; transport `holdingItemId` + quote; system appendix; local summarize → indexed body |
| **Related (PR3)** | `getRelatedHoldings` — same folder / shared tags / co-shelved; panel on item detail; exclude missing |
| **Smart shelves (PR4)** | `collections.kind` + `query_json`; resolve facade; catalog/graph expand ≤2000; hard-fail add; detail `?page=` |
| **Graph scale (PR5)** | `meta.totalItems` / `maxItems`; 2D `force-graph` + 3D toggle (`helix-graph-mode`); cap chips 200/400/600 |
| **Brand + docs (PR7)** | `helix-mark-light.png`; HelixMark CSS theme swap; PRODUCT / `/docs` / AGENTS / design status |
| **Deep Lens** | `/lens` + `/lens/[id]` dossier: 3D kind-object, `lens_analyses` cache, Run analysis (local/xAI), related, Your insights, Ask |
| **Restore** | Services **Restore from snapshot** — inspect `helix-backup-v1`, type `RESTORE`, undo snapshot, ATTACH copy-in. Holdings not overwritten. `npm run restore`. LAN HTTP off unless `NON_OS_RESTORE_OK=1`. |
| **Open events (PR6)** | `item_events`; `POST /api/items/[id]/events`; 60s dedupe; prune 500; home recent list merges with `helix-open-history`. Reading position stays client-only. |
| **Arcade** | Sidebar **Arcade** + `/arcade` + `/arcade/night-moth`. 3D flight on **The Ward / The Acre**: authored lots, roofs you can perch on, rim mountains, cave, waterways + fish. True/lure lamps with shape tells. Fauna (mites green/purple/blue, beetles, webs, bloom, dragonflies). Events: bat (escape to retreat), wasp, infestations, silent aurora. HUD visor + radar. Radio from catalog audio. **F8** files a shot to archive. Menus share the gold cabinet frame. Jacket card on home. Design: [night-moth-tight](./designs/2026-08-night-moth-tight.md). `/docs#arcade`. |

---

## Git baseline

**This wrap:** Night Moth presence + tight craft on `ship-grade/presence` (PR `#5`).  
**Older landmark:** Discovery PR6 + craft PR8 on `main` (`#1`, `#2`).  
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

See prior revisions / `src/` tree for the full path→role table (Acquire, catalog, graph, Lens, Arcade). Live layout matches AGENTS.md + repo tree.

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

**Best next:** none required. Stretch if wanted:

1. Gutenberg / Standard Ebooks (known-host EPUB only)  
2. yt-dlp JS runtime (optional deno)  
3. Agent `lens_analyze` tool (DELETE analyses API shipped)  
4. Holdings restore (sibling `archive.restored-<stamp>/` + Locations remap — not live-root overwrite)  
5. Embeddings / semantic search — **explicit non-goal**

**Season “Curation & intake” (2026-08):** PR1–PR7 landed — see [designs/2026-08-curation-intake.md](./designs/2026-08-curation-intake.md).  

**Season “Discovery depth & reading room” (2026-08):** PR1a–PR7 landed (PR6 `item_events` merged `#1`) — see [designs/2026-08-discovery-reading.md](./designs/2026-08-discovery-reading.md).

**Season “Look-feel craft” (2026-08):** PR1a–8 landed (PR8 j/k merged `#2`) — see [designs/2026-08-look-feel-craft.md](./designs/2026-08-look-feel-craft.md).

**Season “Acquire depth & accuracy” (2026-08):** Tier 1 + Grokipedia + image URL + Ask acquire parity landed. Gutenberg remains stretch.

---

## Resume script (next session)

```bash
cd "$REPO_ROOT"  # this directory / clone root
git status && git log -3 --oneline
# AGENTS.md → this file
npm install
npm run typecheck && npm test
npm run dev    # http://127.0.0.1:4747
# optional: yt-dlp, ffmpeg, exiftool; XAI_API_KEY for Grok Ask/images
```

**Smoke:** home → **sidebar** (collapse, `[`, reload keeps collapsed; phone hamburger drawer) → catalog (**j/k** browse ring, Enter opens, `x` in Select) → **text** holding (scroll restore) → **PDF** holding (page nav, text select, reload restores page; Network 206 Range) → Tag/Ask from selection → related panel → smart shelf filter → `/graph` 2D/3D (fullscreen still covers rail) → `/ask?item=` → theme toggle (light mark) → `/docs#services` → `/acquire` → `/lens/{id}` (kind-object + Run analysis) → `/services` inspect a catalog archive **without** applying → mini player (play audio/video, navigate away, bar persists) → open a holding, reload home, **Recently opened** still lists it (server `item_events`) → `/arcade/night-moth` (land on a Ward roof; H jacket; gold cabinet title).

---

## Session history

Earlier session wraps (2026-08-07 through 2026-08-17) are in git history on `main`. Path scrub uses generic `$REPO_ROOT` / clone-root wording only.

## Session wrap (2026-08-18–19) — Night Moth presence + tight craft

**Shipped on `ship-grade/presence`:** Night Moth is no longer a Roblox cabinet. Same score loop, a place you fly.

- **World:** The Ward (streets/stoops) and The Acre (farm/orchard/boiler). Authored lots + sockets. Height field (hills, rim mountains, cave under the hollow). Waterways with fish. Collision: brick, trees, hedges, lamps, **roofs you can perch on**. Hover no longer sucks you through a building.
- **Life:** Mite colours (green dart, purple pack, blue orbit). Ground beetles. Invisible webs until you fly low (mash Space). Honeysuckle / moonflower (E pollinate). Dragonflies on water. Bat (defeat or retreat). Wasp (no escape). Infestations + unannounced aurora.
- **Feel:** Moon is a key light. Water is glass. Moth has translucent wings. Lamps show **shape** until known. Scale dust is ochre flakes. HUD says each fact once; critical wing pulses; pointer-lock hint matches drag-look. **F8** files a JPEG to `archive/images/` tagged `night-moth` / `screenshot` / `arcade`. Radio from catalog audio (`[` `]` / `M`). Game + music sliders.
- **Menus:** Title, pause, settings, field guide, and high scores share the gold **cabinet** frame (wood bezel, amber marquee). Field guide is two columns.
- **Perf:** One displaced ground plane, baked height, 4 lamp lights, collider grid, pixel-ratio cap. Do not run `next build` while `next dev` shares `.next`.

**Code map:** `src/lib/arcade/night-moth/{terrain,districts,collision,fauna,events,shot}.ts`, `src/components/arcade/night-moth/{buildings,life,world,NightMothHud,NightMothRadio}.ts(x)`, `src/app/api/arcade/{radio,shot}/`, `src/lib/client/arcade-prefs.ts`. Design: [2026-08-night-moth-tight.md](./designs/2026-08-night-moth-tight.md).

**Verify:** `npm test` (**317**). Smoke `/` jacket, `/arcade`, `/arcade/night-moth` (land on a Ward roof; H for jacket; O settings; F8 shot), `/docs#arcade`.

**Still optional:** Gutenberg; agent `lens_analyze`; holdings sibling restore; home-layout retreat from photo ref; Sketchfab/MagicaVoxel hero meshes.

**Do not start:** embeddings, batch-analyze, auto-apply AI tags.
