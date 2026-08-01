"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";

export function EditCollectionForm({
  id,
  name,
  description,
}: {
  id: number;
  name: string;
  description: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [nextName, setNextName] = useState(name);
  const [nextDescription, setNextDescription] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function openEditor() {
    setNextName(name);
    setNextDescription(description ?? "");
    setError(null);
    setSaved(false);
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/collections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nextName,
            description: nextDescription,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to update collection");
          return;
        }
        setSaved(true);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className="btn btn-secondary btn-sm"
        title="Edit name and description"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="surface w-full max-w-lg space-y-3 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--ink)]">
          Edit collection
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          disabled={pending}
          aria-label="Cancel edit"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <label>
        <span className="label-quiet">Name</span>
        <input
          required
          value={nextName}
          onChange={(e) => setNextName(e.target.value)}
          className="field"
          autoFocus
        />
      </label>
      <label>
        <span className="label-quiet">Description</span>
        <textarea
          value={nextDescription}
          onChange={(e) => setNextDescription(e.target.value)}
          rows={3}
          placeholder="Optional — what this shelf is for"
          className="field min-h-[4.5rem] resize-y"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </button>
        {error ? (
          <p className="feedback-err" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-xs text-[var(--ok)]" role="status">
            Saved
          </p>
        ) : null}
      </div>
    </form>
  );
}
