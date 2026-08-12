import { AsyncLocalStorage } from "node:async_hooks";
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { loadConfig, resolvePath } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";

export type ArchiveSubdir =
  | "documents"
  | "images"
  | "video"
  | "audio"
  | "notes"
  | "code";

/** One enabled location that Acquire can write into. */
export type AcquireTarget = {
  locationId: number;
  name: string;
  root: string;
  /** Directory exists on disk (mounted). */
  available: boolean;
  /** Writable when available. */
  writable: boolean;
};

/**
 * Per-request override for which location root acquires write into.
 * Set via `runWithArchiveRoot` in API/job handlers.
 */
const archiveRootStore = new AsyncLocalStorage<string>();

/**
 * Default Archive root: first enabled location named "Archive"
 * (case-insensitive), else first enabled location, else ./archive.
 */
export function getDefaultArchiveRoot(): string {
  const config = loadConfig();
  const enabled = config.locations.filter((l) => l.enabled !== false);
  const named = enabled.find((l) => l.name.trim().toLowerCase() === "archive");
  const pick = named ?? enabled[0];
  if (pick) return resolvePath(pick.root);
  return resolvePath("./archive");
}

/**
 * Active archive root for path helpers. Uses AsyncLocalStorage override
 * when set (Acquire desk target), otherwise the default Archive location.
 */
export function getArchiveRoot(): string {
  return archiveRootStore.getStore() ?? getDefaultArchiveRoot();
}

/** Run sync work with a forced archive root (acquire destination). */
export function runWithArchiveRoot<T>(root: string, fn: () => T): T {
  return archiveRootStore.run(path.resolve(root), fn);
}

/** Run async work with a forced archive root (acquire destination). */
export function runWithArchiveRootAsync<T>(
  root: string,
  fn: () => Promise<T>,
): Promise<T> {
  return archiveRootStore.run(path.resolve(root), fn);
}

export function isPathWritable(root: string): boolean {
  try {
    if (!existsSync(root)) return false;
    mkdirSync(root, { recursive: true });
    accessSync(root, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enabled catalog locations as Acquire destinations.
 * Prefer DB rows (stable ids) after locations have been synced from config.
 */
export function listAcquireTargets(): AcquireTarget[] {
  const db = getDb();
  const rows = db
    .select()
    .from(locations)
    .where(eq(locations.enabled, 1))
    .orderBy(asc(locations.name))
    .all();

  const targets = rows.map((row) => {
    const root = path.resolve(row.rootPath);
    const available = existsSync(root);
    return {
      locationId: row.id,
      name: row.name,
      root,
      available,
      writable: available && isPathWritable(root),
    };
  });

  // Prefer "Archive" name first in lists
  targets.sort((a, b) => {
    const aArch = a.name.trim().toLowerCase() === "archive" ? 0 : 1;
    const bArch = b.name.trim().toLowerCase() === "archive" ? 0 : 1;
    if (aArch !== bArch) return aArch - bArch;
    return a.name.localeCompare(b.name);
  });

  return targets;
}

/**
 * Resolve a location id to an absolute root for acquires.
 * Rejects disabled / missing / unmounted locations.
 */
export function resolveArchiveRootFromLocationId(
  locationId: number | null | undefined,
): string {
  if (locationId == null) {
    return getDefaultArchiveRoot();
  }
  if (!Number.isInteger(locationId) || locationId < 1) {
    throw new Error("Invalid locationId");
  }

  const db = getDb();
  const row = db
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))
    .get();

  if (!row) {
    throw new Error(`Location #${locationId} not found`);
  }
  if (row.enabled !== 1) {
    throw new Error(`Location “${row.name}” is disabled`);
  }

  const root = path.resolve(row.rootPath);
  if (!existsSync(root)) {
    throw new Error(
      `Location “${row.name}” is not available (not mounted?): ${root}`,
    );
  }
  if (!isPathWritable(root)) {
    throw new Error(`Location “${row.name}” is not writable: ${root}`);
  }
  return root;
}

/** Parse optional locationId from an API JSON body. */
export function parseLocationIdBody(
  body: { locationId?: unknown } | null | undefined,
): number | undefined {
  if (body == null || body.locationId == null || body.locationId === "") {
    return undefined;
  }
  const n = Number(body.locationId);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("locationId must be a positive integer");
  }
  return n;
}

export function ensureArchiveSubdir(subdir: ArchiveSubdir): string {
  const root = getArchiveRoot();
  const dir = path.join(root, subdir);
  assertUnderArchive(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Resolve a path under archive and reject escapes. */
export function safeArchivePath(
  subdir: ArchiveSubdir,
  filename: string,
): string {
  // Reject path separators / traversal before any basename stripping.
  if (
    !filename ||
    filename.includes("..") ||
    /[/\\]/.test(filename) ||
    path.isAbsolute(filename)
  ) {
    throw new Error("Invalid filename");
  }
  const dir = ensureArchiveSubdir(subdir);
  const base = sanitizeFilename(filename);
  if (!base || base === "." || base === "..") {
    throw new Error("Invalid filename");
  }
  const full = path.resolve(dir, base);
  assertUnderArchive(full);
  // Must stay inside the subdir as well
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes archive subdirectory");
  }
  return full;
}

export function assertUnderArchive(absPath: string): void {
  const root = path.resolve(getArchiveRoot());
  const target = path.resolve(absPath);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path is outside the Archive root");
  }
}

export function archiveWritable(): boolean {
  return isPathWritable(getArchiveRoot());
}

/** Safe single-segment filename (no directories). */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).normalize("NFKC");
  return base
    .replace(/[^\w.\-()+@]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
}

export function slugify(text: string, max = 48): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, max)
    .replace(/^-|-$/g, "");
}
