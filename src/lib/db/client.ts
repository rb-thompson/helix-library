import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { getDbPath } from "@/lib/config";
import * as schema from "@/lib/db/schema";
import { migrate } from "@/lib/db/migrate";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __nonOsDb: DrizzleDb | undefined;
  var __nonOsSqlite: Database.Database | undefined;
}

type RestoreGate = "idle" | "busy";
let restoreGate: RestoreGate = "idle";

export function setRestoreGate(next: RestoreGate): void {
  restoreGate = next;
}

export function isRestoreInProgress(): boolean {
  return restoreGate === "busy";
}

export class RestoreBusyError extends Error {
  status = 503;
  constructor() {
    super("Catalog restore is in progress — try again in a moment.");
    this.name = "RestoreBusyError";
  }
}

export function assertCatalogWritable(): void {
  if (restoreGate === "busy") {
    throw new RestoreBusyError();
  }
}

function liveSqlite(): Database.Database | undefined {
  const s = globalThis.__nonOsSqlite;
  if (s?.open) return s;
  if (s && !s.open) {
    globalThis.__nonOsSqlite = undefined;
    globalThis.__nonOsDb = undefined;
  }
  return undefined;
}

export function looksLikeSqlite(filePath: string): boolean {
  try {
    const fd = openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(16);
      const n = readSync(fd, buf, 0, 16, 0);
      return n >= 16 && buf.toString("utf8") === "SQLite format 3\0";
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

function rollbackRecoveryPath(): string {
  return path.join(
    path.dirname(getDbPath()),
    "exports",
    ".restore-rollback",
    "library.db",
  );
}

function recoverLiveIfNeeded(dbPath: string): void {
  const rollback = rollbackRecoveryPath();
  if (!existsSync(rollback)) return;
  const missing = !existsSync(dbPath);
  const corrupt = !missing && !looksLikeSqlite(dbPath);
  if (!missing && !corrupt) return;
  if (corrupt) {
    try {
      renameSync(dbPath, `${dbPath}.corrupt`);
    } catch {
      /* leave in place; rename of rollback may still fail */
    }
  }
  mkdirSync(path.dirname(dbPath), { recursive: true });
  renameSync(rollback, dbPath);
}

function openDatabase(): { sqlite: Database.Database; db: DrizzleDb } {
  const dbPath = getDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  recoverLiveIfNeeded(dbPath);

  const exists = existsSync(dbPath);
  if (!exists && restoreGate === "busy") {
    throw new RestoreBusyError();
  }

  const sqlite = exists
    ? new Database(dbPath, { fileMustExist: true })
    : new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("cache_size = -8000");
  sqlite.pragma("mmap_size = 67108864");

  migrate(sqlite);

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getSqlite(): Database.Database {
  const open = liveSqlite();
  if (open) return open;
  if (restoreGate === "busy") {
    throw new RestoreBusyError();
  }
  const opened = openDatabase();
  globalThis.__nonOsSqlite = opened.sqlite;
  globalThis.__nonOsDb = opened.db;
  return globalThis.__nonOsSqlite;
}

export function getDb(): DrizzleDb {
  const open = liveSqlite();
  if (open && globalThis.__nonOsDb) return globalThis.__nonOsDb;
  if (restoreGate === "busy") {
    throw new RestoreBusyError();
  }
  const opened = openDatabase();
  globalThis.__nonOsSqlite = opened.sqlite;
  globalThis.__nonOsDb = opened.db;
  return globalThis.__nonOsDb;
}

/**
 * Close and drop the process-wide SQLite singleton.
 * Used by tests so each suite can point at a fresh temp DB via config.
 */
export function resetDbConnection(): void {
  if (globalThis.__nonOsSqlite) {
    try {
      globalThis.__nonOsSqlite.close();
    } catch {
      // already closed
    }
  }
  globalThis.__nonOsSqlite = undefined;
  globalThis.__nonOsDb = undefined;
}
