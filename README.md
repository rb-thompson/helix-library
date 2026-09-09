# Helix Library

<p align="center">
  <img src="public/og-helix.jpg" alt="Helix Library brand art" width="720" />
</p>

**Personal OPAC for files on one machine.** Catalog, search, shelves, media preview, backup/restore, and an approval-gated Librarian — localhost by default.

Built and used daily by [Brandon Thompson](https://www.rbthompson.dev) in Southwest Virginia.

## Problem

Personal files sprawl across folders. Generic search and Finder tags don’t feel like a library: no holdings, no locations, no “ask the librarian,” no safe media serve. Cloud library apps pull private stacks off-device.

## What it does

- **Catalog** over explicit scan roots (never defaults to `$HOME`)
- **Hybrid search** (SQLite FTS) with snippets, tags, smart shelves, related holdings
- **Reading room** for text/code/PDF; secure media streaming with Range support
- **Ask the Librarian** — local offline assistant, or Grok when you add an xAI *developer* API key
- **Acquire** desk — pull papers/clips/media into the archive with jobs + approve gates
- **Backup / restore** snapshots; optional after-hours **Arcade** (Night Moth)

Product metaphor: a small public-library OPAC, rebuilt for one person on loopback.

## Stack

Next.js 15 · React 19 · TypeScript · SQLite (`better-sqlite3`) · Drizzle · Tailwind v4 · optional xAI via AI SDK

## Run

```bash
cp library.config.example.json library.config.json
npm install
npm run reindex    # indexes configured roots (default: ./archive)
npm run dev        # http://127.0.0.1:4747
npm test
npm run typecheck
```

Optional LAN preview needs `NON_OS_ACCESS_PASSWORD` and `npm run dev:lan` — never expose without a password.

In-app handbook: `http://127.0.0.1:4747/docs`

## What this proves

I ship full-stack product for myself: Next.js App Router, SQLite FTS, media pipeline, agent tooling with **human approval** before writes, and privacy defaults (loopback bind, explicit roots, no silent shell). Same craft posture as my library-systems years — holdings, locations, services — on a modern stack.

## Hire skim

| | |
| --- | --- |
| **Role fit** | Junior/associate full-stack · part-time or contract · daytime ET |
| **Site** | [www.rbthompson.dev](https://www.rbthompson.dev) |
| **Repo** | Public showcase · personal `archive/**` gitignored |

## Builder docs

Dense session notes stay out of this README:

1. [AGENTS.md](./AGENTS.md) — constraints, edit map  
2. [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — modules & APIs  
3. [docs/PRODUCT.md](./docs/PRODUCT.md) — scope & non-goals  

## Privacy

- Localhost by default · explicit scan roots only  
- Librarian mutations are approval-gated · no arbitrary shell  
- Do not commit `.env*`, `library.config.json`, `data/`, or personal `archive/**`  

## License

MIT
