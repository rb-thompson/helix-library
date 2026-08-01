"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Tooltip } from "@/components/Tooltip";

export function DeleteCollectionButton({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!confirm(`Delete collection “${name}”? Items stay in the catalog.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete");
        return;
      }
      router.push("/collections");
      router.refresh();
    });
  }

  return (
    <div>
      <Tooltip content="Delete the shelf only. Items remain in the catalog and on disk.">
        <button
          type="button"
          disabled={pending}
          onClick={onClick}
          className="btn btn-danger btn-sm"
        >
          {pending ? "Deleting…" : "Delete collection"}
        </button>
      </Tooltip>
      {error ? (
        <p className="feedback-err mt-1" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
