import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@db/client";
import { auth } from "@/server/auth";
import { homePathFor, loadActor, type Actor, type Role } from "@/server/authz";
import { now } from "@/server/clock";

/** The signed-in actor for this request, or null. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadActor(db, session.user.id);
});

/** For pages: redirect to login when signed out, or to the user's home when the role does not fit. */
export async function requirePageActor(...roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (roles.length > 0 && !roles.some((r) => actor.roles.includes(r))) redirect(homePathFor(actor.roles));
  return actor;
}

/** Service context for server actions and pages. */
export async function serviceCtx(actor: Actor | null) {
  return { db, actor, now: now() };
}
