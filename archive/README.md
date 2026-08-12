# Archive

On-disk holdings root for this Helix Library instance (project-local, always available).

**Hot-swap physical archive:** location **Vault** → `/media/brandon/Vault/helix` on the Wavlink NTFS RAID1 volume (label `Vault`). Same folder layout there; unplug anytime and reindex after remount.

Project docs: [../AGENTS.md](../AGENTS.md), [../docs/SESSION-HANDOFF.md](../docs/SESSION-HANDOFF.md).

## Layout

| Folder | Purpose |
| --- | --- |
| `documents/` | PDFs and long-form documents |
| `images/` | Photos and still graphics |
| `notes/` | Markdown / plain-text notes |
| `video/` | Video files |
| `audio/` | Audio / podcasts |
| `code/` | Source snippets you want cataloged |

Drop new material into the matching folder (or create subfolders), then reindex from the UI or `npm run reindex`.

Personal archive files under this tree are gitignored; only this README is tracked.
