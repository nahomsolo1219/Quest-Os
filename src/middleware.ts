import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Cheap gate only: no session cookie -> login. Every page and action still checks the real
// session and role on the server (src/server/session.ts + authz).
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*", "/kitchen/:path*", "/delivery/:path*", "/app/:path*"],
};
