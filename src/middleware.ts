import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  applySecurityHeaders,
  originMatchesHost,
  shouldRequireLanOrigin,
  timingSafeStringEqual,
} from "@/lib/http/security";

/**
 * When NON_OS_LAN=1 (home-network preview), require HTTP Basic Auth.
 * Username is fixed as "library"; password from NON_OS_ACCESS_PASSWORD.
 * Loopback-only mode (default) leaves auth off.
 *
 * Never treat the Host header as proof of loopback — that is spoofable
 * when bound to 0.0.0.0. Edge middleware has no trustworthy client IP,
 * so LAN mode authenticates every request (including localhost).
 */
function withSecurity(res: NextResponse): NextResponse {
  applySecurityHeaders(res.headers);
  return res;
}

function lanModeOn(): boolean {
  return (
    process.env.NON_OS_LAN === "1" ||
    process.env.NON_OS_LAN === "true" ||
    process.env.NON_OS_ALLOW_LAN === "1"
  );
}

export function middleware(req: NextRequest) {
  const lan = lanModeOn();

  if (!lan) {
    return withSecurity(NextResponse.next());
  }

  // LAN mode always authenticates. Do not skip on Host: 127.0.0.1 —
  // that header is spoofable when bound to 0.0.0.0. Edge middleware
  // has no trustworthy connection IP.

  const password = process.env.NON_OS_ACCESS_PASSWORD;
  if (!password) {
    return withSecurity(
      new NextResponse(
        "LAN mode is on but NON_OS_ACCESS_PASSWORD is not set. Refusing to serve.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      ),
    );
  }

  if (shouldRequireLanOrigin(req.method, true, null)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (!originMatchesHost(origin, host)) {
      return withSecurity(
        new NextResponse("LAN mutations require a same-origin browser request.", {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      );
    }
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const colon = decoded.indexOf(":");
      const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
      const pass = colon >= 0 ? decoded.slice(colon + 1) : "";
      if (timingSafeStringEqual(user, "library") && timingSafeStringEqual(pass, password)) {
        return withSecurity(NextResponse.next());
      }
    } catch {
      // fall through to challenge
    }
  }

  return withSecurity(
    new NextResponse("Authentication required for Helix Library LAN preview.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Helix Library", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    }),
  );
}

export const config = {
  matcher: [
    /*
     * Protect all routes except Next internals and common static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
