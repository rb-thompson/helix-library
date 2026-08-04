# Session handoff — Helix Library

**Last updated:** 2026-08-04  
**Repo:** `/home/brandon/Projects/non-os` (package name `helix-library`; folder may still be `non-os`)  
**Status:** Daily-usable personal OPAC + Grok Ask + knowledge graph + space UI. **Large uncommitted working tree** since MVP commit `d3fd658` — next session should review and commit intentionally.

Read [AGENTS.md](../AGENTS.md) first, then this file.

---

## One-paragraph summary

**Helix Library** is a localhost personal OPAC: Next.js 15 + SQLite FTS over explicit scan roots (`archive/` primary), media preview, collections/tags (bulk + edit), async reindex, PDF/text extraction, hybrid search, **3D knowledge graph**, dark/light space UI with generated brand mark, and **Ask the Librarian** (Grok via xAI developer API when keyed, else local). Mutations need user approve. SuperGrok chat ≠ API key. Dense vision tags (OpenClaw gallery scripts) are handled with collapsed tag UI + thinned graph.

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
| SuperGrok | Does **not** power Ask |
| Primary holdings | `./archive` |
| Brand | Generated H+helix mark (`public/helix-mark.*`); space theme |

---

## What works (verify before new work)

| Area | Notes |
| --- | --- |
| Catalog | Hybrid FTS+LIKE, sort, `under`, facets, grid/list, bulk Select |
| Tags UI | Collapsible lists (popular first); catalog select ≤60 shared tags |
| Media | Stream + Range, thumbs, lightbox, EXIF if exiftool |
| PDF/notes | Body → FTS; agent `catalog_read` |
| Collections | Create/edit/delete; **uniform shelf cards** |
| Graph `/graph` | 3D force graph (Three.js); tags ≥2 uses, top 36; layer toggles; fullscreen fixed |
| Reindex | Async + poll |
| Ask | Grok/local; `propose_actions` + **server-side confirm** (xAI cannot fake writes) |
| Theme | Dark/light `data-theme`; `ThemeToggle` / `ThemeScript` |
| Nav | Primary: Catalog, Graph, Collections, Ask · More: Locations, Services, Docs |
| Brand | `HelixMark` → `/helix-mark.png`; hero art `/hero-helix.jpg` |
| Cards | Kind-tinted quiet chrome (holding grid/list, shelf, service tiles) |
| Tests | `npm test` — **28 pass** (2026-08-04) |
| Docs | In-app `/docs` |

---

## Uncommitted work (critical for next agent)

**Last commit on main:** `d3fd658` — MVP only. Everything below is **working tree** (modified + untracked).

### High-signal new modules (untracked)

| Path | Role |
| --- | --- |
| `src/app/graph/` | Knowledge Graph page |
| `src/lib/graph/build.ts` | Graph snapshot from SQLite |
| `src/components/KnowledgeGraph.tsx` | 3D force UI (client) |
| `src/components/HelixMark.tsx` | Brand mark image |
| `src/components/ThemeToggle.tsx`, `ThemeScript.tsx` | Theme |
| `src/components/CollapsibleTagList.tsx` | Dense tag chips |
| `src/components/AssistantMarkdown.tsx` | Ask markdown |
| `public/helix-mark.{png,webp,jpg}`, `public/hero-helix.jpg` | Brand / hero assets |
| `src/types/force-graph.d.ts` | Module shims |
| `tests/search.test.ts` | Hybrid search |
| `scripts/vision_tag_images.py`, `ingest-photo-gallery.py`, `probe_vision.py` | Owner OpenClaw/gallery tooling (not app runtime) |

### Major modified areas

- Agent: confirm intercept, `collect_by_name`, create+shelve, prompts, tools  
- Catalog/query hybrid search  
- Space theme (`globals.css`), Header/Footer, pages  
- Middleware: loopback exempt from LAN Basic auth  

**Do not commit:** `.env.local`, `library.config.json`, `data/`, personal `archive/**`, `scripts/__pycache__/`.

**Suggested commit strategy (owner decides):**

1. Product rename + theme + brand assets  
2. Agent approve fixes + hybrid search + tests  
3. Graph feature + deps (`three`, `3d-force-graph`, `three-spritetext`)  
4. Tag density UI + card chrome + nav  
5. Optional: vision scripts under `scripts/` if owner wants them tracked  

---

## Environment

```bash
# .env.local (gitignored) — typical:
# XAI_API_KEY=...
# NON_OS_AGENT_MODE=auto
# NON_OS_USE_XAI=1
# NON_OS_MODEL=grok-4.3
# NON_OS_ACCESS_PASSWORD=...   # LAN only
# NON_OS_LAN=1                 # only with dev:lan; loopback still open
```

| Item | Value |
| --- | --- |
| Port | **4747** |
| Dev | `npm run dev` → `http://127.0.0.1:4747` |
| LAN | `npm run dev:lan` + password; user `library` |
| Model | Prefer a team-enabled id; chat path `xai(model)` not `responses()` |

