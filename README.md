# Helix Library

Personal library system for this machine: a catalog engine and web surface for your files, plus a single **Librarian** for discovery and help.

Inspired by public-library OPAC/services UX — rebuilt for **personal, localhost-only** use.

## Quick start

```bash
cp library.config.example.json library.config.json   # if needed
npm install
npm run reindex    # index configured roots (default: ./archive)
npm run dev        # http://127.0.0.1:4747
# optional: npm run watch   # debounced reindex when files change under enabled roots

# Home-network preview (password required — set NON_OS_ACCESS_PASSWORD in .env.local)
# npm run dev:lan  # http://<your-lan-ip>:4747  user: library
```

In-app guide: **[http://127.0.0.1:4747/docs](http://127.0.0.1:4747/docs)** (Getting started).

### For the next coding session / AI agent

Start here:

1. **[AGENTS.md](./AGENTS.md)** — constraints, run, edit map  
2. **[docs/SESSION-HANDOFF.md](./docs/SESSION-HANDOFF.md)** — done / next / gotchas  
3. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — modules, schema, APIs  

## Archive (primary holdings)

```text
archive/
  documents/
  images/
  notes/
  video/
```

Personal files are gitignored (except `archive/README.md`). Drop files in, then reindex. Add more roots under **Locations**.

- Nothing is indexed until a root is listed and you reindex.  
- `bind` must be loopback (`127.0.0.1`, `localhost`, or `::1`).

## Surfaces

| Route | Purpose |
| --- | --- |
| `/` | Home, search, stats |
| `/docs` | Getting started + user guide |
| `/catalog` | Browse / search (grid or list) |
| `/catalog/[id]` | Preview, reading room, related holdings, curation |
| `/graph` | 2D/3D knowledge graph (holdings + concepts) |
| `/collections` | Manual + smart shelves |
| `/locations` | Scan roots + reindex |
| `/services` | Reindex, backup, restore from snapshot, machine facts |
| `/ask` | Librarian (Grok when API key set; else local) |

Responsive: primary nav + **More** (Locations/Services/Docs); hamburger below `lg`. Hover tooltips on desktop; `?` help chips on dense forms.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · SQLite (better-sqlite3) · Drizzle · Tailwind v4 · sharp · AI SDK (optional xAI)

## Ask the Librarian

**Grok is the preferred reasoning path** when an xAI **developer** API key is present. Otherwise Ask falls back to the local catalog assistant (always works offline).

### SuperGrok vs developer API (important)

| Product | What it is | Powers Helix Library Ask? |
| --- | --- | --- |
| **SuperGrok / X Premium** | Consumer chat on grok.com / X | **No** (separate billing) |
| **XAI_API_KEY** | Developer API at [console.x.ai](https://console.x.ai) | **Yes** — Grok + tools |
| **OpenClaw + Grok OAuth** | Partner agent using your SuperGrok sub | External agent, not inside Helix Library |

OpenClaw can use SuperGrok via official OAuth ([xAI announcement](https://x.ai/news/grok-openclaw)). Helix Library is not that partner path — we only call the developer API.

| Mode | When | Behavior |
| --- | --- | --- |
| `auto` (default) | Key present → Grok; else local | Preferred |
| `local` | Always | Catalog tools + template answers |
| `xai` | Requires key | Force Grok; falls back to local if missing |

```bash
npm run dev
# Grok (developer API — not SuperGrok):
# export XAI_API_KEY=...   # from https://console.x.ai
# optional: NON_OS_MODEL=grok-4.3
# force local despite key: NON_OS_USE_XAI=0
```

Tools: `catalog_search`, `catalog_get`, `list_locations`, `list_collections`, `machine_status`, `system_help`, `propose_actions` (mutations need your approve).

## Media

- Images / video / audio / PDF / text previews on item pages  
- Secure streaming: `/api/media/{id}` (Range-aware)  
- Thumbs/posters: `data/thumbs/`  
- Lightbox in catalog/collections  
- EXIF when `exiftool` is installed (optional)

```bash
# recommended for video posters + duration
# sudo apt install ffmpeg

# optional camera EXIF
# sudo apt install libimage-exiftool-perl

# optional faster PDF text (falls back to bundled pdf-parse)
# sudo apt install poppler-utils
```

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server `127.0.0.1:4747` |
| `npm run reindex` | Full reindex + enrichment |
| `npm run backup` | Catalog snapshot → `data/exports/` (`-- --full` for holdings) |
| `npm run restore` | Inspect / apply a snapshot (`--inspect <name>` then `--phrase RESTORE`) |
| `npm run build` / `npm start` | Production |
| `npm run typecheck` | TypeScript |
| `npm run test` | Unit + fixture integration tests |
| `npm run lint` | ESLint |

## Privacy & safety

- Localhost only in v1  
- Explicit scan roots only  
- Librarian read-only (no shell, no silent writes)  
- API keys server-side only  

## Documentation index

| Doc | Role |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | Agents & new sessions |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Technical architecture |
| [docs/SESSION-HANDOFF.md](./docs/SESSION-HANDOFF.md) | Status + next work |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Product scope |
| `/docs` in the app | End-user getting started |
