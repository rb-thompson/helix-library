/**
 * Home "rescue desk" snapshot — missing, untagged, and job health.
 */

import { getSqlite } from "@/lib/db/client";
import { searchCatalog } from "@/lib/catalog/query";
import { listJobs } from "@/lib/jobs/store";
import type { HelixJob } from "@/lib/jobs/types";
import type { CatalogItemRow } from "@/lib/types";

export type RescueSnapshot = {
  missingCount: number;
  untaggedCount: number;
  untaggedSample: CatalogItemRow[];
  failedJobs: HelixJob[];
  runningJobs: HelixJob[];
  lowUseTagCount: number;
  /** True when the rescue section should render */
  hasWork: boolean;
};

export function getRescueSnapshot(): RescueSnapshot {
  const sqlite = getSqlite();

  const missingCount = (
    sqlite
      .prepare(
        `
      SELECT count(*) AS c
      FROM items i
      JOIN locations l ON l.id = i.location_id AND l.enabled = 1
      WHERE i.is_missing = 1
    `,
      )
      .get() as { c: number }
  ).c;

  const untaggedCount = (
    sqlite
      .prepare(
        `
      SELECT count(*) AS c
      FROM items i
      JOIN locations l ON l.id = i.location_id AND l.enabled = 1
      WHERE i.is_missing = 0
        AND NOT EXISTS (
          SELECT 1 FROM item_tags it WHERE it.item_id = i.id
        )
    `,
      )
      .get() as { c: number }
  ).c;

  const lowUseTagCount = (
    sqlite
      .prepare(
        `
      SELECT count(*) AS c FROM (
        SELECT t.id
        FROM tags t
        LEFT JOIN item_tags it ON it.tag_id = t.id
        GROUP BY t.id
        HAVING count(it.item_id) <= 1
      )
    `,
      )
      .get() as { c: number }
  ).c;

  const untaggedSample =
    untaggedCount > 0
      ? searchCatalog({ untaggedOnly: true, pageSize: 4, sort: "indexed" })
          .items
      : [];

  const recentJobs = listJobs({ limit: 30 });
  // Dismissed failures stay in Services history but leave the rescue desk
  const failedJobs = recentJobs
    .filter((j) => j.status === "failed" && !j.dismissed)
    .slice(0, 8);
  const runningJobs = recentJobs
    .filter((j) => j.status === "running" || j.status === "pending")
    .slice(0, 5);

  const hasWork =
    missingCount > 0 ||
    untaggedCount > 0 ||
    failedJobs.length > 0 ||
    runningJobs.length > 0 ||
    lowUseTagCount >= 20;

  return {
    missingCount,
    untaggedCount,
    untaggedSample,
    failedJobs,
    runningJobs,
    lowUseTagCount,
    hasWork,
  };
}
