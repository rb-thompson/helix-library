import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getDbPath } from "@/lib/config";
import * as schema from "@/lib/db/schema";
import { migrate } from "@/lib/db/migrate";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __nonOsDb: DrizzleDb | undefined;
  var __nonOsSqlite: Database.Database | undefined;
}

function openDatabase(): { sqlite: Database.Database; db: DrizzleDb } {
  const dbPath = getDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  migrate(sqlite);

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getSqlite(): Database.Database {
  if (!globalThis.__nonOsSqlite) {
    const opened = openDatabase();
    globalThis.__nonOsSqlite = opened.sqlite;
    globalThis.__nonOsDb = opened.db;
  }
  return globalThis.__nonOsSqlite;
}

export function getDb(): DrizzleDb {
  if (!globalThis.__nonOsDb) {
    const opened = openDatabase();
    globalThis.__nonOsSqlite = opened.sqlite;
    globalThis.__nonOsDb = opened.db;
  }
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
