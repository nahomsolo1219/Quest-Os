import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Cheap gate only: no session cookie -> login. Every page and action still checks the real
// session and role on the server (src/server/session.ts + authz).
// Hosts that show the pre-launch page at "/". Set COMING_SOON_HOSTS="" on Railway (and redeploy) to switch it off at launch.
const COMING_SOON_HOSTS = (process.env.COMING_SOON_HOSTS ?? "questaddis.com,www.questaddis.com")
  .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

export function middleware(request: NextRequest) {
  // Use the forwarded public host: behind Railway's proxy request.url is localhost:8080.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (request.nextUrl.pathname === "/") {
    const bare = host?.split(":")[0].toLowerCase();
    if (bare && COMING_SOON_HOSTS.includes(bare)) {
      const url = request.nextUrl.clone();
      url.pathname = "/coming-soon";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }
  if (!getSessionCookie(request)) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const url = new URL("/login", host ? `${proto}://${host}` : request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/staff/:path*", "/kitchen/:path*", "/delivery/:path*", "/app/:path*"],
};