---

## Key code map

| Path | Role |
| --- | --- |
| `src/lib/agent/mode.ts` | local / xai / auto |
| `src/lib/agent/prompt.ts` | Grok system prompt |
| `src/lib/agent/tools.ts` | catalog_search/get/read, propose_actions |
| `src/lib/agent/actions.ts` | Mutations + **tryHandleConfirmOrCancel** |
| `src/lib/agent/local.ts` | Offline NLP + create+shelve proposals |
| `src/app/api/ask/route.ts` | Stream; **confirm before LLM** |
| `src/app/api/agent/actions/route.ts` | POST execute actions |
| `src/lib/catalog/query.ts` | Hybrid search |
| `src/lib/graph/build.ts` | Graph thinning (minTagCount=2, maxTags=36) |
| `src/lib/nav.ts` | PRIMARY_NAV / SECONDARY_NAV |
| `src/components/Header.tsx` | Nav + HelixMark |
| `src/components/KnowledgeGraph.tsx` | 3D graph + fullscreen |
| `src/middleware.ts` | LAN Basic auth; **loopback skip** |
| `src/app/globals.css` | Design system + cards + helix well |

---

## Architecture snapshot (2026-08-04)

```text
Browser → Next.js App Router (127.0.0.1:4747)
            ├─ /  /catalog  /graph  /collections  /locations  /services  /ask  /docs
            ├─ API: reindex, media, thumbs, ask, agent/actions, collections, items tags
            └─ lib/
                 config → db (SQLite + FTS5)
                 indexer, catalog, collections, locations
                 media, machine
                 agent (local | xai)
                 graph (buildKnowledgeGraph)
```

Deps of note: `three`, `3d-force-graph`, `three-spritetext`, `ai` / `@ai-sdk/xai`, `better-sqlite3`, `sharp`.

---

## Known gaps / natural next work

1. **Commit** the uncommitted tree (staged slices preferred)  
2. FS **watch** / debounced auto-reindex  
3. Search **snippets** + hit highlighting  
4. Missing-holdings **weeding** desk  
5. Graph: optional “show singleton tags” advanced mode; performance at 1k+ items  
6. Tag hygiene tools (merge/delete vision noise; hide meta tag `vision-tagged`)  
7. Light-mode brand mark variant (current mark is dark-field)  
8. OpenClaw / Ollama — optional, not started as app features  
9. Empty `src/server/` cleanup if still present  

---

## Gotchas

| Gotcha | Detail |
| --- | --- |
| Port | **4747** |
| Secrets | Never commit `.env.local`, config, `data/`, personal archive |
| Agent hallucinated “created collection” | Fixed: confirm is **server-side**; needs `[[action:…]]` tokens |
| RSC client props | **No functions** from server → client (e.g. tag `href` must be string) |
| LAN env in `.env.local` | Middleware requires Basic for non-loopback; **127.0.0.1 stays open** |
| Dense tags | ~900 tags after vision gallery; UI collapses; graph omits singles |
| SuperGrok | ≠ developer API |
| HMR | `rm -rf .next && npm run dev` |
| Graph fullscreen | CSS `.graph-shell-fs` + canvas resize on toggle |
| Compound names | Hybrid search: `phoebe` → `finnandphoebe.jpeg` |

---

## Resume script (next session)

```bash
cd /home/brandon/Projects/non-os
git status && git log -3 --oneline
# AGENTS.md → this file → ARCHITECTURE.md if deep work
npm install
npm run typecheck && npm test
# .env.local for Grok if needed
npm run reindex    # if archive/gallery changed
npm run dev        # http://127.0.0.1:4747
```

**Smoke:** home → catalog grid (kind edges) → search “phoebe” → `/graph` (layers, fullscreen) → collections uniform cards → Ask “where is resume?” / approve-gated tag → `/docs` → logo mark visible.

---

## User context

- Libraries / STEM / full-stack; OPAC metaphor intentional  
- Sole personal use; agent completes library tasks after confirm  
- SuperGrok sub + developer API for in-app Grok  
- OpenClaw used outside app to index/tag photo gallery (Python scripts under `scripts/`)  
- Brand: Helix Library; space UI; generated H+helix mark preferred over SVG animation  
- Verified: resume review, Finn/Phoebe search, Outer Space collection (after approve fix), dense tags UX, graph  

---

## Session wrap (2026-08-04)

This multi-day stretch delivered (among prior agent/search work):

- Product name **Helix Library**; space dark/light theme  
- **Knowledge Graph** + tag thinning + mobile-ish controls + fullscreen fix  
- Tag density UX (collapsible chips, popular dropdown)  
- Agent **confirm intercept** + `collect_by_name` / create+shelve batch  
- Header: primary/More nav, generated **H+helix** brand mark  
- Kind-tinted holding cards/rows; shelf + service tiles; uniform collection cards  
- Middleware loopback LAN exemption  
- Hero image + brand assets in `public/`  

**Not done:** git commit of the above; FS watch; snippet UI; weeding desk.
