"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { isHiddenFacetTag } from "@/lib/tags/hidden";

type TagRow = {
  id: number;
  name: string;
  itemCount?: number | null;
};

export function TagHygienePanel({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"low" | "all" | "meta">("low");

  const filtered = useMemo(() => {
    const sorted = [...tags].sort(
      (a, b) => Number(a.itemCount ?? 0) - Number(b.itemCount ?? 0),
    );
    if (filter === "meta") {
      return sorted.filter((t) => isHiddenFacetTag(t.name));
    }
    if (filter === "low") {
      return sorted.filter((t) => Number(t.itemCount ?? 0) <= 1);
    }
    return sorted;
  }, [tags, filter]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected(new Set(filtered.map((t) => t.id)));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Delete ${selected.size} tag${selected.size === 1 ? "" : "s"} from the catalog? Labels are removed from holdings; files are untouched.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Delete failed");
        return;
      }
      setMessage(`Deleted ${data.deleted ?? 0} tag${data.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (tags.length === 0) return null;

  return (
    <section className="surface p-4 sm:p-5" aria-label="Tag hygiene">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">Tag hygiene</h2>
          <p className="mt-1 max-w-xl text-xs text-[var(--muted)]">
            Remove noisy or unused labels (e.g. vision singletons). Meta tag{" "}
            <code className="rounded bg-[var(--paper-deep)] px-1">vision-tagged</code>{" "}
            is hidden from catalog facets and the knowledge graph automatically.
          </p>
        </div>
        <div className="segment" role="group" aria-label="Tag filter">
          {(
            [
              ["low", "Low use"],
              ["meta", "Meta"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? "is-active" : undefined}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={selectVisible}
          disabled={busy || filtered.length === 0}
        >
          Select listed ({filtered.length})
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setSelected(new Set())}
          disabled={busy || selected.size === 0}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm text-[var(--danger)]"
          onClick={() => void deleteSelected()}
          disabled={busy || selected.size === 0}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete {selected.size || ""}
        </button>
      </div>

      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
        {filtered.length === 0 ? (
          <li className="text-xs text-[var(--muted)]">No tags in this filter.</li>
        ) : (
          filtered.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--paper-deep)]">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  disabled={busy}
                  className="rounded border-[var(--line-strong)]"
                />
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">
                  {t.name}
                  {isHiddenFacetTag(t.name) ? (
                    <span className="ml-1 text-[0.65rem] font-normal text-[var(--muted-faint)]">
                      (hidden from facets)
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-xs text-[var(--muted)]">
                  {Number(t.itemCount ?? 0)}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>

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
    </section>
  );
}
