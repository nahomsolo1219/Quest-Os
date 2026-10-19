import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/session";
import { homePathFor } from "@/server/authz";

// After sign-in: send each person to the home screen for their roles.
export async function GET(request: NextRequest) {
  const actor = await getActor();
  const target = actor ? homePathFor(actor.roles) : "/login";
  return NextResponse.redirect(new URL(target, request.url));
}
