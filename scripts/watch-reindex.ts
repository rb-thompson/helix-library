/**
 * Debounced auto-reindex when files change under enabled location roots.
 * Run separately from Next: `npm run watch`
 *
 * Never scans $HOME — only roots from library.config.json.
 */
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { isRestoreLockHeld } from "../src/lib/backup/paths";
import { loadConfig, clearConfigCache } from "../src/lib/config";
import { isReindexRunning, runReindex } from "../src/lib/indexer/run";

const DEBOUNCE_MS = Number(process.env.NON_OS_WATCH_DEBOUNCE_MS || 3000);

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let pending = false;

async function triggerReindex(reason: string) {
  if (isRestoreLockHeld()) {
    // Do not queue catch-up; the next FS event after unlock will schedule.
    console.log(`[watch] restore lock present; skip reindex (${reason})`);
    return;
  }
  if (running || isReindexRunning()) {
    pending = true;
    console.log(`[watch] reindex already running; will re-run after (${reason})`);
    return;
  }
  running = true;
  pending = false;
  console.log(`[watch] reindex starting… (${reason})`);
  try {
    clearConfigCache();
    const { jobId, stats } = await runReindex();
    console.log(
      `[watch] job #${jobId} done — seen ${stats.seen}, added ${stats.added}, updated ${stats.updated}, missing ${stats.missing}, errors ${stats.errors}`,
    );
  } catch (err) {
    console.error("[watch] reindex failed:", err);
  } finally {
    running = false;
    if (pending) {
      void triggerReindex("queued changes");
    }
  }
}

function schedule(reason: string) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void triggerReindex(reason);
  }, DEBOUNCE_MS);
}

function main() {
  clearConfigCache();
  const config = loadConfig(true);
  const roots = config.locations
    .filter((l) => l.enabled !== false)
    .map((l) => l.root);

  if (roots.length === 0) {
    console.error("[watch] no enabled locations in config");
    process.exit(1);
  }

  console.log(
    `[watch] Helix Library — watching ${roots.length} root(s), debounce ${DEBOUNCE_MS}ms`,
  );
  for (const root of roots) {
    console.log(`  · ${root}`);
  }

  const watchers: FSWatcher[] = [];
  for (const root of roots) {
    try {
      const w = watch(
        root,
        { recursive: true },
        (event, filename) => {
          const rel = filename ? String(filename) : "(unknown)";
          // Ignore thumb/db churn if someone nests data under a root (unlikely).
          if (rel.includes("node_modules") || rel.includes(".git")) return;
          schedule(`${event} ${path.join(root, rel)}`);
        },
      );
      w.on("error", (err) => {
        console.error(`[watch] error on ${root}:`, err.message);
      });
      watchers.push(w);
    } catch (err) {
      console.error(
        `[watch] cannot watch ${root}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (watchers.length === 0) {
    console.error("[watch] no watchers started");
    process.exit(1);
  }

  const shutdown = () => {
    console.log("[watch] stopping…");
    for (const w of watchers) w.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
