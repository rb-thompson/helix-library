/**
 * Restore HTTP caller gate (KD11).
 * Host is a hint only — parse with URL so `[::1]:4747` works.
 * Do not trust X-Forwarded-For. CLI does not go through this.
 */

import { lanModeEnabled, loadConfig } from "@/lib/config";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export class RestoreHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RestoreHttpError";
    this.status = status;
  }
}

export function parseHostHeader(
  hostHeader: string | null,
): { hostname: string; port: string } {
  const raw = (hostHeader ?? "").trim();
  if (!raw) {
    throw new RestoreHttpError(
      "Restore is only allowed from this machine (localhost).",
      403,
    );
  }
  try {
    // Do not split(":")[0] — Host: [::1]:4747 would become "[".
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const hostname = u.hostname.toLowerCase();
    if (!hostname) {
      throw new RestoreHttpError(
        "Restore is only allowed from this machine (localhost).",
        403,
      );
    }
    return { hostname, port: u.port };
  } catch (err) {
    if (err instanceof RestoreHttpError) throw err;
    throw new RestoreHttpError(
      "Restore is only allowed from this machine (localhost).",
      403,
    );
  }
}

export function assertRestoreHttpCaller(req: Request): void {
  if (lanModeEnabled() && process.env.NON_OS_RESTORE_OK !== "1") {
    throw new RestoreHttpError(
      "Restore HTTP is disabled while LAN preview is on. Unset NON_OS_LAN or set NON_OS_RESTORE_OK=1 on the host (not a request header).",
      403,
    );
  }

  const { hostname, port } = parseHostHeader(req.headers.get("host"));
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new RestoreHttpError(
      "Restore is only allowed from this machine (localhost).",
      403,
    );
  }

  const origin = req.headers.get("origin");
  if (origin) {
    let u: URL;
    try {
      u = new URL(origin);
    } catch {
      throw new RestoreHttpError("Invalid Origin", 403);
    }
    const expectPort = String(loadConfig().port);
    const originPort = u.port || (u.protocol === "https:" ? "443" : "80");
    if (
      !LOOPBACK_HOSTS.has(u.hostname.toLowerCase()) ||
      originPort !== expectPort
    ) {
      throw new RestoreHttpError("Restore refused (origin).", 403);
    }
  }

  // Intentionally ignore X-Forwarded-For — Helix has no trusted-proxy model.
  void req.headers.get("x-forwarded-for");
  void port;
}

export function restoreErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function restoreErrorStatus(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number" && s >= 400 && s < 600) return s;
  }
  const message = restoreErrorMessage(err);
  if (/not found/i.test(message)) return 404;
  return 400;
}

export function restoreHttpFailure(err: unknown): {
  body: { ok: false; error: string };
  status: number;
} {
  return {
    body: { ok: false, error: restoreErrorMessage(err) },
    status: restoreErrorStatus(err),
  };
}
