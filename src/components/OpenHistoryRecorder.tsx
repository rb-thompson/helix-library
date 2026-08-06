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
  }, [id, name, kind]);

  return null;
}
