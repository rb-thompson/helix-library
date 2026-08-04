"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { HelpTip, Tooltip } from "@/components/Tooltip";

type Named = { id: number; name: string };

const TAG_PREVIEW = 6;

function ItemTagChips({
  itemTags,
  pending,
  onRemove,
}: {
  itemTags: Named[];
  pending: boolean;
  onRemove: (tagId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (itemTags.length === 0) {
    return <span className="text-sm text-[var(--muted)]">No tags yet</span>;
  }
  const visible = open ? itemTags : itemTags.slice(0, TAG_PREVIEW);
  const more = itemTags.length - TAG_PREVIEW;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((t) => (
        <span key={t.id} className="chip chip-active">
          #{t.name}
          <button
            type="button"
            disabled={pending}
            onClick={() => onRemove(t.id)}
            className="rounded-full p-0.5 hover:bg-[var(--accent-muted)]"
            aria-label={`Remove tag ${t.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {more > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {open ? "Show less" : `+${more} more`}
        </button>
      ) : null}
    </div>
  );
}

export function ItemCuration({
  itemId,
  collections,
  itemCollections,
  itemTags,
}: {
  itemId: number;
  collections: Named[];
  itemCollections: Named[];
  itemTags: Named[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tagInput, setTagInput] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inCollection = new Set(itemCollections.map((c) => c.id));
  const available = collections.filter((c) => !inCollection.has(c.id));

  function refresh() {
    router.refresh();
  }

  function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!tagInput.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/items/${itemId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add tag");
        return;
      }
      setTagInput("");
      refresh();
    });
  }

  function removeTag(tagId: number) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/items/${itemId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove tag");
        return;
      }
      refresh();
    });
  }

  function addToCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!collectionId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add to collection");
        return;
      }
      setCollectionId("");
      refresh();
    });
  }

  function removeFromCollection(cid: number) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/collections/${cid}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove from collection");
        return;
      }
      refresh();
    });
  }

  return (
    <div className="surface space-y-5 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-[var(--ink)]">
        Curation
        <HelpTip content="Tags and shelves organize the catalog without moving files." />
      </h2>
      {error ? (
        <p className="feedback-err" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <h3 className="label-quiet flex items-center gap-1.5 !mb-2">
          Tags
          <HelpTip content="Short labels for filtering (e.g. stem, resume)." />
        </h3>
        <ItemTagChips
          itemTags={itemTags}
          pending={pending}
          onRemove={removeTag}
        />
        <form onSubmit={addTag} className="mt-2 flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag…"
            className="field min-w-0 flex-1"
          />
          <Tooltip content="Attach this tag">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-secondary btn-sm"
            >
              Add
            </button>
          </Tooltip>
        </form>
      </div>

      <div>
        <h3 className="label-quiet flex items-center gap-1.5 !mb-2">
          Collections
          <HelpTip content="Named shelves. Create them on Collections, then add items here or via bulk Select." />
        </h3>
        <ul className="space-y-1">
          {itemCollections.length === 0 ? (
            <li className="text-sm text-[var(--muted)]">Not in any collection</li>
          ) : (
            itemCollections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <a href={`/collections/${c.id}`} className="link-accent">
                  {c.name}
                </a>
                <Tooltip content="Remove from shelf (files stay on disk)">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => removeFromCollection(c.id)}
                    className="btn btn-ghost btn-sm text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    Remove
                  </button>
                </Tooltip>
              </li>
            ))
          )}
        </ul>
        {available.length > 0 ? (
          <form onSubmit={addToCollection} className="mt-2 flex gap-2">
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="field min-w-0 flex-1"
            >
              <option value="">Add to collection…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Tooltip content="Put this holding on the selected shelf">
              <button
                type="submit"
                disabled={pending || !collectionId}
                className="btn btn-primary btn-sm"
              >
                Add
              </button>
            </Tooltip>
          </form>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Create a collection first from{" "}
            <a href="/collections" className="link-accent">
              Collections
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
