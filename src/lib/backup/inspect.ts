/**
 * Inspect a helix-backup-v1 archive in the exports jail.
 * Reads only (tar list + MANIFEST on stdout). Never extracts holdings
 * or writes the live catalog / config.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { catalogStats } from "@/lib/catalog/query";
import { getDbPath, loadConfig } from "@/lib/config";
import {
  exportArchivePath,
  parseBackupArchiveFilename,
} from "@/lib/backup/paths";
import type {
  RestoreLiveStats,
  RestoreLocationAction,
  RestorePreview,
} from "@/lib/backup/types";

export const RESTORE_LIST_MEMBER_CAP = 5000;
export const RESTORE_ARCHIVE_MAX_BYTES = 32 * 1024 * 1024 * 1024;

const MANIFEST_MAX_BYTES = 1024 * 1024;
const TAR_LIST_TIMEOUT_MS = 60_000;
const TAR_EXTRACT_MIN_MS = 30_000;
const TAR_EXTRACT_MAX_MS = 20 * 60_000;
/** Conservative gzip sequential-scan rate for timeout scaling. */
const TAR_SCAN_BYTES_PER_SEC = 32 * 1024 * 1024;

function extractTimeoutMs(archiveBytes: number): number {
  // tar -xOf still walks members packed before the target (holdings-first full).
  const scanMs = Math.ceil(archiveBytes / TAR_SCAN_BYTES_PER_SEC) * 1000;
  return Math.min(
    TAR_EXTRACT_MAX_MS,
    Math.max(TAR_EXTRACT_MIN_MS, scanMs + TAR_EXTRACT_MIN_MS),
  );
}

/** Directory prefixes listed so createBackup's thumbs/ / holdings/ entries pass. */
export const RESTORE_MEMBER_ALLOWLIST = [
  /^MANIFEST\.json$/,
  /^RESTORE\.md$/,
  /^library\.config\.json$/,
  /^library\.db$/,
  /^library\.db-wal$/,
  /^library\.db-shm$/,
  /^thumbs\/?$/,
  /^thumbs\/[^/]+\.webp$/,
  /^holdings(\/.*)?$/,
] as const;

export type TarMemberKind = "file" | "dir" | "link" | "other";

export type TarMemberAudit = {
  ok: boolean;
  errors: string[];
  members: Array<{ name: string; kind: TarMemberKind }>;
};

const restoreManifestSchema = z.object({
  format: z.literal("helix-backup-v1"),
  createdAt: z.string().min(1),
  mode: z.enum(["catalog", "full"]),
  includeThumbs: z.boolean(),
  app: z.literal("helix-library"),
  hostname: z.string().nullable(),
  includes: z.array(z.string()),
  locations: z.array(
    z.object({
      name: z.string(),
      root: z.string(),
      enabled: z.boolean(),
      included: z.boolean(),
    }),
  ),
  notes: z.array(z.string()),
});

const SYSTEM_EXACT = new Set(["/", "/etc", "/usr", "/var", "/root", "/home"]);
const SYSTEM_PREFIXES = ["/etc/", "/usr/", "/var/", "/root/"];

export function normalizeMemberName(name: string): string {
  let n = name.replace(/\\/g, "/");
  while (n.startsWith("./")) n = n.slice(2);
  return n;
}

