import { execFileSync, spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "@/lib/config";
import { ensureArchiveSubdir, assertUnderArchive } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";
import type { AcquireProgress } from "@/lib/acquire/jobs";
import { setItemCatalogTitle } from "@/lib/catalog/query";
import {
  isCancelRequested,
  registerJobProcess,
  unregisterJobProcess,
} from "@/lib/jobs/store";
import { readExifRaw } from "@/lib/media/exif";

export function ytDlpAvailable(): boolean {
  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    try {
      execFileSync("which", ["yt-dlp"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

export function ytDlpVersion(): string | null {
  try {
    const out = execFileSync("yt-dlp", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    return out.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}

/** Strip share/tracking params that confuse some extractors. */
export function normalizeYoutubeUrl(url: string): string {
  const u = new URL(url.trim());
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  // youtu.be/ID or youtube.com/watch?v=ID
  if (u.hostname.replace(/^www\./, "") === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }
  if (u.hostname.includes("youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/watch?v=${v}`;
    // shorts / live paths keep pathname
    if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/live/")) {
      return `${u.origin}${u.pathname}`;
    }
  }
  // Other yt-dlp hosts: drop common tracking params
  for (const key of ["si", "feature", "pp", "utm_source", "utm_medium"]) {
    u.searchParams.delete(key);
  }
  return u.toString();
}

export type YoutubeMode = "video" | "audio";

export type YoutubeAcquireResult = {
  url: string;
  mode: YoutubeMode;
  path: string;
  itemId: number | null;
  tags?: string[];
  videoCodec?: string | null;
  audioCodec?: string | null;
};

type ProgressCb = (p: Partial<AcquireProgress>) => void;

export type YoutubeAcquireOpts = {
  /** Unified jobs id — enables process kill on cancel */
  jobId?: number;
};

/**
 * Parse yt-dlp stdout/stderr lines into UI progress.
 * Handles classic [download] lines, HLX progress-template, and extract phases.
 */
export function parseYtDlpProgressLine(line: string): Partial<AcquireProgress> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Custom template: HLXpct= 45.2% speed=1.2MiB/s eta=00:12 total=120.5MiB
  // _percent_str often includes spaces and a trailing %
  if (/^HLXpct=/i.test(trimmed) || trimmed.includes("HLXpct=")) {
    const pctRaw = trimmed.match(/HLXpct=\s*([\d.]+)\s*%?/i)?.[1];
    const n = pctRaw != null ? Number(pctRaw) : NaN;
    const speed = trimmed.match(/speed=(\S+)/i)?.[1];
    const eta = trimmed.match(/eta=(\S+)/i)?.[1];
    const total = trimmed.match(/total=(\S+)/i)?.[1];
    const clean = (v?: string) =>
      v && !/^N\/?A$/i.test(v) && v !== "Unknown" ? v : null;
    const bits = [
      Number.isFinite(n) ? `${n.toFixed(1)}%` : null,
      clean(total) ? `of ${clean(total)}` : null,
      clean(speed) ? `at ${clean(speed)}` : null,
      clean(eta) ? `ETA ${clean(eta)}` : null,
    ].filter(Boolean);
    return {
      stage: "downloading",
      percent: Number.isFinite(n) ? Math.min(88, Math.round(n * 0.88)) : null,
      detail: bits.join(" · ") || "Downloading media…",
    };
  }

  // Classic: [download]  45.2% of  12.00MiB at  1.00MiB/s ETA 00:06
  const pct = trimmed.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);
  if (pct) {
    const n = Number(pct[1]);
    const scaled = Math.min(88, Math.round(n * 0.88));
    return {
      stage: "downloading",
      percent: scaled,
      detail: trimmed.replace(/^\[download\]\s*/, "").trim().slice(0, 140),
    };
  }

  // Byte progress without percent (some extractors)
  const bytes = trimmed.match(
    /\[download\]\s+([\d.]+[KMG]?i?B)\s+at\s+(\S+)/i,
  );
  if (bytes) {
    return {
      stage: "downloading",
      percent: null,
      detail: `${bytes[1]} at ${bytes[2]}`,
    };
  }

  if (/\[Merger\]|Merging formats/i.test(trimmed)) {
    return { stage: "merging", percent: 90, detail: "Merging video + audio…" };
  }
  if (/\[ExtractAudio\]|Extracting audio/i.test(trimmed)) {
    return { stage: "converting", percent: 90, detail: "Extracting audio…" };
  }
  if (/\[Fixup|Post.?processing|Embedding/i.test(trimmed)) {
    return { stage: "writing", percent: 91, detail: trimmed.slice(0, 120) };
  }
  if (/Destination:|Writing video thumbnail|\[info\] Writing/i.test(trimmed)) {
    return { stage: "writing", percent: 92, detail: trimmed.slice(0, 120) };
  }

  // Extract / resolve phases (no % yet — still useful)
  if (/\[youtube\]|Extracting URL|Downloading webpage/i.test(trimmed)) {
    return {
      stage: "extracting",
      percent: 4,
      detail: cleanYtLine(trimmed),
    };
  }
  if (/Downloading .* player API|Downloading tv client|Downloading android/i.test(trimmed)) {
    return {
      stage: "extracting",
      percent: 6,
      detail: cleanYtLine(trimmed),
    };
  }
  if (/\[info\]\s+.*Downloading/i.test(trimmed) || /Downloading \d+ format/i.test(trimmed)) {
    return {
      stage: "downloading",
      percent: 8,
      detail: cleanYtLine(trimmed),
    };
  }
  if (/\[info\]/.test(trimmed) && /format/i.test(trimmed)) {
    return {
      stage: "extracting",
      percent: 7,
      detail: cleanYtLine(trimmed),
    };
  }

  return null;
}

function cleanYtLine(line: string): string {
  return line
    .replace(/^\[youtube\]\s*/i, "")
    .replace(/^\[info\]\s*/i, "")
    .replace(/^WARNING:\s*/i, "")
    .trim()
    .slice(0, 140);
}

/**
 * Download with yt-dlp into archive/video or archive/audio.
 * Streams progress via callback. No shell — fixed argv only.
 */
export async function acquireYoutube(
  urlRaw: string,
  mode: YoutubeMode = "video",
  onProgress?: ProgressCb,
  opts?: YoutubeAcquireOpts,
): Promise<YoutubeAcquireResult> {
  if (!ytDlpAvailable()) {
    throw new Error(
      "yt-dlp is not installed or not on PATH. Install it to acquire video/podcast holdings.",
    );
  }
  const jobId = opts?.jobId;
  if (jobId != null && isCancelRequested(jobId)) {
    throw new Error("Cancelled");
  }
  const url = normalizeYoutubeUrl(urlRaw);
  const subdir = mode === "audio" ? "audio" : "video";
  const destDir = ensureArchiveSubdir(subdir);
  assertUnderArchive(destDir);

  const config = loadConfig();
  const outTemplate = path.join(destDir, "%(title).80B [%(id)s].%(ext)s");

  onProgress?.({
    stage: "starting",
    percent: 2,
    detail: "Launching yt-dlp…",
  });

  /**
   * Prefer browser-playable streams:
   * - Video: H.264 (avc1) + AAC in mp4 — AV1/VP9+Opus often fails HTML5 video
   * - Audio: m4a/AAC
   *
   * Progress: --newline + progress-template (pipes are not a TTY; without this
   * yt-dlp may buffer until the end → UI stuck at 2%).
   */
  const progressFlags = [
    "--newline",
    "--progress",
    // Machine-readable download progress on stderr
    "--progress-template",
    "download:HLXpct=%(progress._percent_str)s speed=%(progress._speed_str)s eta=%(progress._eta_str)s total=%(progress._total_bytes_str)s",
  ];

  const commonTail = [
    "--embed-metadata",
    "-o",
    outTemplate,
    // Print path only after move (stdout) — keep separate from progress
    "--print",
    "after_move:filepath",
    "--no-mtime",
    "--extractor-args",
    "youtube:player_client=android,web",
    url,
  ];

  const args =
    mode === "audio"
      ? [
          "--no-playlist",
          ...progressFlags,
          "-f",
          "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio/best",
          "-x",
          "--audio-format",
          "m4a",
          "--audio-quality",
          "0",
          ...commonTail,
        ]
      : [
          "--no-playlist",
          ...progressFlags,
          "-f",
          [
            "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]",
            "bv*[vcodec^=avc1]+ba[acodec^=mp4a]",
            "b[ext=mp4][vcodec^=avc1]",
            "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]",
            "bv*+ba/b",
          ].join("/"),
          "-S",
          "vcodec:h264,res,acodec:aac",
          "--merge-output-format",
          "mp4",
          ...commonTail,
        ];

  const filePath = await new Promise<string>((resolve, reject) => {
    const child = spawn("yt-dlp", args, {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        // Encourage line-buffered C stdio when available
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (jobId != null) {
      registerJobProcess(jobId, child);
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let lastStage = "starting";
    let lastPct: number | null = 2;
    let lastDetail = "Launching yt-dlp…";
    const startedAt = Date.now();

    const timer = setTimeout(
      () => {
        if (!settled) {
          child.kill("SIGTERM");
          reject(new Error("yt-dlp timed out after 15 minutes"));
        }
      },
      15 * 60 * 1000,
    );

    // Heartbeat while yt-dlp is silent (extract / network stalls)
    const heartbeat = setInterval(() => {
      if (settled) return;
      const sec = Math.round((Date.now() - startedAt) / 1000);
      onProgress?.({
        stage: lastStage,
        percent: lastPct,
        detail: `${lastDetail} · ${sec}s elapsed`,
      });
    }, 1500);

    const cancelWatch = setInterval(() => {
      if (settled || jobId == null) return;
      if (isCancelRequested(jobId)) {
        child.kill("SIGTERM");
        settled = true;
        clearTimeout(timer);
        clearInterval(cancelWatch);
        clearInterval(heartbeat);
        unregisterJobProcess(jobId);
        reject(new Error("Cancelled"));
      }
    }, 500);

    const onLine = (line: string, from: "out" | "err") => {
      // Progress may use CR without LF; already split by caller
      const trimmed = line.replace(/\r/g, "").trim();
      if (!trimmed) return;
      if (from === "err" || /\[download\]|HLXpct=/i.test(trimmed)) {
        stderr += `${trimmed}\n`;
        if (stderr.length > 50_000) stderr = stderr.slice(-40_000);
      }
      if (from === "out") {
        // Don't treat progress templates on stdout as the filepath
        if (!trimmed.startsWith("HLXpct=") && !trimmed.startsWith("[")) {
          stdout += `${trimmed}\n`;
        }
      }
      const prog = parseYtDlpProgressLine(trimmed);
      if (prog) {
        if (prog.stage) lastStage = prog.stage;
        if (prog.percent !== undefined) lastPct = prog.percent;
        if (prog.detail) lastDetail = prog.detail;
        onProgress?.(prog);
      } else if (/ERROR:/i.test(trimmed)) {
        lastDetail = trimmed.slice(0, 160);
        onProgress?.({
          stage: lastStage,
          percent: lastPct,
          detail: lastDetail,
        });
      } else if (/WARNING:/i.test(trimmed) && /js runtime|deprecated/i.test(trimmed)) {
        // Don't spam, but surface once lightly
        onProgress?.({
          stage: lastStage === "starting" ? "extracting" : lastStage,
          percent: lastPct ?? 5,
          detail: "Resolving formats (no JS runtime — may be slower)…",
        });
      }
    };

    /** Split on both \n and \r (yt-dlp progress often uses CR). */
    function feed(buf: string, chunk: string, from: "out" | "err"): string {
      const combined = buf + chunk;
      const parts = combined.split(/\r\n|\n|\r/);
      const rest = parts.pop() ?? "";
      for (const p of parts) onLine(p, from);
      return rest;
    }

    let outBuf = "";
    let errBuf = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      outBuf = feed(outBuf, chunk.toString("utf8"), "out");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      errBuf = feed(errBuf, chunk.toString("utf8"), "err");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      clearInterval(cancelWatch);
      if (jobId != null) unregisterJobProcess(jobId);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      clearInterval(cancelWatch);
      if (jobId != null) unregisterJobProcess(jobId);
      if (settled) return;
      settled = true;
      if (outBuf.trim()) onLine(outBuf, "out");
      if (errBuf.trim()) onLine(errBuf, "err");

      if (code !== 0) {
        const detail = (stderr || stdout || `exit ${code}`).slice(-600);
        reject(new Error(`yt-dlp failed: ${detail}`));
        return;
      }
      const lines = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      // last absolute path line is usually the filepath from --print
      const file =
        [...lines]
          .reverse()
          .find(
            (l) =>
              (l.startsWith("/") || /^[A-Za-z]:[\\/]/.test(l)) &&
              !l.startsWith("HLX"),
          ) ?? lines[lines.length - 1];
      if (!file || file.startsWith("HLX")) {
        reject(new Error("yt-dlp finished but did not report an output path"));
        return;
      }
      resolve(file);
    });
  });

  const resolved = path.resolve(filePath);
  assertUnderArchive(resolved);

  const st = statSync(resolved);
  if (st.size < 1024) {
    throw new Error(
      `Downloaded file is suspiciously small (${st.size} bytes) — likely incomplete`,
    );
  }
  if (st.size > config.maxFileBytes) {
    throw new Error(
      `Downloaded file exceeds maxFileBytes (${config.maxFileBytes})`,
    );
  }

  const probe = probeMediaFile(resolved);
  if (mode === "video" && probe.videoCodec) {
    onProgress?.({
      stage: "validating",
      percent: 93,
      detail: `Codecs: ${probe.videoCodec}${probe.audioCodec ? ` + ${probe.audioCodec}` : ""}`,
    });
    if (isHardBrowserCodec(probe.videoCodec)) {
      // Still keep the file — warn via detail on result
      onProgress?.({
        stage: "validating",
        percent: 93,
        detail: `Warning: ${probe.videoCodec} may not play in all browsers (prefer H.264). Re-download if playback fails.`,
      });
    }
  }
  if (mode === "video" && !probe.videoCodec && probe.hasFfprobe) {
    throw new Error(
      "Downloaded file has no video stream (corrupt or audio-only). Try again or use Audio mode.",
    );
  }

  onProgress?.({
    stage: "reindexing",
    percent: 95,
    detail: "Indexing & applying metadata tags…",
  });
  const indexed = await indexAfterAcquire(resolved, { source: "youtube" });

  // Prefer embedded media title over on-disk basename when available
  if (indexed.itemId != null) {
    try {
      const row = readExifRaw(resolved);
      const rawTitle =
        row &&
        (row.Title ?? row.title ?? row["Track"] ?? row["Album"]);
      if (typeof rawTitle === "string") {
        const t = rawTitle.trim();
        if (t.length >= 2 && t.length <= 200 && !/^https?:\/\//i.test(t)) {
          setItemCatalogTitle(indexed.itemId, t, "yt-dlp");
        }
      }
    } catch {
      // non-fatal
    }
  }

  onProgress?.({
    stage: "done",
    percent: 100,
    detail:
      indexed.tags.length > 0
        ? `Complete · tags: ${indexed.tags.slice(0, 8).join(", ")}`
        : "Complete",
  });

  return {
    url,
    mode,
    path: resolved,
    itemId: indexed.itemId,
    tags: indexed.tags,
    videoCodec: probe.videoCodec,
    audioCodec: probe.audioCodec,
  };
}

function isHardBrowserCodec(codec: string): boolean {
  const c = codec.toLowerCase();
  return c.includes("av1") || c.includes("av01") || c === "vp9" || c === "vp09";
}

function probeMediaFile(absPath: string): {
  videoCodec: string | null;
  audioCodec: string | null;
  hasFfprobe: boolean;
} {
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,codec_type",
        "-of",
        "csv=p=0",
        absPath,
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    let videoCodec: string | null = null;
    let audioCodec: string | null = null;
    for (const line of out.split("\n")) {
      const [codec, type] = line.trim().split(",");
      if (type === "video" && codec) videoCodec = codec;
      if (type === "audio" && codec) audioCodec = codec;
    }
    return { videoCodec, audioCodec, hasFfprobe: true };
  } catch {
    return { videoCodec: null, audioCodec: null, hasFfprobe: false };
  }
}
