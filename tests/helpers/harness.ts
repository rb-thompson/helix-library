import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearConfigCache } from "@/lib/config";
import { resetDbConnection } from "@/lib/db/client";

const projectRoot = path.resolve(__dirname, "../..");

export function fixtureRoot(): string {
  return path.join(projectRoot, "fixtures", "sample-root");
}

export type TestEnv = {
  dir: string;
  configPath: string;
  dbPath: string;
  cleanup: () => void;
};

/**
 * Isolate config + SQLite for one test file / suite.
 * Call once in before(); cleanup in after().
 */
export function createTestEnv(opts?: {
  locationName?: string;
  root?: string;
}): TestEnv {
  const dir = mkdtempSync(path.join(tmpdir(), "non-os-test-"));
  const dbPath = path.join(dir, "library.db");
  const configPath = path.join(dir, "library.config.json");
  const root = opts?.root ?? fixtureRoot();

  writeFileSync(
    configPath,
    JSON.stringify(
      {
        bind: "127.0.0.1",
        port: 4747,
        dbPath,
        locations: [
          {
            name: opts?.locationName ?? "Fixtures",
            root,
            enabled: true,
          },
        ],
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/README.md",
        ],
        maxFileBytes: 64 * 1024 * 1024,
        hashFullUnderBytes: 8 * 1024 * 1024,
      },
      null,
      2,
    ),
  );

  process.env.NON_OS_CONFIG = configPath;
  clearConfigCache();
  resetDbConnection();

  return {
    dir,
    configPath,
    dbPath,
    cleanup: () => {
      resetDbConnection();
      clearConfigCache();
      delete process.env.NON_OS_CONFIG;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

/** Ensure a writable thumbs dir exists under project data (enrichment side-effect). */
export function ensureThumbsParent(): void {
  mkdirSync(path.join(projectRoot, "data", "thumbs"), { recursive: true });
}
