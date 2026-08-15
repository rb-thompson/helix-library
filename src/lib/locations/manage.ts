import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  resolvePath,
  saveLocationsToConfig,
  toConfigPath,
} from "@/lib/config";
import { assertCatalogWritable, getDb } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";
import { syncLocationsFromConfig } from "@/lib/locations/sync";

function persistAllLocations(): void {
  const db = getDb();
  const rows = db.select().from(locations).all();
  saveLocationsToConfig(
    rows.map((r) => ({
      name: r.name,
      rootPath: r.rootPath,
      enabled: r.enabled === 1,
    })),
  );
}

function assertDirectory(root: string): string {
  const abs = resolvePath(root.trim());
  if (!existsSync(abs)) {
    throw new Error(`Path does not exist: ${abs}`);
  }
  const st = statSync(abs);
  if (!st.isDirectory()) {
    throw new Error(`Path is not a directory: ${abs}`);
  }
  return abs;
}

export function addLocation(input: {
  name: string;
  root: string;
  enabled?: boolean;
}): { id: number } {
  assertCatalogWritable();
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  const abs = assertDirectory(input.root);
  const db = getDb();

  const existing = db
    .select()
    .from(locations)
    .where(eq(locations.rootPath, abs))
    .get();

  if (existing) {
    db.update(locations)
      .set({
        name,
        enabled: input.enabled === false ? 0 : 1,
      })
      .where(eq(locations.id, existing.id))
      .run();
    persistAllLocations();
    return { id: existing.id };
  }

  const result = db
    .insert(locations)
    .values({
      name,
      rootPath: abs,
      enabled: input.enabled === false ? 0 : 1,
    })
    .run();

  persistAllLocations();
  return { id: Number(result.lastInsertRowid) };
}

export function updateLocation(
  id: number,
  input: { name?: string; root?: string; enabled?: boolean },
): void {
  assertCatalogWritable();
  const db = getDb();
  const row = db.select().from(locations).where(eq(locations.id, id)).get();
  if (!row) throw new Error("Location not found");

  const patch: {
    name?: string;
    rootPath?: string;
    enabled?: number;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    patch.name = name;
  }
  if (input.root !== undefined) {
    patch.rootPath = assertDirectory(input.root);
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled ? 1 : 0;
  }

  db.update(locations).set(patch).where(eq(locations.id, id)).run();
  persistAllLocations();
}

export function setLocationEnabled(id: number, enabled: boolean): void {
  updateLocation(id, { enabled });
}

export function removeLocation(id: number): void {
  assertCatalogWritable();
  const db = getDb();
  const row = db.select().from(locations).where(eq(locations.id, id)).get();
  if (!row) throw new Error("Location not found");
  // Soft-remove: disable + drop from config by deleting the row's holdings? 
  // Keep holdings history: just disable and remove from config list via delete.
  db.delete(locations).where(eq(locations.id, id)).run();
  persistAllLocations();
}

/** Ensure DB reflects config (for page loads). */
export function ensureLocationsSynced(): void {
  syncLocationsFromConfig();
}

export function locationDisplayRoot(absPath: string): string {
  return toConfigPath(absPath);
}

export function suggestArchiveRoot(): string {
  return path.join(process.cwd(), "archive");
}
