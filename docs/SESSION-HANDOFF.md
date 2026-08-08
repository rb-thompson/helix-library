# Session handoff — Helix Library

**Last updated:** 2026-08-07  
**Repo:** `/home/brandon/Projects/non-os` (package name `helix-library`)  
**Status:** Daily-usable OPAC. **Curation & intake shipped.** **Discovery season shipped.** **Acquire depth Tier 1 shipped** (OpenAlex + web clip + Grok image fix) — [designs/2026-08-acquire-depth.md](./designs/2026-08-acquire-depth.md). Optional Discovery **PR6** open events and Acquire Tier 2 (Grokipedia) remain stretch.

Read [AGENTS.md](../AGENTS.md) first, then this file.

---

## One-paragraph summary

**Helix Library** is a localhost personal OPAC: Next.js 15 + SQLite FTS over explicit scan roots (`archive/` primary), media preview, collections/tags/**smart shelves**, hybrid search with snippets, **reading room** (text/code + PDF.js), related holdings, **2D/3D knowledge graph**, dark/light space UI (theme-swapped brand mark), **Ask the Librarian** (Grok when keyed, else local; holding-context bridge; server-side approve), and **`/acquire`** (ILL desk: arXiv, **OpenAlex OA PDFs**, **web clip → notes**, yt-dlp YouTube/podcast, Grok Imagine images). Responsive shell (phone → ultrawide). SuperGrok chat ≠ developer API key.

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
| **Acquire `/acquire`** | arXiv; **OpenAlex** search/DOI → OA PDF only; **web clip** URL → Markdown notes; YT/podcast (yt-dlp); Grok image (`grok-imagine-image-quality` + b64/url); SSRF-safe outbound; async jobs + progress; auto-tags |
| Theme / nav | Dark/light; **light helix mark** swap; Primary + More (Locations, **Acquire**, Services, Docs) |
| Shell | `.shell-x`, `--shell-max` wider at 2xl |
| Tests | `npm test` — **143 pass** |
| Docs | In-app `/docs` includes Acquire, reading room, smart shelves, graph |
| **Reading room (PR1a+1b)** | Text/code continuous + PDF.js page mode (canvas + text layer); `helix-read-position` scroll/page; `?room=1`; public unbundled pdf.min.mjs |
| **Read → act (PR2)** | Selection toolbar Tag/Ask/Copy; `/ask?item=`; transport `holdingItemId` + quote; system appendix; local summarize → indexed body |
| **Related (PR3)** | `getRelatedHoldings` — same folder / shared tags / co-shelved; panel on item detail; exclude missing |
| **Smart shelves (PR4)** | `collections.kind` + `query_json`; resolve facade; catalog/graph expand ≤2000; hard-fail add; detail `?page=` |
| **Graph scale (PR5)** | `meta.totalItems` / `maxItems`; 2D `force-graph` + 3D toggle (`helix-graph-mode`); cap chips 200/400/600 |
| **Brand + docs (PR7)** | `helix-mark-light.png`; HelixMark CSS theme swap; PRODUCT / `/docs` / AGENTS / design status |

---

## Git baseline

**Baseline:** `ba23e55` — Ship Helix Library (graph, Ask, space UI, brand).

**Sliced commits on main (2026-08-06+):** curation season + Discovery PR1a–PR5 in working tree (check `git log` / status).

**Do not commit:** `.env.local`, `library.config.json`, `data/` (includes `acquire-jobs.json`, thumbs, db), personal `archive/**`, `scripts/__pycache__/`.  

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

---

## Gotchas

| Gotcha | Detail |
| --- | --- |
| Port | **4747** |
| SuperGrok | ≠ `XAI_API_KEY` for Ask or Acquire images |
| YT progress | Jobs async + poll; store on `globalThis` + `data/acquire-jobs.json` |
| YT codecs | Prefer H.264+AAC; AV1 often fails in HTML5 video |
| Media 500 | Unicode in `Content-Disposition` must use ASCII fallback + `filename*` |
| Custom thumbs | Reindex does **not** overwrite existing `data/thumbs/{id}.webp` |
| Graph mount | `graphData` before other props / pauseAnimation — avoid `layout.tick` crash |
| RSC → client | No functions as props; graph is client-only loaded |
| PDF.js + Next | Never static/webpack-bundle `pdfjs-dist` (SSR/client both break). Serve from `public/` + `webpackIgnore` dynamic import; worker + main pin **5.4.296**. |
| Build + dev | Don’t run `npm run build` while `npm run dev` shares `.next` — wipe `.next` if modules go missing. |
| Smart shelves | Resolution facade must stay wired in catalog/graph/counts; never lazy-cycle `require` against resolve. |

---

## Known gaps / natural next work

1. **Optional Discovery PR6** — server `item_events` open tracking (stretch). See discovery design.  
2. yt-dlp JS runtime (optional deno) for more formats  
3. Export/backup story  
4. **Acquire Tier 2** — Grokipedia article → Markdown (preferred over Wikipedia); Gutenberg stretch — see [designs/2026-08-acquire-depth.md](./designs/2026-08-acquire-depth.md)  
5. Embeddings / semantic search (explicit non-goal)

**Season “Curation & intake” (2026-08):** PR1–PR7 landed — see [designs/2026-08-curation-intake.md](./designs/2026-08-curation-intake.md).  

**Season “Discovery depth & reading room” (2026-08):** PR1a–PR5 + PR7 landed; PR6 stretch open — see [designs/2026-08-discovery-reading.md](./designs/2026-08-discovery-reading.md).

**Season “Acquire depth & accuracy” (2026-08):** Tier 1 landed (Grok image fix, OpenAlex OA PDF, web clip, plumbing, docs). Tier 2 Grokipedia optional.

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

**Smoke:** home → catalog → **text** holding (scroll restore) → **PDF** holding (page nav, text select, reload restores page; Network 206 Range) → Tag/Ask from selection → related panel → smart shelf filter → `/graph` 2D/3D → `/ask?item=` → theme toggle (light mark) → `/docs` → `/acquire`.

---

## Session wrap (2026-08-07) — Acquire depth Tier 1

**Closed Acquire depth Tier 1:** shared `outbound.ts` SSRF helper; Grok image default `grok-imagine-image-quality` + b64/url + cloud gate; OpenAlex search/DOI → OA PDF (accuracy badges); web clip URL → `notes/*.md`; job kinds `openalex`/`clip`; desk cards; PRODUCT / SESSION-HANDOFF / AGENTS / `/docs` updated. Design: [2026-08-acquire-depth.md](./designs/2026-08-acquire-depth.md).

**Still optional:** Discovery PR6 open events; Acquire Tier 2 Grokipedia; export/backup.
