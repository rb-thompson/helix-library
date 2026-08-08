/**
 * Shared SSRF-safe outbound fetch for Acquire (OpenAlex PDF, web clip, Grok image URL).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type SafeOutboundOpts = {
  /** Default true for PDF + image URL; false allows http for clip */
  httpsOnly?: boolean;
  /** Max redirects to follow with re-validation (default 5) */
  maxRedirects?: number;
};

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "metadata.google",
]);

function isPrivateOrReservedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    // IPv4-mapped
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice("::ffff:".length);
      if (isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true;
}

/**
 * Throws if scheme/host/IP is unsafe for server-side fetch.
 */
export function assertSafeOutboundUrl(
  urlRaw: string,
  opts?: SafeOutboundOpts,
): URL {
  const httpsOnly = opts?.httpsOnly !== false;
  let url: URL;
  try {
    url = new URL(urlRaw.trim());
  } catch {
    throw new Error("Invalid URL");
  }

  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme === "file" || scheme === "data" || scheme === "javascript") {
    throw new Error(`Blocked URL scheme: ${scheme}`);
  }
  if (scheme !== "http" && scheme !== "https") {
    throw new Error(`Unsupported URL scheme: ${scheme}`);
  }
  if (httpsOnly && scheme !== "https") {
    throw new Error("Only https URLs are allowed for this download");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new Error("URL missing hostname");
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error(`Blocked hostname: ${host}`);
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Blocked hostname: ${host}`);
  }

  // Literal IP in hostname
  if (isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error(`Blocked private or reserved IP: ${host}`);
    }
  }

  return url;
}

/**
 * Resolve DNS and reject if any address is private/reserved.
 * Call before fetch; re-call after each redirect target.
 */
export async function assertSafeOutboundResolved(
  url: URL,
  opts?: SafeOutboundOpts,
): Promise<void> {
  assertSafeOutboundUrl(url.href, opts);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }
  if (!addrs.length) throw new Error(`Could not resolve host: ${host}`);
  for (const a of addrs) {
    if (isPrivateOrReservedIp(a.address)) {
      throw new Error(
        `Host resolves to blocked address (${a.address}); refusing fetch`,
      );
    }
  }
}

export type FetchSafeOutboundResult = {
  res: Response;
  finalUrl: string;
  buf: Buffer;
};

/**
 * fetch with manual redirect loop: re-validate each Location; stream with maxBytes.
 */
export async function fetchSafeOutbound(
  urlRaw: string,
  opts: SafeOutboundOpts & {
    timeoutMs: number;
    maxBytes: number;
    headers?: Record<string, string>;
    onProgress?: (received: number, total: number | null) => void;
  },
): Promise<FetchSafeOutboundResult> {
  const httpsOnly = opts.httpsOnly !== false;
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = assertSafeOutboundUrl(urlRaw, { httpsOnly });
  await assertSafeOutboundResolved(current, { httpsOnly });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          ...opts.headers,
        },
      });

      // Redirect
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`Redirect ${res.status} without Location`);
        const next = new URL(loc, current);
        assertSafeOutboundUrl(next.href, { httpsOnly });
        await assertSafeOutboundResolved(next, { httpsOnly });
        current = next;
        // Drain body
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        continue;
      }

      if (!res.ok) {
        const snippet = await res.text().catch(() => "");
        throw new Error(
          `Outbound fetch failed (${res.status}): ${snippet.slice(0, 200) || res.statusText}`,
        );
      }

      const totalHeader = Number(res.headers.get("content-length") || 0);
      const total =
        Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
      if (total != null && total > opts.maxBytes) {
        throw new Error(
          `Remote file too large (${total} bytes; max ${opts.maxBytes})`,
        );
      }

      const reader = res.body?.getReader();
      const chunks: Buffer[] = [];
      let received = 0;

      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.length;
            if (received > opts.maxBytes) {
              try {
                reader.cancel();
              } catch {
                /* ignore */
              }
              throw new Error(
                `Download exceeded max size (${opts.maxBytes} bytes)`,
              );
            }
            chunks.push(Buffer.from(value));
            opts.onProgress?.(received, total);
          }
        }
      } else {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > opts.maxBytes) {
          throw new Error(
            `Download exceeded max size (${opts.maxBytes} bytes)`,
          );
        }
        chunks.push(Buffer.from(ab));
        received = ab.byteLength;
        opts.onProgress?.(received, total);
      }

      const buf = Buffer.concat(chunks);
      return { res, finalUrl: current.href, buf };
    }

    throw new Error(`Too many redirects (max ${maxRedirects})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Detect common image magic; returns ext or null. */
export function sniffImageExt(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}
