"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HelpTip, Tooltip } from "@/components/Tooltip";

export function CreateCollectionForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create collection");
        return;
      }
      setName("");
      setDescription("");
      router.push(`/collections/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="surface p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-[var(--ink)]">
        New collection
        <HelpTip content="A manual shelf. Does not move or copy files on disk." />
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        e.g. “STEM teaching materials” or “Career docs”.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label-quiet">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            placeholder="Collection name"
          />
        </label>
        <label>
          <span className="label-quiet">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field"
            placeholder="Optional"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Tooltip content="Create the shelf, then add items from catalog Select or item Curation.">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Creating…" : "Create collection"}
          </button>
        </Tooltip>
        {error ? (
          <p className="feedback-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
