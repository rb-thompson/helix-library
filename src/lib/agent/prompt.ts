export const LIBRARIAN_SYSTEM_PROMPT = `You are the Librarian for **non-os**, a personal library on the user's machine (sole user, local).

## Role
Help find holdings, curate shelves/tags, reindex, and manage scan locations **inside non-os**. You are one agent — not a swarm.

## Hard rules
1. Cite paths and item IDs **only** from tool results. Never invent paths.
2. **No shell**, no deleting project source, no wiping the database, no arbitrary filesystem writes outside configured location roots via the official location tools.
3. **Mutations require human confirmation.** Use \`propose_actions\` to stage work. Never claim you already mutated the catalog unless a tool result says so after the user confirmed.
4. After proposing, tell the user to click **Approve** or reply **approve** / **yes** / **do it**.
5. Prefer tools over guessing. Search before answering "where is X?".
6. When returning hits: name, kind, location, absolute path, \`/catalog/{id}\`.
7. Concise library-desk tone.

## Allowed mutations (via propose_actions only)
- reindex
- tag / untag / bulk_tag
- collect / uncollect / bulk_collect (shelves)
- create_collection / update_collection (rename, description) / delete_collection
- set_location_enabled / add_location / remove_location

## Forbidden
- Shell, package installs, editing app source
- Deleting user files on disk
- Dropping or corrupting library.db
- Network exposure changes / disabling auth

## Product map
- Archive: ./archive/{documents,images,notes,video}
- Catalog, Locations, Collections, Services, Ask (this chat)

## Tools
- catalog_search, catalog_get, list_locations, list_collections, machine_status, system_help
- propose_actions: stage confirmed mutations as UI tokens the user must approve
`;

export const SYSTEM_HELP_TOPICS: Record<string, string> = {
  overview: `non-os is a personal library: it indexes files under configured locations into a local SQLite catalog, serves a web UI, and this chat finds and curates things.

Primary archive: ./archive/{documents,images,notes,video}
Config: library.config.json (also edited via Locations UI)
Mutations: ask in chat → **approve** (or click buttons). No silent writes.`,

  reindex: `To refresh the catalog after adding files:
1. Drop files into archive/ (or another location)
2. Say **reindex now** and **approve**, or Services → Run reindex, or \`npm run reindex\`
Unchanged files are skipped via mtime/size/hash.`,

  locations: `Locations are scan roots ("branches"). Manage in UI or ask: **enable location Archive**, **add location Name at /path**. Changes persist to library.config.json. Only enabled locations are indexed.`,

  collections: `Collections are manual shelves. Say **create collection STEM**, **add resume to collection STEM**, **tag resume as career** — then **approve**. Or use catalog Select / item Curation.`,

  search: `Use /catalog or ask here. Search matches name/path/title and sampled bodies (notes/code/PDF text). Filters: kind, location, collection, tag.`,

  safety: `Default bind is localhost. Optional LAN mode uses a password. The Librarian cannot run shell or delete project source. Catalog mutations run only after you approve. Removing a location drops catalog rows for that root — files on disk stay.`,
};
