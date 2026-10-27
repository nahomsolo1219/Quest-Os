// Delivery and pick-up (module 10): drop list by area in route order, route reordering, rider assignment,
// delivered / failed (with reason), and the cafe pick-up list.
import { and, arrayContains, eq, inArray, like } from "drizzle-orm";
import { areas, clients, deliveryDrops, notifications, orderDays, orderMeals, user } from "@db/schema";
import { assertCan, can, canUpdateDrop, ForbiddenError, hasRole } from "@/server/authz";
import { groupDropsByArea, type AreaGroup } from "@/domain/delivery";
import { addisDate, formatDate, isDateStr } from "@/domain/time";
import type { DateStr, DropStatus } from "@/domain/types";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { notify, userIdsWithRoles } from "./notifications";

export const FAILED_REASONS = ["Not home", "Wrong address", "Refused", "Other"] as const;

export type DropView = {
  id: string;
  dropDate: DateStr;
  kind: "delivery" | "pickup";
  slot: string | null;
  clientId: string;
  firstName: string;
  lastName: string;
  /** null when the viewer may not see contact details (kitchen) */
  phone: string | null;
  address: string | null;
  areaId: string | null;
  areaName: string | null;
  areaSort: number | null;
  routePosition: number;
  serviceDates: DateStr[];
  mealsCount: number;
  riderUserId: string | null;
  riderName: string | null;
  status: DropStatus;
  failedReason: string | null;
  deliveredAt: Date | null;
};

/** Riders (delivery role, not operations/owner) are limited to today's delivery drops assigned to them or unassigned. */
function isRiderOnly(ctx: Ctx) {
  return hasRole(ctx.actor, "delivery") && !hasRole(ctx.actor, "owner", "operations");
}

const SLOT_MEALS: Record<string, string[]> = { breakfast: ["breakfast"], lunch: ["lunch"], dinner_snack: ["dinner", "snack"] };

async function loadDrops(ctx: Ctx, date: DateStr, kind?: "delivery" | "pickup"): Promise<DropView[]> {
  const rider = user;
  const rows = await ctx.db
    .select({
      d: deliveryDrops, firstName: clients.firstName, lastName: clients.lastName, areaName: areas.name, areaSort: areas.sort, riderName: rider.name,
    })
    .from(deliveryDrops)
    .innerJoin(clients, eq(clients.id, deliveryDrops.clientId))
    .leftJoin(areas, eq(areas.id, deliveryDrops.areaId))
    .leftJoin(rider, eq(rider.id, deliveryDrops.riderUserId))
    .where(and(eq(deliveryDrops.dropDate, date), kind ? eq(deliveryDrops.kind, kind) : undefined));
  const clientIds = [...new Set(rows.map((r) => r.d.clientId))];
  const mealRows = clientIds.length
    ? await ctx.db.select({ clientId: orderMeals.clientId, serviceDate: orderDays.serviceDate, slot: orderMeals.slot })
      .from(orderMeals).innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
      .where(and(inArray(orderMeals.clientId, clientIds), eq(orderDays.dropDate, date)))
    : [];
  const contact = can(ctx.actor, "clients.readDeliveryContact");
  return rows.map(({ d, firstName, lastName, areaName, areaSort, riderName }) => ({
    id: d.id, dropDate: d.dropDate, kind: d.kind as "delivery" | "pickup", slot: d.slot, clientId: d.clientId, firstName, lastName,
    phone: contact ? d.phoneSnapshot : null, address: contact ? d.addressSnapshot : null,
    areaId: d.areaId, areaName: areaName ?? null, areaSort: areaSort ?? null, routePosition: d.routePosition, serviceDates: d.serviceDates,
    mealsCount: mealRows.filter((m) => m.clientId === d.clientId && d.serviceDates.includes(m.serviceDate)
      && (d.slot == null || (SLOT_MEALS[d.slot] ?? []).includes(m.slot))).length,
    riderUserId: d.riderUserId, riderName: riderName ?? null, status: d.status, failedReason: d.failedReason, deliveredAt: d.deliveredAt,
  }));
}

function counts(drops: DropView[]) {
  return {
    total: drops.length,
    delivered: drops.filter((d) => d.status === "delivered").length,
    failed: drops.filter((d) => d.status === "failed").length,
    pending: drops.filter((d) => d.status === "pending").length,
  };
}

/**
 * Drops of a date grouped by area in route order (DEL-01). Ops / owners / kitchen see every drop (kitchen without
 * phone and address); riders see only today's delivery drops assigned to them or unassigned.
 */
