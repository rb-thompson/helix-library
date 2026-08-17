# Helix Library — Product notes

Personal library system: catalog engine + web surface + single Librarian agent.

## Metaphor

Public library OPAC/services mapped onto personal files and host machine limits.

| Library | Helix Library |
| --- | --- |
| Holdings | Indexed files |
| Branches / locations | Configured scan roots |
| Catalog | Search / browse / filters |
| Collections | Manual shelves + **smart shelves** (saved catalog queries) + tags |
| Reading room | Continuous text/code + PDF.js page mode on item detail; position memory |
| Related holdings | Same folder / shared tags / co-shelved neighbors |
| Knowledge map | `/graph` — 2D (default mobile) + 3D force graph |
| Services | Reindex, **export/backup**, **restore from snapshot**, machine status |
| Acquisitions / ILL | `/acquire` — arXiv, OpenAlex OA PDFs, web clips, Grokipedia, YT/podcast, Grok + remote images into Archive |
| Ask a librarian | `/ask` (local or optional xAI); holding-context from reading room |
| Deep Lens dossier | `/lens/[id]` — kind-object, cached analysis, related, Your insights |
| Building | Host CPU/RAM/disk/tools |

## Scope (current)

- Localhost by default (`127.0.0.1`); optional password-gated LAN preview for home network
- Primary **`archive/`** holdings (+ extra locations via UI/config)
- Index + enrichment (thumbs, posters, duration, text samples, PDF text layers)
- Catalog grid/list, media preview, lightbox
- **Reading room** for text, code, and PDF (PDF.js text layer; iframe fallback); client position restore
- Locations admin; collections, **smart shelves**, tags
- Read-only machine probe
- Librarian: **Grok when developer API key present**; else local; content read via catalog extract; mutations approval-gated; **Ask about this holding** bridge
- Acquire desk: arXiv preprints, **OpenAlex** search/DOI → OA PDF only when resolvable, **web clip** URL → Markdown notes, yt-dlp media, Grok Imagine images
- In-app Getting Started (`/docs`) including agent guide
- Space UI (dark/light; light brand mark + themed heroes), Lucide nav, **collapsible left sidebar**, knowledge graph 2D/3D (`/graph`), kind-tinted cards
- Night-moth Circulation clerk (character, not the logo) on Hours, `/docs`, and the design lab
- **Restore from snapshot** on Services (inspect + typed `RESTORE` + undo snapshot); `npm run restore`

## Non-goals (v1)

- Public internet exposure without auth
- Multi-user tenancy
- Replacing the OS file manager
- Arbitrary shell / agent-driven filesystem mutation
- Porting PHP/Laravel from PCPL
- Overwriting live holdings trees on restore (catalog + optional thumbs only)
- Archiving `.env` / SuperGrok / API keys (re-add secrets separately)

## Archive layout

```text
archive/
  documents/
  images/
  notes/
  video/
```

Personal files under `archive/` are gitignored; `archive/README.md` is tracked.

## Config

- Template: `library.config.example.json`
- Runtime: `library.config.json` (gitignored)
- Locations can be edited in UI (persists back to config)

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | UI on http://127.0.0.1:4747 |
| `npm run reindex` | Index + enrich |
| `npm run backup` | Catalog snapshot → `data/exports/` (`-- --full` for holdings) |
| `npm run restore` | List exports; `--inspect <name>` preview; `--name <name> --phrase RESTORE` apply |
| `npm run build` / `npm start` | Production |
| `npm run typecheck` | Types |

## Further reading

- [AGENTS.md](../AGENTS.md) — agent/session entry
- [ARCHITECTURE.md](./ARCHITECTURE.md) — technical design
- [SESSION-HANDOFF.md](./SESSION-HANDOFF.md) — status and next work
