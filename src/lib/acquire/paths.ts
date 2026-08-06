import { accessSync, constants, mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig, resolvePath } from "@/lib/config";

export type ArchiveSubdir = "documents" | "images" | "video" | "audio" | "notes";

/**
 * Primary Archive root: first enabled location whose name is "Archive"
 * (case-insensitive), else first enabled location, else ./archive.
 */
export function getArchiveRoot(): string {
  const config = loadConfig();
  const enabled = config.locations.filter((l) => l.enabled !== false);
  const named = enabled.find((l) => l.name.trim().toLowerCase() === "archive");
  const pick = named ?? enabled[0];
  if (pick) return resolvePath(pick.root);
  return resolvePath("./archive");
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
  try {
    const root = getArchiveRoot();
    mkdirSync(root, { recursive: true });
    accessSync(root, constants.W_OK);
    return true;
  } catch {
    return false;
  }
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
