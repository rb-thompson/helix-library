"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Tag, Trash2, X } from "lucide-react";

export function BulkCurationBar({
  selectedIds,
  collections,
  onClear,
  weedingMode = false,
}: {
  selectedIds: number[];
  collections: Array<{ id: number; name: string }>;
  onClear: () => void;
  /** When true, show “Remove from catalog” for missing holdings. */
  weedingMode?: boolean;
}) {
  const router = useRouter();
  const [collectionId, setCollectionId] = useState(
    collections[0] ? String(collections[0].id) : "",
  );
  const [tagName, setTagName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  async function run(
    body: Record<string, unknown>,
    okMsg: (data: Record<string, number>) => string,
    opts?: { clearAfter?: boolean },
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Bulk action failed");
        return;
      }
      setMessage(okMsg(data));
      if (opts?.clearAfter) onClear();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk curation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ink)]">
          <span className="tabular-nums text-[var(--accent)]">
            {selectedIds.length}
          </span>{" "}
          selected
        </p>
        <button type="button" onClick={onClear} className="btn btn-ghost btn-sm">
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </button>
      </div>

      {weedingMode ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <button
            type="button"
            disabled={busy}
            title="Remove catalog rows only — does not delete files on disk"
            onClick={() => {
              if (
                !window.confirm(
                  `Remove ${selectedIds.length} missing holding${selectedIds.length === 1 ? "" : "s"} from the catalog? This does not delete any files on disk.`,
                )
              ) {
                return;
              }
              void run(
                { action: "purge_missing", itemIds: selectedIds },
                (d) =>
                  `Removed ${d.purged ?? 0} from catalog${d.skipped ? ` · ${d.skipped} not missing (kept)` : ""}`,
                { clearAfter: true },
              );
            }}
            className="btn btn-secondary text-[var(--danger)]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove from catalog
          </button>
          <p className="text-xs text-[var(--muted)]">
            Catalog only — files are already gone from disk.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <label className="min-w-[8rem] flex-1 sm:flex-none">
              <span className="label-quiet">Collection</span>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                disabled={!collections.length || busy}
                className="field"
              >
                {collections.length === 0 ? (
                  <option value="">No collections yet</option>
                ) : (
                  collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              disabled={!collectionId || busy}
              onClick={() =>
                run(
                  {
                    action: "add_to_collection",
                    itemIds: selectedIds,
                    collectionId: Number(collectionId),
                  },
                  (d) =>
                    `Added ${d.added ?? 0} to shelf${d.skipped ? ` · ${d.skipped} already there` : ""}`,
                )
              }
              className="btn btn-primary"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden />
              Shelf
            </button>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <label className="min-w-[8rem] flex-1">
              <span className="label-quiet">Tag</span>
              <input
                type="text"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="e.g. stem"
                disabled={busy}
                className="field sm:max-w-[10rem]"
              />
            </label>
            <button
              type="button"
              disabled={!tagName.trim() || busy}
              onClick={() =>
                run(
                  {
                    action: "add_tag",
                    itemIds: selectedIds,
                    tagName: tagName.trim(),
                  },
                  (d) =>
                    `Tagged ${d.tagged ?? 0}${d.skipped ? ` · ${d.skipped} already tagged` : ""}`,
                )
              }
              className="btn btn-secondary"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden />
              Tag
            </button>
          </div>
        </div>
      )}

      {message ? (
        <p className="feedback-ok mt-2.5" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="feedback-err mt-2.5" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
