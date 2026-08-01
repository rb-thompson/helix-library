"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderPlus, Power, Trash2 } from "lucide-react";
import { HelpTip, Tooltip } from "@/components/Tooltip";

export type LocationAdminRow = {
  id: number;
  name: string;
  rootPath: string;
  enabled: number;
  itemCount: number;
};

export function LocationAdmin({
  locations,
  defaultRootHint,
}: {
  locations: LocationAdminRow[];
  defaultRootHint: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [root, setRoot] = useState(defaultRootHint);

  async function refresh() {
    router.refresh();
  }

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, root, enabled: true }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to add location");
          return;
        }
        setName("");
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add location");
      }
    });
  }

  async function toggle(id: number, enabled: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update location");
        return;
      }
      await refresh();
    });
  }

  async function remove(id: number, label: string) {
    if (
      !confirm(
        `Remove location “${label}”? Indexed items for this root leave the catalog (files on disk are untouched).`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove location");
        return;
      }
      await refresh();
    });
  }

  async function rename(id: number, current: string) {
    const next = prompt("Location name", current);
    if (next === null || next.trim() === current) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to rename");
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addLocation} className="surface p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-[var(--ink)]">
          <FolderPlus className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Add location
          <HelpTip content="A folder root the indexer may scan. Only enabled locations appear in catalog results." />
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Saved to{" "}
          <code className="rounded bg-[var(--paper-deep)] px-1 text-xs">
            library.config.json
          </code>{" "}
          and the catalog DB. Reindex after adding.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label-quiet flex items-center gap-1.5">
              Name
              <HelpTip content="Friendly label (e.g. Archive, Projects)." />
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Projects"
              className="field"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="label-quiet flex items-center gap-1.5">
              Path
              <HelpTip content="Existing folder. Relative paths resolve from the project root." />
            </span>
            <input
              required
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder={defaultRootHint}
              title="Must be an existing directory"
              className="field font-mono text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Tooltip content="Save location, then run reindex.">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Saving…" : "Add location"}
            </button>
          </Tooltip>
          {error ? (
            <p className="feedback-err" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </form>

      {locations.length === 0 ? (
        <div className="empty-state">
          <strong>No locations yet</strong>
          Add the archive root or another folder above.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className={`surface p-4 ${loc.enabled ? "" : "opacity-70"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => rename(loc.id, loc.name)}
                    className="text-left text-base font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
                    title="Rename"
                  >
                    {loc.name}
                  </button>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--muted)]">
                    {loc.rootPath}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p className="font-semibold text-[var(--ink)]">
                    {loc.itemCount}
                  </p>
                  <p
                    className={
                      loc.enabled
                        ? "text-[0.7rem] text-[var(--ok)]"
                        : "text-[0.7rem] text-[var(--muted)]"
                    }
                  >
                    {loc.enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tooltip
                  content={
                    loc.enabled
                      ? "Hide from catalog search (files stay on disk)."
                      : "Include again after the next reindex."
                  }
                >
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggle(loc.id, !loc.enabled)}
                    className="btn btn-secondary btn-sm"
                  >
                    <Power className="h-3.5 w-3.5" aria-hidden />
                    {loc.enabled ? "Disable" : "Enable"}
                  </button>
                </Tooltip>
                <Tooltip content="Remove location and catalog rows. Never deletes files.">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(loc.id, loc.name)}
                    className="btn btn-danger btn-sm"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