function isAbsoluteMember(name: string): boolean {
  const n = name.replace(/\\/g, "/");
  if (n.startsWith("/")) return true;
  if (/^[A-Za-z]:\//.test(n)) return true;
  return false;
}

function hasDotDotSegment(name: string): boolean {
  return name.split(/[/\\]/).some((seg) => seg === "..");
}

function isAllowlisted(name: string): boolean {
  return RESTORE_MEMBER_ALLOWLIST.some((re) => re.test(name));
}

export function auditTarMembers(
  names: Array<string | { name: string; kind?: TarMemberKind }>,
): TarMemberAudit {
  const members: TarMemberAudit["members"] = [];
  const errors: string[] = [];

  for (const entry of names) {
    const raw = typeof entry === "string" ? entry : entry.name;
    const name = normalizeMemberName(raw);
    let kind: TarMemberKind;
    if (typeof entry === "string") {
      kind = name.endsWith("/") ? "dir" : "file";
    } else {
      kind = entry.kind ?? (name.endsWith("/") ? "dir" : "file");
    }
    members.push({ name, kind });

    if (!name) {
      errors.push("Empty tar member name");
      continue;
    }
    if (isAbsoluteMember(name)) {
      errors.push(`Absolute tar member: ${name}`);
    }
    if (hasDotDotSegment(name)) {
      errors.push(`Path-escape tar member: ${name}`);
    }
    if (name.startsWith("~")) {
      errors.push(`Home-relative tar member: ${name}`);
    }
    if (kind === "link") {
      errors.push(`Symlink or hardlink member: ${name}`);
    }
    if (kind === "other") {
      errors.push(`Unsupported member type: ${name}`);
    }
    if (!isAllowlisted(name)) {
      errors.push(`Member not on restore allowlist: ${name}`);
    }
  }

  return { ok: errors.length === 0, errors, members };
}

function thisHostname(): string {
  try {
    return hostname();
  } catch {
    return "";
  }
}

function thisHomedir(): string | null {
  try {
    const h = homedir();
    return h ? path.resolve(h) : null;
  } catch {
    return null;
  }
}

function isOrUnder(abs: string, root: string): boolean {
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function liveConfiguredRoots(): Set<string> {
  const out = new Set<string>();
  for (const l of loadConfig().locations) {
    const resolved = path.resolve(l.root);
    out.add(resolved);
    try {
      if (existsSync(resolved)) out.add(realpathSync(resolved));
    } catch {
      /* unreadable */
    }
  }
  return out;
}

function expandHomePrefixed(raw: string): string | null {
  const home = thisHomedir();
  if (!home) return null;
  if (raw === "~") return home;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    return path.join(home, raw.slice(2));
  }
  if (raw === "$HOME" || raw === "${HOME}") return home;
  if (raw.startsWith("$HOME/") || raw.startsWith("$HOME\\")) {
    return path.join(home, raw.slice(6));
  }
  if (raw.startsWith("${HOME}/") || raw.startsWith("${HOME}\\")) {
    return path.join(home, raw.slice(8));
  }
  return null;
}

/** Jail a path that is already lexical-resolved (no symlink follow). */
function jailReasonForResolved(resolved: string): string | null {
  if (SYSTEM_EXACT.has(resolved)) {
    return `Refusing system path: ${resolved}`;
  }
  if (SYSTEM_PREFIXES.some((p) => resolved === p.slice(0, -1) || resolved.startsWith(p))) {
    return `Refusing system prefix: ${resolved}`;
  }

  const home = thisHomedir();
  if (home && resolved === home) {
    return "Refusing home directory as a scan root";
  }

  // More specific than the generic $HOME-child rule (cwd often lives under home).
  const cwd = path.resolve(process.cwd());
  if (resolved === cwd) {
    return "Refusing project working directory as a scan root";
  }
  if (isOrUnder(resolved, path.join(cwd, "src"))) {
    return "Refusing src/ as a scan root";
  }
  if (isOrUnder(resolved, path.join(cwd, ".git"))) {
    return "Refusing .git/ as a scan root";
  }

  if (home && isOrUnder(resolved, home) && !liveConfiguredRoots().has(resolved)) {
    return `Refusing path under home unless it is already a live location: ${resolved}`;
  }
  return null;
}

/** Jail-only: does not require the path to exist. Checks lexical, ~/$HOME, and realpath. */
export function forbiddenRestoreRootReason(abs: string): string | null {
  const expanded = expandHomePrefixed(abs);
  if (expanded) {
    const homeReason = jailReasonForResolved(path.resolve(expanded));
    if (homeReason) return homeReason;
  }

  const resolved = path.resolve(abs);
  const lexical = jailReasonForResolved(resolved);
  if (lexical) return lexical;

  try {
    if (existsSync(resolved)) {
      const physical = realpathSync(resolved);
      if (physical !== resolved) {
        const phys = jailReasonForResolved(physical);
        if (phys) return phys;
      }
    }
  } catch {
    /* dangling / unreadable — lexical result stands */
  }
  return null;
}

/**
 * Shared by inspect flags, apply use-archived, and remapTo.
 * Must exist, be a directory, and pass the restore-root jail
 * (lexical path and physical path after realpath).
 */
export function assertRestorableRoot(abs: string): void {
  const resolved = path.resolve(abs);
  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  if (!statSync(resolved).isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  const reason = forbiddenRestoreRootReason(resolved);
  if (reason) throw new Error(reason);
}

function tarAvailable(): boolean {
  try {
    const r = spawnSync("tar", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

const PERM_RE = /^[ldhbcpsfgx-][rwxsStT+-]+/;

/** Parse GNU / bsdtar `tar -tvzf` (and name-only `-tzf`) lines. */
export function parseTarVerboseLine(
  line: string,
): { name: string; kind: TarMemberKind; skip?: boolean } | null {
  const trimmed = line.replace(/\r$/, "");
  if (!trimmed) return null;

  const typeChar = trimmed[0];
  if (typeChar === "x" || typeChar === "g") {
    return { name: "", kind: "other", skip: true };
  }

  if (!PERM_RE.test(trimmed)) {
    const name = normalizeMemberName(trimmed);
    if (!name) return null;
    return { name, kind: name.endsWith("/") ? "dir" : "file" };
  }

  let kind: TarMemberKind = "other";
  if (typeChar === "l" || typeChar === "h") kind = "link";
  else if (typeChar === "d") kind = "dir";
  else if (typeChar === "-" || typeChar === "f") kind = "file";

  let name: string | undefined;
  const gnu = trimmed.match(
    /\s\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+(.*)$/,
  );
  if (gnu) name = gnu[1];
  if (name == null) {
    const bsd = trimmed.match(
      /\s[A-Z][a-z]{2}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\s+(.*)$/,
    );
    if (bsd) name = bsd[1];
  }
  if (name == null) {
    const parts = trimmed.split(/\s+/);
    name = parts[parts.length - 1];
  }
  if (kind === "link") {
    const arrow = name.indexOf(" -> ");
    if (arrow >= 0) name = name.slice(0, arrow);
  }
  name = normalizeMemberName(name);
  if (!name) return null;
  return { name, kind };
}

async function streamTarMembers(
  archivePath: string,
): Promise<{
  members: Array<{ name: string; kind: TarMemberKind }>;
  truncated: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-tvzf", archivePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const members: Array<{ name: string; kind: TarMemberKind }> = [];
    let truncated = false;
    let settled = false;
    const errChunks: Buffer[] = [];

    const finish = (
      err: Error | null,
      result?: {
        members: Array<{ name: string; kind: TarMemberKind }>;
        truncated: boolean;
      },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        rl.close();
      } catch {
        /* already closed */
      }
      if (err) reject(err);
      else resolve(result!);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error("tar list timed out"));
    }, TAR_LIST_TIMEOUT_MS);

    child.stderr?.on("data", (c: Buffer) => {
      errChunks.push(c);
    });
    child.on("error", (e) => finish(e));

    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      if (settled) return;
      const parsed = parseTarVerboseLine(line);
      if (!parsed || parsed.skip) return;
      members.push({ name: parsed.name, kind: parsed.kind });
      if (members.length >= RESTORE_LIST_MEMBER_CAP) {
        truncated = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        finish(null, { members, truncated });
      }
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      if (code !== 0 && code !== null && !truncated) {
        const err = Buffer.concat(errChunks).toString("utf8").slice(0, 400);
        finish(
          new Error(
            `tar list failed (${code}${signal ? `/${signal}` : ""}): ${err}`,
          ),
        );
        return;
      }
      finish(null, { members, truncated });
    });
  });
}

