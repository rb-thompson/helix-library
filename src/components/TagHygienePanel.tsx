"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, GitMerge, Pencil, Trash2 } from "lucide-react";
import { isHiddenFacetTag } from "@/lib/tags/hidden";

type TagRow = {
  id: number;
  name: string;
  itemCount?: number | null;
  hasVision?: boolean;
  hasAcquire?: boolean;
  hidden?: boolean;
};

type FilterKey = "low" | "meta" | "vision" | "acquire" | "hidden" | "all";

export function TagHygienePanel({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("low");
  const [mergeTarget, setMergeTarget] = useState("");
  const [renameName, setRenameName] = useState("");

  const filtered = useMemo(() => {
    const sorted = [...tags].sort(
      (a, b) => Number(a.itemCount ?? 0) - Number(b.itemCount ?? 0),
    );
    if (filter === "meta") {
      return sorted.filter((t) =>
        isHiddenFacetTag(t.name, { hidden: t.hidden }),
      );
    }
    if (filter === "hidden") {
      return sorted.filter((t) =>
        isHiddenFacetTag(t.name, { hidden: t.hidden }),
      );
    }
    if (filter === "vision") {
      return sorted.filter((t) => t.hasVision);
    }
    if (filter === "acquire") {
      return sorted.filter((t) => t.hasAcquire);
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
      setMessage(
        `Deleted ${data.deleted ?? 0} tag${data.deleted === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function mergeSelected() {
    if (selected.size === 0) return;
    const target = mergeTarget.trim();
    if (!target) {
      setError("Enter a target tag name to merge into");
      return;
    }
    if (
      !window.confirm(
        `Merge ${selected.size} tag${selected.size === 1 ? "" : "s"} into “${target}”? Source labels are removed; holdings keep a single link.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tags/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceIds: [...selected],
          targetName: target,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Merge failed");
        return;
      }
      setMessage(
        `Merged into tag #${data.targetId} · moved ${data.moved ?? 0} link${data.moved === 1 ? "" : "s"} · removed ${data.deletedSources ?? 0} source tag${data.deletedSources === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
      setMergeTarget("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  async function renameSelected() {
    if (selected.size !== 1) {
      setError("Select exactly one tag to rename");
      return;
    }
    const name = renameName.trim();
    if (!name) {
      setError("Enter a new name");
      return;
    }
    const id = [...selected][0];
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, mergeIfExists: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Rename failed");
        return;
      }
      setMessage(
        data.merged
          ? `Merged into existing “${name}”`
          : `Renamed to “${name}”`,
      );
      setSelected(new Set());
      setRenameName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function setHiddenSelected(hidden: boolean) {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let n = 0;
      for (const id of selected) {
        const res = await fetch("/api/tags", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, hidden }),
        });
        if (res.ok) n += 1;
      }
      setMessage(
        hidden
          ? `Hidden ${n} tag${n === 1 ? "" : "s"} from facets/graph`
          : `Unhid ${n} tag${n === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hide failed");
    } finally {
      setBusy(false);
    }
  }

  if (tags.length === 0) return null;

  return (
    <section className="surface p-4 sm:p-5" aria-label="Tag hygiene">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Tag hygiene
          </h2>
          <p className="mt-1 max-w-xl text-xs text-[var(--muted)]">
            Delete, merge, rename, or hide labels from facets/graph. Meta tag{" "}
            <code className="rounded bg-[var(--paper-deep)] px-1">
              vision-tagged
            </code>{" "}
            is hidden by default. Vision / Acquire filters use provenance.
          </p>
        </div>
        <div className="segment" role="group" aria-label="Tag filter">
          {(
            [
              ["low", "Low use"],
              ["vision", "Vision"],
              ["acquire", "Acquire"],
              ["hidden", "Hidden"],
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
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void setHiddenSelected(true)}
          disabled={busy || selected.size === 0}
          title="Hide from catalog facets and knowledge graph"
        >
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
          Hide
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void setHiddenSelected(false)}
          disabled={busy || selected.size === 0}
          title="Show again on facets and graph"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          Unhide
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="min-w-[10rem] flex-1">
          <span className="label-quiet">Merge into name</span>
          <input
            type="text"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            placeholder="e.g. machine-learning"
            disabled={busy}
            className="field"
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void mergeSelected()}
          disabled={busy || selected.size === 0 || !mergeTarget.trim()}
        >
          <GitMerge className="h-3.5 w-3.5" aria-hidden />
          Merge selected
        </button>
        <label className="min-w-[10rem] flex-1">
          <span className="label-quiet">Rename (one selected)</span>
          <input
            type="text"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="new-name"
            disabled={busy || selected.size !== 1}
            className="field"
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void renameSelected()}
          disabled={busy || selected.size !== 1 || !renameName.trim()}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Rename
        </button>
      </div>

      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
        {filtered.length === 0 ? (
          <li className="text-xs text-[var(--muted)]">
            No tags in this filter.
          </li>
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
                  {isHiddenFacetTag(t.name, { hidden: t.hidden }) ? (
                    <span className="ml-1 text-[0.65rem] font-normal text-[var(--muted-faint)]">
                      (hidden)
                    </span>
                  ) : null}
                  {t.hasVision ? (
                    <span className="ml-1 text-[0.65rem] font-normal text-[var(--muted-faint)]">
                      · vision
                    </span>
                  ) : null}
                  {t.hasAcquire ? (
                    <span className="ml-1 text-[0.65rem] font-normal text-[var(--muted-faint)]">
                      · acquire
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
