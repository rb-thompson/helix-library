"use client";

import { useEffect } from "react";
import { recordOpen } from "@/lib/client/open-history";

/**
 * Records a catalog item open in localStorage (client-only island).
 */
export function OpenHistoryRecorder({
  id,
  name,
  kind,
}: {
  id: number;
  name: string;
  kind: string;
}) {
  useEffect(() => {
    recordOpen({ id, name, kind });
    const source =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("room") === "1"
        ? "room"
        : "detail";
    void fetch(`/api/items/${id}/events`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "open", meta: { source } }),
    }).catch(() => {
      // localStorage already recorded; server is best-effort
    });
  }, [id, name, kind]);

  return null;
}