export async function dropsForDate(ctx: Ctx, date: DateStr): Promise<{ date: DateStr; groups: AreaGroup<DropView>[]; counts: ReturnType<typeof counts> }> {
  assertCan(ctx.actor, "delivery.read");
  if (!isDateStr(date)) throw new ServiceError("Pick a valid date.");
  let drops: DropView[];
  if (isRiderOnly(ctx)) {
    if (date !== addisDate(ctx.now)) throw new ForbiddenError("Riders can only see today's drops.");
    drops = (await loadDrops(ctx, date, "delivery")).filter((d) => d.riderUserId === null || d.riderUserId === ctx.actor!.userId);
  } else {
    drops = await loadDrops(ctx, date, "delivery");
  }
  return { date, groups: groupDropsByArea(drops), counts: counts(drops) };
}

/** Pick-up list for the cafe counter (DEL-05). */
export async function pickupList(ctx: Ctx, date: DateStr) {
  assertCan(ctx.actor, "delivery.read");
  if (!isDateStr(date)) throw new ServiceError("Pick a valid date.");
  if (isRiderOnly(ctx) && date !== addisDate(ctx.now)) throw new ForbiddenError("Riders can only see today's pick-ups.");
  const drops = (await loadDrops(ctx, date, "pickup")).sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
  return { date, drops, counts: counts(drops) };
}

/** Riders for the assign select. */
export async function riders(ctx: Ctx) {
  assertCan(ctx.actor, "delivery.manage");
  return ctx.db.select({ id: user.id, name: user.name }).from(user)
    .where(and(arrayContains(user.roles, ["delivery"]), eq(user.banned, false))).orderBy(user.name);
}

/**
 * Saves a new route order (DEL-02). `orderedIds` may be all of the date's delivery drops or one area's drops:
 * the given drops take the places of those drops in the current order, and the whole day is renumbered 1..n.
 */
export async function reorderDrops(ctx: Ctx, date: DateStr, orderedIds: string[]) {
  assertCan(ctx.actor, "delivery.manage");
  if (!isDateStr(date)) throw new ServiceError("Pick a valid date.");
  if (new Set(orderedIds).size !== orderedIds.length) throw new ServiceError("The new order lists a drop twice.");
  const all = await loadDrops(ctx, date, "delivery");
  const current = groupDropsByArea(all).flatMap((g) => g.drops);
  const moving = new Set(orderedIds);
  if (orderedIds.some((id) => !current.some((d) => d.id === id))) throw new ServiceError("Some drops are not on this date's list. Reload and try again.");
  const queue = [...orderedIds];
  const next = current.map((d) => (moving.has(d.id) ? queue.shift()! : d.id));
  for (const [i, id] of next.entries()) {
    await ctx.db.update(deliveryDrops).set({ routePosition: i + 1, updatedAt: ctx.now }).where(eq(deliveryDrops.id, id));
  }
  return { updated: next.length };
}

/** Assigns (or unassigns with null) a rider to drops. */
export async function assignRider(ctx: Ctx, dropIds: string[], riderUserId: string | null) {
  assertCan(ctx.actor, "delivery.manage");
  if (dropIds.length === 0) throw new ServiceError("Pick at least one drop.");
  if (riderUserId) {
    const [r] = await ctx.db.select({ roles: user.roles, banned: user.banned }).from(user).where(eq(user.id, riderUserId));
    if (!r || r.banned || !r.roles.includes("delivery")) throw new ServiceError("That person is not a rider.");
  }
  const rows = await ctx.db.update(deliveryDrops).set({ riderUserId, updatedAt: ctx.now })
    .where(and(inArray(deliveryDrops.id, dropIds), eq(deliveryDrops.kind, "delivery"))).returning({ id: deliveryDrops.id });
  if (rows.length === 0) throw new ServiceError("No delivery drops were found to assign.");
  return { updated: rows.length };
}

async function loadDropForUpdate(ctx: Ctx, dropId: string) {
  assertCan(ctx.actor, "delivery.update");
  const [drop] = await ctx.db.select().from(deliveryDrops).where(eq(deliveryDrops.id, dropId));
  if (!drop) throw new ServiceError("That drop does not exist.", "not_found");
  if (!canUpdateDrop(ctx.actor, drop, addisDate(ctx.now))) {
    throw new ForbiddenError(drop.dropDate !== addisDate(ctx.now) ? "You can only update today's drops." : "This drop is assigned to another rider.");
  }
  return drop;
}

/** Delivered (or handed over at the counter for pick-ups). A rider taking an unassigned drop becomes its rider. */
export async function markDelivered(ctx: Ctx, dropId: string) {
  const drop = await loadDropForUpdate(ctx, dropId);
  const [row] = await ctx.db.update(deliveryDrops).set({
    status: "delivered", deliveredAt: ctx.now, failedReason: null, updatedAt: ctx.now,
    ...(drop.kind === "delivery" && drop.riderUserId == null && hasRole(ctx.actor, "delivery") && !hasRole(ctx.actor, "operations") ? { riderUserId: actorUserId(ctx.actor) } : {}),
  }).where(eq(deliveryDrops.id, dropId)).returning();
  return row;
}

