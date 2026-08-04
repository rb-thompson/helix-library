"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RemoveFromCollectionButton({
  collectionId,
  itemId,
}: {
  collectionId: number;
  itemId: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Remove from this collection (file stays on disk)"
      onClick={() => {
        startTransition(async () => {
          await fetch(`/api/collections/${collectionId}/items`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId }),
          });
          router.refresh();
        });
      }}
      className="text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-60"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
