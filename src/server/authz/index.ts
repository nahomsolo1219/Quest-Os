// Authorization: the permission matrix of PLAN.md section 4 as code. Every service calls this first.
// Pure server code: no next/* imports. `loadActor` is the only function that touches the database.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "../../../db/client";
import { clients, user } from "../../../db/schema";
import { ROLES, type Role } from "../../domain/types";

export type { Role };
export { ROLES };

export type Actor = { userId: string; roles: Role[]; clientId: string | null; name: string };

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to do this.", readonly permission?: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const STAFF_ROLES = ["owner", "operations", "nutritionist", "kitchen", "delivery", "coach"] as const satisfies readonly Role[];

const O = "owner", OP = "operations", N = "nutritionist", K = "kitchen", D = "delivery", C = "coach", CL = "client";
const ALL: readonly Role[] = [O, OP, N, K, D, C, CL];

/**
 * Single source of truth. Each permission lists the roles that hold it.
 * `*Own` permissions only allow rows of the actor's own client record / user; services pair them with
 * `assertClientAccess` or an explicit owner check. Anonymous access is limited to PUBLIC_PERMISSIONS.
 */
export const PERMISSIONS = {
  // settings
  "settings.read": [O, OP, N, K],
  "settings.readPublic": ALL, // public calculator subset (anon too)
  "settings.write": [O],
  "pricing.write": [O],
  "settings.nutrition.write": [O, N],
  "audit.read": [O, OP],
  // areas
  "areas.read": [O, OP, N, K, D, CL],
  "areas.write": [O, OP],
  // clients
  "clients.read": [O, OP, N],
  "clients.write": [O, OP],
  "clients.writeBodyStats": [O, OP, N], // body stats and notes
  "clients.readKitchen": [O, OP, N, K], // name, allergies, dislikes
  "clients.readDeliveryContact": [O, OP, D], // name, phone, address of today's drops
  "clients.readOwn": [CL],
  "clients.writeOwn": [CL], // limited fields: address, landmark, telegram opt-in
  "clients.createLead": [O, OP], // + anon through sign-up
  "clients.resetPassword": [O, OP],
  // consultations, nutrition profiles
  "nutrition.read": [O, OP, N],
  "nutrition.write": [N],
  "nutrition.readOwn": [CL],
  "consultations.write": [N],
  // ingredients and prices
  "ingredients.read": [O, OP, N, K],
  "ingredients.write": [O, OP],
  "ingredients.nutrition.write": [O, OP, N],
  "prices.write": [O, OP],
  // meals, parts, part ingredients
  "menu.read": [O, OP, N, K, CL], // clients: names and macros
  "menu.write": [O, N],
  // profile portions, profile day results
  "portions.read": [O, OP, N, K],
  "portions.readOwn": [CL],
  "portions.write": [N],
  // swap rules, client swaps and add-ons
  "swapRules.read": [O, OP, N, K, CL],
  "swapRules.write": [O, OP, N],
  "swaps.read": [O, OP, N, K],
  "swaps.write": [O, OP, N],
  "swaps.approve": [O, N],
  "swaps.readOwn": [CL],
  "swaps.request": [CL],
  "addons.write": [O, OP, N],
  // packages
  "packages.read": ALL, // also public calculator (anon)
  "packages.write": [O],
  // subscriptions, pauses
  "subscriptions.read": [O, OP, N],
  "subscriptions.write": [O, OP],
  "discounts.apply": [O],
  "pauses.write": [O, OP],
  "subscriptions.readOwn": [CL],
  "pauses.requestOwn": [CL],
  // invoices, payments, account credits
  "invoices.read": [O, OP],
  "invoices.write": [O, OP],
  "payments.confirm": [O, OP],
  "credits.write": [O, OP],
  "invoices.readOwn": [CL],
  "payments.submitOwn": [CL],
  // weekly orders, order days, order meals
  "orders.read": [O, OP, N, K],
  "orders.readToday": [O, OP, N, K, D],
  "orders.lock": [OP],
  "orders.write": [OP],
  "orders.readOwn": [CL],
  "quickStarts.manage": [OP],
  // kitchen sheets, purchases, stock counts, waste
  "kitchen.read": [O, OP, K],
  "stock.read": [O, OP, K],
  "stock.write": [OP, K], // counts and waste
  "purchases.write": [OP],
  // delivery drops
  "delivery.read": [O, OP, K, D],
  "delivery.manage": [OP], // assign riders, reorder, create drops
  "delivery.update": [OP, D], // status; riders only drops assigned to them or unassigned today (canUpdateDrop)
  "delivery.readOwn": [CL],
  // check-ins
  "checkins.read": [O, OP, N],
  "checkins.write": [N],
  "checkins.readOwn": [CL],
  "checkins.writeOwn": [CL], // own weight
  // dashboard, partners
  "dashboard.read": [O],
  "partners.read": [O],
  "partners.write": [O],
  // notifications and telegram links: own rows only, every signed-in user
  "notifications.own": ALL,
  "telegram.own": ALL,
  // job runs
  "jobs.read": [O, OP],
  "jobs.run": [O, OP],
  // community (clients additionally pass communityAccess from the domain)
  "community.read": [O, OP, N, C, CL],
  "community.post": [O, OP, C, CL],
  "community.react": [O, OP, C, CL],
  "community.moderate": [O, OP], // hide, mute, reports
  "community.coach": [C], // announcements, pin, challenges, mark answer
  "community.report": [O, OP, N, C, CL],
  // meal ratings
  "mealRatings.read": [O, OP, N],
  "mealRatings.writeOwn": [CL],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** What a signed-out visitor may do (public calculator and sign-up). */
export const PUBLIC_PERMISSIONS: readonly Permission[] = ["settings.readPublic", "packages.read", "clients.createLead"];

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return PUBLIC_PERMISSIONS.includes(permission);
  const allowed = PERMISSIONS[permission] as readonly Role[];
  return actor.roles.some((r) => allowed.includes(r));
}

