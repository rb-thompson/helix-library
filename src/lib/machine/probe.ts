import { cpus, freemem, hostname, loadavg, platform, release, totalmem } from "node:os";
import { statfsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { getLatestJob } from "@/lib/indexer/run";
import { getDbPath, loadConfig } from "@/lib/config";

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function diskFor(path: string) {
  try {
    const s = statfsSync(path);
    const total = s.bsize * s.blocks;
    const free = s.bsize * s.bavail;
    return { total, free, used: total - free };
  } catch {
    return null;
  }
}

export function probeMachine() {
  const config = loadConfig();
  const memTotal = totalmem();
  const memFree = freemem();
  const job = getLatestJob();

  return {
    hostname: hostname(),
    platform: platform(),
    release: release(),
    cpuCount: cpus().length,
    loadavg: loadavg(),
    memory: {
      total: memTotal,
      free: memFree,
      used: memTotal - memFree,
    },
    disk: diskFor("/"),
    dbPath: getDbPath(),
    bind: config.bind,
    port: config.port,
    tools: {
      ffprobe: commandExists("ffprobe"),
      ffmpeg: commandExists("ffmpeg"),
      exiftool: commandExists("exiftool"),
      pdftotext: commandExists("pdftotext"),
    },
    latestJob: job
      ? {
          id: job.id,
          status: job.status,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          statsJson: job.statsJson,
          error: job.error,
        }
      : null,
  };
}
