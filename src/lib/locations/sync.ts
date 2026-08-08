/**
 * Config ↔ DB location sync — intentionally separate from indexer/run.ts
 * so RSC pages do not pull reindex/enrich/PDF/sharp into the compile graph.
 */

import { eq } from "drizzle-orm";
import { loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";

export function syncLocationsFromConfig(): void {
  const config = loadConfig(true);
  const db = getDb();
  const nowRoots = new Set(config.locations.map((l) => l.root));

  for (const loc of config.locations) {
    const existing = db
      .select()
      .from(locations)
      .where(eq(locations.rootPath, loc.root))
      .get();

    if (existing) {
      db.update(locations)
        .set({
          name: loc.name,
          enabled: loc.enabled === false ? 0 : 1,
        })
        .where(eq(locations.id, existing.id))
        .run();
    } else {
      db.insert(locations)
        .values({
          name: loc.name,
          rootPath: loc.root,
          enabled: loc.enabled === false ? 0 : 1,
        })
        .run();
    }
  }

  const all = db.select().from(locations).all();
  for (const row of all) {
    if (!nowRoots.has(row.rootPath) && row.enabled === 1) {
      db.update(locations)
        .set({ enabled: 0 })
        .where(eq(locations.id, row.id))
        .run();
    }
  }
}
