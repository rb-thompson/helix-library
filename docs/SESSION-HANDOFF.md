# Session handoff — non-os

**Last updated:** 2026-07-31  
**Repo:** `/home/brandon/Projects/non-os`  
**Status:** **Daily-usable catalog milestone** — core loop works; refine/optimize in place (design system, async reindex, discovery, bulk curation, LAN preview).

Read [AGENTS.md](../AGENTS.md) first, then this file for “what happened” and “what next.”

---

## One-paragraph summary

Built a localhost personal library (“non-os”) with Next.js + SQLite: configurable scan roots (primary `archive/`), full indexer with enrichment (incl. PDF text → FTS), catalog grid/list + media preview/lightbox, collections/tags + bulk select, locations admin, Services/async reindex + job polling, local Librarian with approval-gated propose actions, optional xAI, in-app docs, quiet “library desk” design system, and optional password-gated LAN preview (`npm run dev:lan`).

---

## Locked product decisions

| Decision | Choice |
| --- | --- |
| Metaphor | Personal library (not desktop OS shell first) |
| Stack | Next.js + TypeScript + SQLite |
| Reachability | Localhost only |
| Agent default | Local catalog assistant (no key) |
| Agent writes | Not in scope yet (read + search + explain) |
| Primary holdings root | `./archive` with documents/images/notes/video |
| Agent cloud | Optional; Grok **subscription** is not an API key |

---

## What is done (by area)

### Core catalog

- [x] Config load + loopback bind guard  
- [x] SQLite schema, FTS5 (path/name + body), jobs  
- [x] Indexer: walk, ignore, classify, hash, upsert, missing  
- [x] Enrichment: image thumbs/dims, video poster/duration/dims, text body  
- [x] PDF text extraction into `item_text` / body FTS  
- [x] Catalog search/filters/pagination  
- [x] Locations admin (add/rename/enable/disable/remove → config + DB)  
- [x] Automated tests (`npm test`) against `fixtures/sample-root`  

### Media & curation

- [x] `/api/media/[id]` secure stream + Range  
- [x] Item preview (image/video/audio/pdf/text) + download  
- [x] Grid/list + fullscreen lightbox (←/→/Esc)  
- [x] Collections + tags + catalog filters  
- [x] EXIF panel (graceful if exiftool missing)  

### Agent

- [x] Local librarian intent routing + same conceptual tools  
- [x] Optional xAI streaming + tools (opt-in)  
- [x] Thread persistence  
- [x] Clear UI copy: subscription ≠ developer API  

### UX / chrome

- [x] In-app `/docs` with Getting Started  
- [x] Tooltips / HelpTips (CSS `.tip`; disabled custom tips on touch)  
- [x] Responsive layout + collapsing nav (hamburger &lt; `lg`)  
- [x] Footer nav links  

### Docs for developers

- [x] AGENTS.md, ARCHITECTURE.md, this handoff, README, PRODUCT  

---

## Known gaps / natural next work

Prioritize with the user; none of these are required for basic daily use.

1. **Auth if bind ever leaves loopback**  
2. **Agent write tools** with explicit approval UI (tags, collections, reindex only — still no shell)  
3. ~~**PDF text extraction** into FTS~~ **done** (`pdftotext` + `pdf-parse` fallback → `item_text`)  
4. **Watch mode** / auto-reindex on filesystem events  
5. ~~**Tests** (classify / local librarian / indexer on fixtures)~~ **done** (`npm test`)  
6. **exiftool install** on host when apt lock free — panel already wired  
7. **Ollama / other local LLM** as third agent mode (optional)  
8. **Background reindex queue UX** for multi-GB trees (job polling already partial)  
9. **Empty `src/server/`** — unused; can remove or use for future workers  
10. **HMR / SegmentViewNode** — if UI looks corrupt after hot reload: `rm -rf .next && npm run dev`  

---

## Gotchas (will save hours)

| Gotcha | Detail |
| --- | --- |
| Port | **4747**, not 3000 |
| Config | `library.config.json` is **gitignored**; example file is the template |
| Locations source of truth | UI writes DB + config; reindex syncs config → DB and **disables** roots removed from config |
| Agent mode | Default **local** even if `XAI_API_KEY` is set (prevents exhausted-key 403s); cloud requires opt-in |
| Media security | Never stream by raw path — only by catalog id through `resolveMediaItem` |
| Client vs server | Do not import `hasThumb` / fs / better-sqlite3 into client components; pass `thumbIds` from RSC |
| FTS content tables | Triggers keep FTS in sync; empty FTS after manual DB surgery needs rebuild (reindex path has a heal) |
| Tooltips | Custom CSS tooltips; for nav prefer `title=` to avoid layout wrappers |
| Native modules | `better-sqlite3`, `sharp` must stay in `serverExternalPackages` |

---

## How to resume in a new session (script)

```bash
cd /home/brandon/Projects/non-os
# optional: git status / git log -5
cat AGENTS.md docs/SESSION-HANDOFF.md   # this file + agents entry
npm install                             # if needed
npm run reindex                         # if archive changed
NON_OS_AGENT_MODE=local npm run dev     # http://127.0.0.1:4747
```

Smoke:

1. Home shows holdings count  
2. Catalog grid opens lightbox on an image  
3. Item page plays video / shows image  
4. Ask: “Where is my resume?” returns real path  
5. Docs loads Getting started  
6. Mobile width: hamburger opens drawer  

Then implement the next slice from “Known gaps” with the user’s priority.

---

## Important paths (bookmark)

```text
src/lib/config.ts              # config + bind guard + save locations
src/lib/db/migrate.ts          # schema truth at runtime
src/lib/indexer/run.ts         # reindex orchestration
src/lib/catalog/query.ts       # search + FTS
src/lib/media/serve.ts         # secure file streaming
src/lib/agent/mode.ts          # local vs xai
src/lib/agent/local.ts         # no-API librarian
src/app/api/ask/route.ts       # chat endpoint
src/components/Header.tsx      # responsive nav
src/app/docs/page.tsx          # end-user docs
library.config.example.json
archive/README.md
```

---

## User context (for tone and priorities)

- Background: public libraries (full-stack + STEM educator); built Pike Library frontend.  
- Wants personal OPAC + one agent for assistance, system adjustment (later), and resource location.  
- Resources: files, agent knowledge, machine limits.  
- Has Grok **subscription**, not necessarily working xAI API credits — local agent is correct default.

---

## Suggested next (post–daily-use milestone)

Pick with user; none required for basic use:

- **D.** FS watch / debounce reindex for `archive/`  
- **E.** Ollama / other local LLM as third agent mode  
- **F.** Search snippets + match highlighting  
- **G.** Missing-holdings weeding desk  
- **H.** First git commit of the working tree (almost all uncommitted on `main`)  

### Ask agent (2026-08-01)

- Unified `src/lib/agent/actions.ts` + `POST /api/agent/actions`
- Local: propose → **approve** / **yes** / buttons; create collection, tag, shelf, reindex, locations
- xAI: `propose_actions` tool (does not execute); same UI tokens
- Forbidden: shell, wipe DB, delete project source, arbitrary file delete  

### Milestone stack (completed)

- Catalog + media + collections/tags + local Librarian  
- Tests (`npm test`), PDF body FTS  
- Async reindex + polling; discovery (sort / under / facets); bulk Select  
- Approval-gated librarian proposals  
- Design system (quiet desk): tokens, surfaces, chips, toolstrips, `/` focuses search  
- Secondary surfaces aligned (locations, collections, item curation/detail)  
- Optional LAN: `npm run dev:lan` + Basic auth
