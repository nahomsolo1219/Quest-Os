import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Cheap gate only: no session cookie -> login. Every page and action still checks the real
// session and role on the server (src/server/session.ts + authz).
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    // Use the forwarded public host: behind Railway's proxy request.url is localhost:8080.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const url = new URL("/login", host ? `${proto}://${host}` : request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*", "/kitchen/:path*", "/delivery/:path*", "/app/:path*"],
};
