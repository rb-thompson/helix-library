/**
 * Safe paths for Helix export/backup archives under data/exports/.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { getDbPath, projectRoot } from "@/lib/config";

export const EXPORT_DIR_NAME = "exports";
export const BACKUP_NAME_RE =
  /^helix-backup-(catalog|full)(?:-prerestore)?-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})Z\.tar\.gz$/;

export function exportsRoot(): string {
  // Prefer sibling of DB so backups live with library data
  const dbDir = path.dirname(getDbPath());
  const dir = path.join(dbDir, EXPORT_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function assertUnderExports(absPath: string): string {
  const root = path.resolve(exportsRoot());
  const target = path.resolve(absPath);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes exports directory");
  }
  return target;
}

/** Safe basename only — rejects traversal. */
export function parseExportFilename(name: string): string {
  const base = path.basename(name);
  if (base !== name || base.includes("..") || /[/\\]/.test(base)) {
    throw new Error("Invalid export filename");
  }
  if (!base.endsWith(".tar.gz") && !base.endsWith(".json")) {
    throw new Error("Unsupported export filename");
  }
  return base;
}

/**
 * Inspect/apply jail: same basename rules as parseExportFilename, but
 * only compressed archives. parseExportFilename also allows *.json.
 */
export function parseBackupArchiveFilename(name: string): string {
  const base = parseExportFilename(name);
  if (!base.endsWith(".tar.gz")) {
    throw new Error("Only .tar.gz backup archives can be inspected");
  }
  return base;
}

export function exportArchivePath(filename: string): string {
  const base = parseExportFilename(filename);
  return assertUnderExports(path.join(exportsRoot(), base));
}

export function stampForFilename(d = new Date()): string {
  // 2026-08-08T15:04:05.123Z → 2026-08-08T15-04-05Z (no millis / colons)
  return d
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
}

export function buildBackupFilename(
  mode: "catalog" | "full",
  stamp?: string,
  opts?: { prerestore?: boolean },
): string {
  const s = stamp ?? stampForFilename();
  const infix = opts?.prerestore ? "-prerestore" : "";
  return `helix-backup-${mode}${infix}-${s}.tar.gz`;
}

/** Sibling of the live catalog — never cwd/data/. */
export function restoreLockPath(): string {
  return path.join(path.dirname(getDbPath()), "library.restore.lock");
}

/**
 * True when a restore lock exists and its pid is alive.
 * Stale pid (ESRCH) → unlink and return false.
 */
export function isRestoreLockHeld(): boolean {
  const p = restoreLockPath();
  if (!existsSync(p)) return false;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as { pid?: unknown };
    const pid = typeof raw.pid === "number" ? raw.pid : Number(raw.pid);
    if (!Number.isFinite(pid) || pid <= 0) {
      unlinkSync(p);
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        unlinkSync(p);
        return false;
      }
      return true;
    }
  } catch {
    return true;
  }
}

export function configWritePath(): string | null {
  const candidates = [
    process.env.NON_OS_CONFIG,
    path.join(projectRoot(), "library.config.json"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function listExportFiles(): Array<{
  name: string;
  path: string;
  bytes: number;
  mtimeMs: number;
}> {
  const root = exportsRoot();
  if (!existsSync(root)) return [];
  const out: Array<{
    name: string;
    path: string;
    bytes: number;
    mtimeMs: number;
  }> = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".tar.gz")) continue;
    if (name.startsWith(".")) continue;
    const full = path.join(root, name);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      out.push({
        name,
        path: full,
        bytes: st.size,
        mtimeMs: st.mtimeMs,
      });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/** Infer mode from standard filename. */
export function modeFromFilename(name: string): "catalog" | "full" | "unknown" {
  const m = name.match(BACKUP_NAME_RE);
  if (!m) return "unknown";
  return m[1] === "full" ? "full" : "catalog";
}
