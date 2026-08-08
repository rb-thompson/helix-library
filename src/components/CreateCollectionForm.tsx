"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HelpTip, Tooltip } from "@/components/Tooltip";
import type { SmartShelfQuery } from "@/lib/collections/manage";

export function CreateCollectionForm({
  initialSmartQuery = null,
  defaultName = "",
}: {
  /** When set, form defaults to smart shelf with these filters. */
  initialSmartQuery?: SmartShelfQuery | null;
  defaultName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"manual" | "smart">(
    initialSmartQuery ? "smart" : "manual",
  );
  const [error, setError] = useState<string | null>(null);

  const smartSummary = initialSmartQuery
    ? summarizeQuery(initialSmartQuery)
    : null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = { name, description, kind };
      if (kind === "smart") {
        if (!initialSmartQuery) {
          setError("Open the catalog, set filters, then save as smart shelf.");
          return;
        }
        body.query = initialSmartQuery;
      }
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        <HelpTip content="Manual shelves hold hand-picked items. Smart shelves are live catalog filters." />
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Manual cart or standing-order smart shelf from filters.
      </p>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="kind"
            checked={kind === "manual"}
            onChange={() => setKind("manual")}
          />
          Manual shelf
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="kind"
            checked={kind === "smart"}
            onChange={() => setKind("smart")}
            disabled={!initialSmartQuery}
          />
          Smart shelf
          {!initialSmartQuery ? (
            <span className="text-xs text-[var(--muted-faint)]">
              (set catalog filters first)
            </span>
          ) : null}
        </label>
      </div>

      {kind === "smart" && smartSummary ? (
        <p className="mt-2 rounded-md bg-[var(--paper-deep)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          Live query: {smartSummary}
        </p>
      ) : null}

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
        <Tooltip
          content={
            kind === "smart"
              ? "Membership updates as the catalog changes."
              : "Create the shelf, then add items from catalog Select or item Curation."
          }
        >
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending
              ? "Creating…"
              : kind === "smart"
                ? "Create smart shelf"
                : "Create collection"}
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

function summarizeQuery(q: SmartShelfQuery): string {
  const parts: string[] = [];
  if (q.q) parts.push(`q=“${q.q}”`);
  if (q.kind) parts.push(`kind=${q.kind}`);
  if (q.locationId) parts.push(`location#${q.locationId}`);
  if (q.tagId) parts.push(`tag#${q.tagId}`);
  if (q.under) parts.push(`under=${q.under}`);
  if (q.untaggedOnly) parts.push("untagged");
  if (q.missingOnly) parts.push("missing");
  return parts.length ? parts.join(" · ") : "(empty)";
}