/** Failed needs a reason (DEL-04); operations are notified. */
export async function markFailed(ctx: Ctx, dropId: string, reason: string) {
  const text = (reason ?? "").trim();
  if (!text) throw new ServiceError("Pick or write a reason the drop failed.");
  if (text.length > 300) throw new ServiceError("Keep the reason under 300 characters.");
  const drop = await loadDropForUpdate(ctx, dropId);
  const [row] = await ctx.db.update(deliveryDrops).set({
    status: "failed", failedReason: text, deliveredAt: null, updatedAt: ctx.now,
    ...(drop.riderUserId == null && hasRole(ctx.actor, "delivery") && !hasRole(ctx.actor, "operations") ? { riderUserId: actorUserId(ctx.actor) } : {}),
  }).where(eq(deliveryDrops.id, dropId)).returning();
  const [c] = await ctx.db.select({ firstName: clients.firstName, lastName: clients.lastName }).from(clients).where(eq(clients.id, drop.clientId));
  const ops = await userIdsWithRoles(ctx.db, ["operations"]);
  await notify(ctx.db, {
    userIds: ops, kind: "delivery.failed", title: `Drop failed: ${c ? `${c.firstName} ${c.lastName}` : "client"}`,
    body: `${formatDate(drop.dropDate)} · ${text}`, link: `/staff/delivery?date=${drop.dropDate}`,
    dedupeKey: `drop-failed:${drop.id}:${ctx.now.getTime()}`,
  });
  return row;
}

/** How long after marking a drop the same status can be undone (the UI offers ~8 s; this allows for slow networks). */
export const UNDO_WINDOW_MS = 2 * 60 * 1000;

/** When the drop was last marked failed: the instant in the ops notification's dedupe key (no failed-at column). */
async function failedAt(ctx: Ctx, dropId: string): Promise<Date | null> {
  const rows = await ctx.db.select({ key: notifications.dedupeKey }).from(notifications)
    .where(like(notifications.dedupeKey, `drop-failed:${dropId}:%`));
  const times = rows.map((r) => Number(r.key?.split(":")[2])).filter((n) => Number.isFinite(n));
  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * Undo a just-made "Delivered", "Handed over" or "Failed": the drop goes back to pending.
 * - `expected` is the status the toast was about; if the drop changed since, nothing is undone.
 * - Same access as marking it (today's drops; riders only their own or unassigned), and only within
 *   UNDO_WINDOW_MS of that status change (deliveredAt, or the failed notification), not of any later
 *   edit such as a route reorder, so older history cannot be rewritten.
 * - `release`: the mark made a rider take an unassigned drop; undo gives it back (riders only, their own drop).
 */
export async function undoDropStatus(ctx: Ctx, dropId: string, expected: "delivered" | "failed", release = false) {
  const drop = await loadDropForUpdate(ctx, dropId);
  if (drop.status !== expected) throw new ServiceError("This drop changed since, so there is nothing to undo.");
  const markedAt = expected === "delivered" ? drop.deliveredAt : await failedAt(ctx, dropId);
  if (!markedAt || ctx.now.getTime() - markedAt.getTime() > UNDO_WINDOW_MS) {
    throw new ServiceError("Too late to undo. Mark the drop again with the right status.");
  }
  const releaseRider = release && drop.kind === "delivery" && hasRole(ctx.actor, "delivery") && !hasRole(ctx.actor, "operations")
    && drop.riderUserId === actorUserId(ctx.actor);
  const [row] = await ctx.db.update(deliveryDrops)
    .set({ status: "pending", failedReason: null, deliveredAt: null, updatedAt: ctx.now, ...(releaseRider ? { riderUserId: null } : {}) })
    .where(and(eq(deliveryDrops.id, dropId), eq(deliveryDrops.status, expected))).returning();
  if (!row) throw new ServiceError("This drop changed since, so there is nothing to undo.");
  if (expected === "failed") {
    const [c] = await ctx.db.select({ firstName: clients.firstName, lastName: clients.lastName }).from(clients).where(eq(clients.id, drop.clientId));
    const ops = await userIdsWithRoles(ctx.db, ["operations"]);
    await notify(ctx.db, {
      userIds: ops, kind: "delivery.failed", title: `Drop no longer failed: ${c ? `${c.firstName} ${c.lastName}` : "client"}`,
      body: `${formatDate(drop.dropDate)} · the rider undid "failed"; the drop is pending again.`, link: `/staff/delivery?date=${drop.dropDate}`,
      dedupeKey: `drop-undo:${drop.id}:${ctx.now.getTime()}`,
    });
  }
  return row;
}
