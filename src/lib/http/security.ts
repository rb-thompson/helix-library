/**
 * Edge-safe HTTP hardening helpers (middleware + Node routes).
 * Do not import Node built-ins here — middleware runs on the Edge runtime.
 */

const LOOPBACK_IPS = new Set([
  "127.0.0.1",
  "::1",
  "localhost",
  "0:0:0:0:0:0:0:1",
]);

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const UNSAFE_INLINE = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

export const HELIX_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "same-origin"],
  ["X-Frame-Options", "DENY"],
  ["Content-Security-Policy", "frame-ancestors 'none'"],
  ["X-DNS-Prefetch-Control", "off"],
];

/** Connection IP only — never Host, never X-Forwarded-For. */
export function normalizeClientIp(ip: string | null | undefined): string {
  if (!ip) return "";
  return ip.trim().toLowerCase().replace(/^::ffff:/, "");
}

export function isLoopbackIp(ip: string | null | undefined): boolean {
  const n = normalizeClientIp(ip);
  return n.length > 0 && LOOPBACK_IPS.has(n);
}

/**
 * LAN mode must not trust the Host header. Only a real loopback *connection*
 * skips Basic auth. Unknown IP fails closed (require auth).
 */
export function shouldSkipLanAuth(ip: string | null | undefined): boolean {
  return isLoopbackIp(ip);
}

export function isMutatingMethod(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/** Constant-time string compare (Edge-safe; no node:crypto). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const len = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}

export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of HELIX_SECURITY_HEADERS) {
    headers.set(key, value);
  }
}

/**
 * Same-origin check for LAN mutations.
 * Host is only compared to Origin — never used as a loopback proof.
 */
export function originMatchesHost(
  origin: string | null,
  host: string | null,
): boolean {
  if (!origin || !host) return false;
  try {
    const o = new URL(origin);
    const h = new URL(host.includes("://") ? host : `http://${host}`);
    const originPort = o.port || (o.protocol === "https:" ? "443" : "80");
    const hostPort = h.port || "80";
    return (
      o.hostname.toLowerCase() === h.hostname.toLowerCase() &&
      originPort === hostPort
    );
  } catch {
    return false;
  }
}

export function shouldRequireLanOrigin(
  method: string,
  lan: boolean,
  ip: string | null | undefined,
): boolean {
  return lan && isMutatingMethod(method) && !isLoopbackIp(ip);
}

export function unsafeInlineContentType(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return UNSAFE_INLINE.has(type);
}
