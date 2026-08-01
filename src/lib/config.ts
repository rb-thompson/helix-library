import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const locationSchema = z.object({
  name: z.string().min(1),
  root: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

const configSchema = z.object({
  bind: z.string().default("127.0.0.1"),
  port: z.number().int().positive().default(4747),
  dbPath: z.string().default("./data/library.db"),
  locations: z.array(locationSchema).default([]),
  ignore: z.array(z.string()).default([
    "**/node_modules/**",
    "**/.git/**",
    "**/target/**",
    "**/.cache/**",
    "**/.next/**",
    "**/dist/**",
  ]),
  maxFileBytes: z.number().int().positive().default(2 * 1024 * 1024 * 1024),
  hashFullUnderBytes: z.number().int().positive().default(64 * 1024 * 1024),
});

export type LibraryConfig = z.infer<typeof configSchema>;
export type ConfigLocation = z.infer<typeof locationSchema>;

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

/** Explicit opt-in for binding beyond loopback (home LAN preview). */
export function lanModeEnabled(): boolean {
  const v = process.env.NON_OS_LAN ?? process.env.NON_OS_ALLOW_LAN;
  return v === "1" || v === "true";
}

export function isLoopbackBind(bind: string): boolean {
  return LOOPBACK.has(bind);
}

let cached: LibraryConfig | null = null;

export function projectRoot(): string {
  return process.cwd();
}

export function resolveConfigPath(): string {
  const candidates = [
    process.env.NON_OS_CONFIG,
    path.join(projectRoot(), "library.config.json"),
    path.join(projectRoot(), "library.config.example.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No library config found. Copy library.config.example.json to library.config.json",
  );
}

/** Prefer project-relative paths in the on-disk config file. */
export function toConfigPath(absOrRel: string): string {
  const abs = path.isAbsolute(absOrRel)
    ? absOrRel
    : path.resolve(projectRoot(), absOrRel);
  const rel = path.relative(projectRoot(), abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join("/") || ".";
  }
  return abs;
}

export function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(projectRoot(), p);
}

export function loadConfig(force = false): LibraryConfig {
  if (cached && !force) return cached;

  const configPath = resolveConfigPath();
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  const parsed = configSchema.parse(raw);

  // Env overrides for LAN preview (Next bind host is separate CLI flag)
  if (process.env.NON_OS_BIND) {
    parsed.bind = process.env.NON_OS_BIND;
  }
  if (process.env.NON_OS_PORT) {
    const p = Number(process.env.NON_OS_PORT);
    if (Number.isFinite(p) && p > 0) parsed.port = p;
  }

  assertSafeBind(parsed.bind);

  const root = projectRoot();
  parsed.dbPath = path.isAbsolute(parsed.dbPath)
    ? parsed.dbPath
    : path.resolve(root, parsed.dbPath);

  parsed.locations = parsed.locations.map((loc) => ({
    ...loc,
    root: path.isAbsolute(loc.root) ? loc.root : path.resolve(root, loc.root),
  }));

  cached = parsed;
  return parsed;
}

export function clearConfigCache(): void {
  cached = null;
}

/**
 * Rewrite library.config.json locations from the given list.
 * Other keys (bind, ignore, etc.) are preserved from the current file.
 */
export function saveLocationsToConfig(
  locs: Array<{ name: string; rootPath: string; enabled: boolean }>,
): void {
  const configPath = resolveConfigPath();
  // Prefer writable library.config.json, not the example fallback
  const writePath =
    configPath.endsWith("library.config.example.json") &&
    !process.env.NON_OS_CONFIG
      ? path.join(projectRoot(), "library.config.json")
      : configPath;

  let raw: Record<string, unknown> = {};
  if (existsSync(writePath)) {
    raw = JSON.parse(readFileSync(writePath, "utf8")) as Record<
      string,
      unknown
    >;
  } else if (existsSync(configPath)) {
    raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<
      string,
      unknown
    >;
  }

  raw.locations = locs.map((l) => ({
    name: l.name,
    root: toConfigPath(l.rootPath),
    enabled: l.enabled,
  }));

  writeFileSync(writePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  clearConfigCache();
}

/** @deprecated use assertSafeBind */
export function assertLoopbackBind(bind: string): void {
  assertSafeBind(bind);
}

/**
 * Default: loopback only.
 * LAN: NON_OS_LAN=1 allows 0.0.0.0 / private addresses (middleware requires password).
 */
export function assertSafeBind(bind: string): void {
  if (isLoopbackBind(bind)) return;

  if (!lanModeEnabled()) {
    throw new Error(
      `Refusing to bind to "${bind}". Default is localhost-only. For home-network preview set NON_OS_LAN=1 and NON_OS_ACCESS_PASSWORD, and use npm run dev:lan.`,
    );
  }

  // Allow all-interfaces and typical private LAN hosts
  if (
    bind === "0.0.0.0" ||
    bind === "::" ||
    /^10\.\d+\.\d+\.\d+$/.test(bind) ||
    /^192\.168\.\d+\.\d+$/.test(bind) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(bind)
  ) {
    if (!process.env.NON_OS_ACCESS_PASSWORD) {
      throw new Error(
        `LAN bind "${bind}" requires NON_OS_ACCESS_PASSWORD (shared guest password).`,
      );
    }
    return;
  }

  throw new Error(
    `Refusing to bind to "${bind}". Use 0.0.0.0 or a private LAN address with NON_OS_LAN=1.`,
  );
}

export function getDbPath(): string {
  return loadConfig().dbPath;
}
