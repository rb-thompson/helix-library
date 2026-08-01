import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * When NON_OS_LAN=1 (home-network preview), require HTTP Basic Auth.
 * Username is fixed as "library"; password from NON_OS_ACCESS_PASSWORD.
 * Loopback-only mode (default) leaves auth off.
 */
export function middleware(req: NextRequest) {
  const lan =
    process.env.NON_OS_LAN === "1" ||
    process.env.NON_OS_LAN === "true" ||
    process.env.NON_OS_ALLOW_LAN === "1";

  if (!lan) {
    return NextResponse.next();
  }

  const password = process.env.NON_OS_ACCESS_PASSWORD;
  if (!password) {
    return new NextResponse(
      "LAN mode is on but NON_OS_ACCESS_PASSWORD is not set. Refusing to serve.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const colon = decoded.indexOf(":");
      const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
      const pass = colon >= 0 ? decoded.slice(colon + 1) : "";
      if (user === "library" && pass === password) {
        return NextResponse.next();
      }
    } catch {
      // fall through to challenge
    }
  }

  return new NextResponse("Authentication required for non-os LAN preview.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="non-os library", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export const config = {
  matcher: [
    /*
     * Protect all routes except Next internals and common static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
