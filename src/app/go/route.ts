import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/session";
import { homePathFor } from "@/server/authz";

// After sign-in: send each person to the home screen for their roles.
export async function GET(request: NextRequest) {
  const actor = await getActor();
  const target = actor ? homePathFor(actor.roles) : "/login";
  // Behind Railway's proxy request.url is the container's own address (localhost:8080), so build the
  // redirect from the forwarded public host instead.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : request.url;
  return NextResponse.redirect(new URL(target, base));
}