export function assertCan(actor: Actor | null | undefined, permission: Permission): asserts actor is Actor {
  if (!actor) throw new ForbiddenError("Please sign in.", permission);
  if (!can(actor, permission)) throw new ForbiddenError(undefined, permission);
}

/** Signed in, any role. */
export function assertSignedIn(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new ForbiddenError("Please sign in.");
}

export function isStaff(actor: Actor | null | undefined): boolean {
  return !!actor && actor.roles.some((r) => (STAFF_ROLES as readonly Role[]).includes(r));
}

export function hasRole(actor: Actor | null | undefined, ...roles: Role[]): boolean {
  return !!actor && actor.roles.some((r) => roles.includes(r));
}

export function isOwnClient(actor: Actor | null | undefined, clientId: string): boolean {
  return !!actor && actor.clientId !== null && actor.clientId === clientId;
}

/** Staff with clients.read pass; a client passes only for their own client record. */
export function assertClientAccess(actor: Actor | null | undefined, clientId: string): asserts actor is Actor {
  if (!actor) throw new ForbiddenError("Please sign in.");
  if (can(actor, "clients.read")) return;
  if (isOwnClient(actor, clientId)) return;
  throw new ForbiddenError("You can only see your own records.");
}
/** Alias used in PLAN.md section 4. */
export const assertOwnClient = assertClientAccess;

/**
 * Staff permission, or the matching own permission for the actor's own client record.
 * Example: assertCanForClient(actor, clientId, "invoices.read", "invoices.readOwn").
 */
export function assertCanForClient(
  actor: Actor | null | undefined,
  clientId: string,
  staffPermission: Permission,
  ownPermission?: Permission,
): asserts actor is Actor {
  if (!actor) throw new ForbiddenError("Please sign in.", staffPermission);
  if (can(actor, staffPermission)) return;
  if (ownPermission && can(actor, ownPermission) && isOwnClient(actor, clientId)) return;
  throw new ForbiddenError(undefined, staffPermission);
}

/** Riders may update drops assigned to them or unassigned, on today's date only; operations any drop. */
export function canUpdateDrop(
  actor: Actor | null | undefined,
  drop: { riderUserId: string | null; dropDate: string },
  today: string,
): boolean {
  if (!actor) return false;
  if (hasRole(actor, "operations")) return true;
  if (!hasRole(actor, "delivery")) return false;
  return drop.dropDate === today && (drop.riderUserId === null || drop.riderUserId === actor.userId);
}

/** Home screen after sign-in. */
export function homePathFor(roles: readonly Role[]): string {
  if (roles.includes("owner")) return "/staff/dashboard";
  if (roles.includes("operations") || roles.includes("nutritionist")) return "/staff";
  if (roles.includes("kitchen")) return "/kitchen";
  if (roles.includes("delivery")) return "/delivery";
  if (roles.includes("client")) return "/app";
  if (roles.includes("coach")) return "/app/community";
  return "/login";
}

/** Loads the actor (roles, name, linked client id) for a user id; null when missing or banned. */
export async function loadActor(db: DbOrTx, userId: string): Promise<Actor | null> {
  const rows = await db
    .select({ id: user.id, name: user.name, roles: user.roles, banned: user.banned, clientId: clients.id })
    .from(user)
    .leftJoin(clients, eq(clients.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row || row.banned) return null;
  return { userId: row.id, name: row.name, roles: [...row.roles] as Role[], clientId: row.clientId ?? null };
}
