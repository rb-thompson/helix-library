# Helix Library — Product notes

Personal library system: catalog engine + web surface + single Librarian agent.

## Metaphor

Public library OPAC/services mapped onto personal files and host machine limits.

| Library | Helix Library |
| --- | --- |
| Holdings | Indexed files |
| Branches / locations | Configured scan roots |
| Catalog | Search / browse / filters |
| Collections | Manual shelves + tags |
| Services | Reindex, machine status |
| Ask a librarian | `/ask` (local or optional xAI) |
| Building | Host CPU/RAM/disk/tools |

## Scope (current)

- Localhost by default (`127.0.0.1`); optional password-gated LAN preview for home network
- Primary **`archive/`** holdings (+ extra locations via UI/config)
- Index + enrichment (thumbs, posters, duration, text samples, PDF text layers)
- Catalog grid/list, media preview, lightbox
- Locations admin; collections & tags
- Read-only machine probe
- Librarian: **Grok when developer API key present**; else local; content read via catalog extract; mutations approval-gated
- In-app Getting Started (`/docs`) including agent guide
- Space UI (dark/light), knowledge graph (`/graph`), kind-tinted cards, Helix brand mark

## Non-goals (v1)

- Public internet exposure without auth
- Multi-user tenancy
- Replacing the OS file manager
- Arbitrary shell / agent-driven filesystem mutation
- Porting PHP/Laravel from PCPL

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
| `npm run build` / `npm start` | Production |
| `npm run typecheck` | Types |

## Further reading

- [AGENTS.md](../AGENTS.md) — agent/session entry
- [ARCHITECTURE.md](./ARCHITECTURE.md) — technical design
- [SESSION-HANDOFF.md](./SESSION-HANDOFF.md) — status and next work