async function readTarMemberStdout(
  archivePath: string,
  member: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xOf", archivePath, member], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    let oversized = false;

    const finish = (err: Error | null, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(text!);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error(`Timed out reading ${member} from archive`));
    }, timeoutMs);

    child.stdout?.on("data", (c: Buffer) => {
      bytes += c.length;
      if (bytes > MANIFEST_MAX_BYTES) {
        oversized = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        return;
      }
      out.push(c);
    });
    child.stderr?.on("data", (c: Buffer) => {
      errChunks.push(c);
    });
    child.on("error", (e) => finish(e));
    child.on("close", (code) => {
      if (oversized) {
        finish(new Error(`${member} is too large to parse`));
        return;
      }
      if (code !== 0) {
        const err = Buffer.concat(errChunks).toString("utf8").slice(0, 400);
        finish(
          new Error(
            `Failed to read ${member} from archive${err ? `: ${err}` : ""}`,
          ),
        );
        return;
      }
      finish(null, Buffer.concat(out).toString("utf8"));
    });
  });
}

function dirExists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function matchLiveLocation(
  archivedName: string,
  archivedRoot: string,
  live: Array<{ name: string; root: string }>,
): { name: string; root: string } | null {
  const byName = live.filter((l) => l.name === archivedName);
  if (byName.length === 1) return byName[0];
  const resolved = path.resolve(archivedRoot);
  if (byName.length > 1) {
    return byName.find((l) => l.root === resolved) ?? null;
  }
  return live.find((l) => l.root === resolved) ?? null;
}

