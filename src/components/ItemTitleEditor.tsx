"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil } from "lucide-react";

export function ItemTitleEditor({
  itemId,
  displayTitle,
  filename,
}: {
  itemId: number;
  displayTitle: string;
  filename: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(displayTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title="Edit display title"
        onClick={() => {
          setValue(displayTitle);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Title
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:max-w-md">
      <label className="block">
        <span className="label-quiet">Display title</span>
        <input
          className="field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          placeholder={filename}
          maxLength={500}
        />
      </label>
      <p className="text-[0.65rem] text-[var(--muted)]">
        Filename stays <code className="text-[var(--muted-faint)]">{filename}</code>
        . Clear and save to reset to filename.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void save()}
        >
          Save
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="feedback-err text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
