import { rmSync } from "node:fs";
import {
  exportArchivePath,
  listExportFiles,
  modeFromFilename,
  parseExportFilename,
} from "@/lib/backup/paths";
import type { BackupFileInfo } from "@/lib/backup/types";

export function listBackups(): BackupFileInfo[] {
  return listExportFiles().map((f) => ({
    name: f.name,
    path: f.path,
    bytes: f.bytes,
    mtimeMs: f.mtimeMs,
    mode: modeFromFilename(f.name),
  }));
}

export function deleteBackup(name: string): void {
  const base = parseExportFilename(name);
  if (!base.endsWith(".tar.gz")) {
    throw new Error("Only .tar.gz backup archives can be deleted");
  }
  const full = exportArchivePath(base);
  rmSync(full, { force: true });
}