function nameIsThumbs(n: string): boolean {
  return n === "thumbs" || n === "thumbs/" || n.startsWith("thumbs/");
}

function nameIsHoldings(n: string): boolean {
  return n === "holdings" || n === "holdings/" || n.startsWith("holdings/");
}

/**
 * Targeted list of catalog members (never holdings/). Used when the 5k
 * prefix is truncated so library.db / config / thumbs after holdings still count.
 */
async function probeCatalogMembers(
  archivePath: string,
  want: string[],
  timeoutMs: number,
): Promise<Array<{ name: string; kind: TarMemberKind }>> {
  if (want.length === 0) return [];
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-tvzf", archivePath, ...want], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const members: Array<{ name: string; kind: TarMemberKind }> = [];
    let settled = false;

    const finish = (
      err: Error | null,
      result?: Array<{ name: string; kind: TarMemberKind }>,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        rl.close();
      } catch {
        /* already closed */
      }
      if (err) reject(err);
      else resolve(result!);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error("tar member probe timed out"));
    }, timeoutMs);

    child.on("error", (e) => finish(e));

    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      if (settled) return;
      const parsed = parseTarVerboseLine(line);
      if (!parsed || parsed.skip) return;
      members.push({ name: parsed.name, kind: parsed.kind });
    });

    child.on("close", () => {
      // Non-zero is normal when some requested names are absent.
      finish(null, members);
    });
  });
}

