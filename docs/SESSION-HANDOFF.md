# Session handoff — Helix Library

**Last updated:** 2026-08-06  
**Repo:** `/home/brandon/Projects/non-os` (package name `helix-library`)  
**Status:** Daily-usable OPAC. **Curation & intake shipped (PR1–PR7).** Next season **Discovery depth & reading room approved** — implement from [designs/2026-08-discovery-reading.md](./designs/2026-08-discovery-reading.md).

Read [AGENTS.md](../AGENTS.md) first, then this file.

---

## One-paragraph summary

**Helix Library** is a localhost personal OPAC: Next.js 15 + SQLite FTS over explicit scan roots (`archive/` primary), media preview, collections/tags, hybrid search with snippets, **3D knowledge graph** (retro-terminal colors + physics controls), dark/light space UI, **Ask the Librarian** (Grok when keyed, else local; server-side approve), and **`/acquire`** (ILL desk: arXiv search/fetch, yt-dlp YouTube/podcast, Grok images). Responsive shell (phone → ultrawide). SuperGrok chat ≠ developer API key.

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
| Brand | Generated H+helix mark; favicon from mark; no logo hover scale |

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
| Collections | Shelves + tag hygiene |
| Graph `/graph` | Theme-aware phosphor colors; layers; **physics sliders**; singleton toggle; client-only load |
| Reindex | Async + poll; `npm run watch` optional |
| Ask | Viewport chat shell; sticky composer; threads sheet &lt;lg; Grok/local approve |
| **Acquire `/acquire`** | arXiv search + fetch; YT/podcast (yt-dlp); Grok image; **async jobs + green progress**; auto-tags |
| Theme / nav | Dark/light; Primary + More (Locations, **Acquire**, Services, Docs) |
| Shell | `.shell-x`, `--shell-max` wider at 2xl |
| Tests | `npm test` — **47 pass** (2026-08-05) |
| Docs | In-app `/docs` includes Acquire |

---

## Git baseline

**Baseline:** `ba23e55` — Ship Helix Library (graph, Ask, space UI, brand).

**Sliced commits on main (2026-08-06):**

1. `412ba9f` — responsive shell, brand icons, `npm run watch`
2. `3d496f0` — catalog weeding, search snippets, tag hygiene
3. `12997a9` — graph theme colors, controls, client-only load
4. `0180420` — Ask viewport chat shell
5. tip — Acquire desk, media unicode, video thumb editor, docs

**Do not commit:** `.env.local`, `library.config.json`, `data/` (includes `acquire-jobs.json`, thumbs, db), personal `archive/**`, `scripts/__pycache__/`.  

---

## Environment

```bash
# .env.local (gitignored) — typical:
# XAI_API_KEY=...
# NON_OS_AGENT_MODE=auto
# NON_OS_USE_XAI=1
# NON_OS_MODEL=grok-4.3
# NON_OS_IMAGE_MODEL=grok-imagine-image   # Acquire Grok images
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
| `src/lib/acquire/*` | paths jail, arxiv search/fetch, youtube+progress, grok-image, jobs (globalThis + `data/acquire-jobs.json`), auto-tags |
| `src/app/acquire/page.tsx` | Acquisitions desk UI shell |
| `src/components/AcquireDesk.tsx` | Tool cards, search results, job poll + green progress |
| `src/app/api/acquire/**` | status, arxiv, arxiv/search, youtube, image, jobs/[id] |
| `src/lib/catalog/weed.ts` | Purge missing catalog rows only |
| `src/lib/catalog/snippet.ts` | Search snippets + highlight segments |
| `src/lib/graph/colors.ts` | Theme-aware graph palette |
| `src/components/KnowledgeGraph.tsx` | 3D graph + controls; layout-safe mount order |
| `src/components/KnowledgeGraphLoader.tsx` | `dynamic(..., { ssr: false })` |
| `src/components/LibrarianChat.tsx` | Viewport chat, thread sheet, textarea |
| `src/components/VideoThumbEditor.tsx` | Frame grab / upload / clear thumb |
| `src/lib/media/thumb.ts` | Thumb set/clear helpers |
| `src/app/api/media/[id]/route.ts` | **RFC 5987** Content-Disposition (unicode titles) |
| `next.config.ts` | `transpilePackages` for three / force-graph |

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

---

## Known gaps / natural next work

Covered by next-season design (do not invent parallel tracks without reading it):

1. **[docs/designs/2026-08-discovery-reading.md](./designs/2026-08-discovery-reading.md)** — **Discovery depth & reading room** (draft pending approval)  
   - Reading room (text/PDF.js), select→tag/ask, related holdings, smart shelves, graph 2D + totalItems, optional open events, light brand  

Still parked (not in that design as required):

2. yt-dlp JS runtime (optional deno) for more formats  
3. Export/backup story  
4. Acquire multi-source search-then-save (OpenAlex etc.)  
5. Embeddings / semantic search (explicit non-goal for next season)

**Season “Curation & intake” (2026-08):** PR1–PR7 landed — see [designs/2026-08-curation-intake.md](./designs/2026-08-curation-intake.md).  

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

**Smoke:** home → catalog (search highlight) → weeding if missing → `/acquire` (arXiv search + YT progress) → video detail thumb editor → `/graph` (theme + sliders) → `/ask` (composer sticky) → logo/favicon.

---

## Session wrap (2026-08-06)

**Closed:** Curation & intake season (PR1–PR7) — titles, tag source/merge/hide, unified jobs, Ask→Acquire, rescue/recent, graph filters, polish. Private repo synced. **83 tests pass** (tip before next-season design: `7fcfdd3`; design commit on top).

**This wrap:** Growth review → new design **Discovery depth & reading room** ([designs/2026-08-discovery-reading.md](./designs/2026-08-discovery-reading.md)), design-loop rev 3, **0 open review issues**. Status: **Draft pending owner approval** — do not implement until signed off.

**Earlier stretch (to `ba23e55` + post-ship):** shell, weeding, snippets, graph polish, Ask shell, Acquire, media/thumbs, then intentional commit slices.
