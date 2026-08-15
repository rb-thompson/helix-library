/**
 * One-time restore confirm token.
 * Bound to archive name + previewHash only — not thumbs/roots scope.
 * File lives under exportsRoot() so harness DBs stay sibling-safe.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseBackupArchiveFilename, exportsRoot } from "@/lib/backup/paths";

export const RESTORE_SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_FILE = ".restore-session.json";

export type RestoreSession = {
  token: string;
  name: string;
  previewHash: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

export class RestoreSessionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RestoreSessionError";
    this.status = status;
  }
}

export function restoreSessionPath(): string {
  return path.join(exportsRoot(), SESSION_FILE);
}

function jailedArchiveName(name: string): string {
  try {
    return parseBackupArchiveFilename(name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RestoreSessionError(message, 400);
  }
}

function writeJsonAtomic(dest: string, value: RestoreSession): void {
  const tmp = path.join(
    path.dirname(dest),
    `${path.basename(dest)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(tmp, 0o600);
    renameSync(tmp, dest);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* none */
    }
    throw err;
  }
}

function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseSession(raw: unknown): RestoreSession | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.token !== "string" || !/^[0-9a-f]{64}$/.test(o.token)) {
    return null;
  }
  if (typeof o.name !== "string" || !o.name) return null;
  if (typeof o.previewHash !== "string" || !o.previewHash) return null;
  if (typeof o.createdAt !== "number" || !Number.isFinite(o.createdAt)) {
    return null;
  }
  if (typeof o.expiresAt !== "number" || !Number.isFinite(o.expiresAt)) {
    return null;
  }
  if (
    o.consumedAt !== null &&
    (typeof o.consumedAt !== "number" || !Number.isFinite(o.consumedAt))
  ) {
    return null;
  }
  // Strip unknown keys so thumbs/roots scope cannot hitch a ride.
  return {
    token: o.token,
    name: o.name,
    previewHash: o.previewHash,
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    consumedAt: o.consumedAt === null ? null : o.consumedAt,
  };
}

export function readRestoreSession(): RestoreSession | null {
  const p = restoreSessionPath();
  if (!existsSync(p)) return null;
  try {
    return parseSession(JSON.parse(readFileSync(p, "utf8")) as unknown);
  } catch {
    return null;
  }
}

export function clearRestoreSession(): void {
  const p = restoreSessionPath();
  if (!existsSync(p)) return;
  try {
    unlinkSync(p);
  } catch {
    /* none */
  }
}

export function mintRestoreSession(opts: {
  name: string;
  previewHash: string;
  now?: number;
}): RestoreSession {
  const name = jailedArchiveName(opts.name);
  const previewHash = opts.previewHash.trim();
  if (!previewHash) {
    throw new RestoreSessionError("previewHash is required", 400);
  }
  const now = opts.now ?? Date.now();
  const session: RestoreSession = {
    token: randomBytes(32).toString("hex"),
    name,
    previewHash,
    createdAt: now,
    expiresAt: now + RESTORE_SESSION_TTL_MS,
    consumedAt: null,
  };
  writeJsonAtomic(restoreSessionPath(), session);
  return session;
}

function assertSessionMatch(
  session: RestoreSession | null,
  opts: { token: string; name: string; previewHash: string; now: number },
): RestoreSession {
  if (!session) {
    throw new RestoreSessionError("No restore session", 400);
  }
  if (!tokensEqual(session.token, opts.token)) {
    throw new RestoreSessionError("Restore confirm token mismatch", 400);
  }
  if (session.name !== opts.name) {
    throw new RestoreSessionError("Restore session name mismatch", 400);
  }
  if (session.previewHash !== opts.previewHash) {
    throw new RestoreSessionError("Restore preview hash mismatch", 400);
  }
  // Consumed-before-expiry so a replay after TTL is still 409, not a 400.
  if (session.consumedAt != null) {
    throw new RestoreSessionError("Restore confirm token already used", 409);
  }
  if (opts.now >= session.expiresAt) {
    throw new RestoreSessionError("Restore confirm token expired", 400);
  }
  return session;
}

export function verifyRestoreSession(opts: {
  token: string;
  name: string;
  previewHash: string;
  now?: number;
}): RestoreSession {
  const name = jailedArchiveName(opts.name);
  return assertSessionMatch(readRestoreSession(), {
    token: opts.token,
    name,
    previewHash: opts.previewHash,
    now: opts.now ?? Date.now(),
  });
}

/** Mark the token used via temp+rename. Second consume is 409. */
export function consumeRestoreSession(opts: {
  token: string;
  name: string;
  previewHash: string;
  now?: number;
}): RestoreSession {
  const name = jailedArchiveName(opts.name);
  const now = opts.now ?? Date.now();
  const current = assertSessionMatch(readRestoreSession(), {
    token: opts.token,
    name,
    previewHash: opts.previewHash,
    now,
  });
  const next: RestoreSession = { ...current, consumedAt: now };
  writeJsonAtomic(restoreSessionPath(), next);
  return next;
}