export async function inspectBackup(name: string): Promise<RestorePreview> {
  if (!tarAvailable()) {
    throw new Error("tar is required to inspect backups (GNU tar / bsdtar on PATH).");
  }

  const base = parseBackupArchiveFilename(name);
  const abs = exportArchivePath(base);
  if (!existsSync(abs)) {
    throw new Error("Backup archive not found");
  }
  const st = statSync(abs);
  if (!st.isFile()) {
    throw new Error("Backup is not a file");
  }
  if (st.size > RESTORE_ARCHIVE_MAX_BYTES) {
    throw new Error("Archive is too large to inspect (max 32 GiB)");
  }

  const listed = await streamTarMembers(abs);
  const audit = auditTarMembers(listed.members);
  if (!audit.ok) {
    throw new Error(`Unsafe archive members: ${audit.errors.join("; ")}`);
  }

  const memberNames = audit.members.map((m) => normalizeMemberName(m.name));
  let hasManifest = memberNames.some((n) => n === "MANIFEST.json");
  let hasDb = memberNames.some((n) => n === "library.db");
  let hasConfig = memberNames.some((n) => n === "library.config.json");
  let hasThumbs = memberNames.some(nameIsThumbs);
  let hasHoldings = memberNames.some(nameIsHoldings);

  if (!hasManifest && !listed.truncated) {
    throw new Error("Archive is missing MANIFEST.json");
  }

  const memberTimeoutMs = extractTimeoutMs(st.size);

  let manifestRaw: string;
  try {
    manifestRaw = await readTarMemberStdout(abs, "MANIFEST.json", memberTimeoutMs);
    hasManifest = true;
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? e.message
        : "Failed to read MANIFEST.json from archive",
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(manifestRaw);
  } catch {
    throw new Error("Invalid or unknown backup manifest");
  }
  const parsed = restoreManifestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("Invalid or unknown backup manifest");
  }
  const manifest = parsed.data;

  // A truncated 5k prefix is not an inventory of catalog members (holdings-first).
  if (listed.truncated && (!hasDb || !hasConfig || !hasThumbs)) {
    const want: string[] = [];
    if (!hasDb) want.push("library.db");
    if (!hasConfig) want.push("library.config.json");
    if (!hasThumbs) want.push("thumbs", "thumbs/");
    const probed = await probeCatalogMembers(abs, want, memberTimeoutMs);
    const probeAudit = auditTarMembers(probed);
    if (!probeAudit.ok) {
      throw new Error(`Unsafe archive members: ${probeAudit.errors.join("; ")}`);
    }
    for (const m of probeAudit.members) {
      const n = normalizeMemberName(m.name);
      if (n === "library.db") hasDb = true;
      if (n === "library.config.json") hasConfig = true;
      if (nameIsThumbs(n)) hasThumbs = true;
    }
  }

  if (listed.truncated) {
    const inc = manifest.includes;
    if (!hasConfig && inc.some((i) => i.includes("library.config.json"))) {
      hasConfig = true;
    }
    if (!hasThumbs && inc.some((i) => i.startsWith("thumbs"))) {
      hasThumbs = true;
    }
    if (
      !hasHoldings &&
      (inc.some((i) => i.startsWith("holdings")) ||
        manifest.locations.some((l) => l.included))
    ) {
      hasHoldings = true;
    }
  }

  if (!hasDb) {
    throw new Error("Archive is missing library.db");
  }

  const live = loadConfig().locations.map((l) => ({
    name: l.name,
    root: path.resolve(l.root),
    enabled: l.enabled !== false,
  }));

  const here = thisHostname();
  const hostnameMismatch = Boolean(
    manifest.hostname && here && manifest.hostname !== here,
  );

  const locations: RestorePreview["locations"] = manifest.locations.map(
    (loc) => {
      const archivedRoot = loc.root;
      const resolvedArchived = path.resolve(archivedRoot);
      const matched = matchLiveLocation(loc.name, archivedRoot, live);
      const hasName = live.some((l) => l.name === loc.name);
      const defaultAction: RestoreLocationAction = hasName
        ? "keep-live"
        : "disable";
      const liveRoot = matched?.root ?? null;
      return {
        name: loc.name,
        archivedRoot,
        archivedEnabled: loc.enabled,
        includedInArchive: loc.included,
        liveRoot,
        liveExists: liveRoot ? dirExists(liveRoot) : false,
        archivedRootExists: dirExists(resolvedArchived),
        forbidden: forbiddenRestoreRootReason(resolvedArchived) !== null,
        defaultAction,
      };
    },
  );

  const warnings: string[] = [];
  if (hostnameMismatch) {
    warnings.push(
      `This snapshot was created on “${manifest.hostname}”, not this machine (${here}).`,
    );
  }
  if (hasHoldings) {
    warnings.push(
      "This snapshot includes holdings trees (holdings/). Helix will not copy them onto live stacks in this version.",
    );
  }
  for (const loc of locations) {
    if (!loc.archivedRootExists) {
      warnings.push(
        `Archived location “${loc.name}” root is missing: ${loc.archivedRoot}`,
      );
    }
    if (loc.forbidden) {
      warnings.push(
        `Archived location “${loc.name}” root cannot be enabled (${loc.archivedRoot}).`,
      );
    }
  }

  const previewHash = createHash("sha256")
    .update(`${base}\0${st.mtimeMs}\0${st.size}\0`)
    .update(manifestRaw)
    .digest("hex");

  return {
    name: base,
    bytes: st.size,
    mode: manifest.mode,
    format: "helix-backup-v1",
    createdAt: manifest.createdAt,
    hostname: manifest.hostname,
    thisHostname: here,
    hostnameMismatch,
    includeThumbs: manifest.includeThumbs,
    hasDb,
    hasConfig,
    hasThumbs,
    hasHoldings,
    memberCount: audit.members.length,
    memberListTruncated: listed.truncated,
    locations,
    notes: manifest.notes,
    warnings,
    previewHash,
  };
}

export function restoreLiveStats(): RestoreLiveStats {
  const dbPath = getDbPath();
  let dbBytes = 0;
  try {
    if (existsSync(dbPath) && statSync(dbPath).isFile()) {
      dbBytes = statSync(dbPath).size;
    }
  } catch {
    dbBytes = 0;
  }
  return {
    itemCount: catalogStats().total,
    dbPath,
    dbBytes,
  };
}
