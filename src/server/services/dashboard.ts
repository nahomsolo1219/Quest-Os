// Owners' dashboard (module 13): loads inputs and calls the domain KPI functions (DSH-01…06).
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { checkins, clients, deliveryDrops, invoices, mealRatings, meals, orderDays, orderMeals, payments, purchases, subscriptions } from "@db/schema";
import { assertCan } from "@/server/authz";
import { clientsNeedingAttention, dashboardKpis, mealRatingAverages, type AttentionReason } from "@/domain/kpis";
import { addDays, addisDate, monthEndOf, monthStartOf, weekStartOf } from "@/domain/time";
import type { Ctx } from "./context";
import { loadSettings } from "./settings";

export async function ownerDashboard(ctx: Ctx) {
  assertCan(ctx.actor, "dashboard.read");
  const today = addisDate(ctx.now);
  const ms = monthStartOf(today);
  const me = monthEndOf(today);
  const settings = await loadSettings(ctx.db);
  const weekStart = weekStartOf(today);
  const ratingSince = addDays(today, -27);

  const [clientRows, subRows, invoiceRows, paymentRows, purchaseRows, dropRows, ratingRows, mealRows, conflictRows, lastRows] = await Promise.all([
    ctx.db.select({ id: clients.id, status: clients.status, endedAt: clients.endedAt, firstName: clients.firstName, lastName: clients.lastName }).from(clients),
    ctx.db.select().from(subscriptions),
    ctx.db.select({ clientId: invoices.clientId, amountBirr: invoices.amountBirr, status: invoices.status, createdAt: invoices.createdAt, dueAt: invoices.dueAt }).from(invoices),
    ctx.db.select({ amountBirr: payments.amountBirr, status: payments.status, confirmedAt: payments.confirmedAt }).from(payments).where(eq(payments.status, "confirmed")),
    ctx.db.select({ totalPriceBirr: purchases.totalPriceBirr, purchasedOn: purchases.purchasedOn }).from(purchases).where(and(gte(purchases.purchasedOn, ms), lte(purchases.purchasedOn, me))),
    ctx.db.select({ dropDate: deliveryDrops.dropDate, status: deliveryDrops.status, kind: deliveryDrops.kind, deliveredAt: deliveryDrops.deliveredAt })
      .from(deliveryDrops).where(and(gte(deliveryDrops.dropDate, ms), lte(deliveryDrops.dropDate, me))),
    ctx.db.select({ mealId: mealRatings.mealId, serviceDate: mealRatings.serviceDate, rating: mealRatings.rating }).from(mealRatings)
      .where(and(gte(mealRatings.serviceDate, ratingSince), lte(mealRatings.serviceDate, today))),
    ctx.db.select({ id: meals.id, name: meals.name, menu: meals.menu, slot: meals.slot }).from(meals).orderBy(asc(meals.sort)),
    ctx.db.select({ clientId: orderMeals.clientId, conflicts: orderMeals.conflicts }).from(orderMeals)
      .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
      .where(and(gte(orderDays.serviceDate, weekStart), lte(orderDays.serviceDate, addDays(weekStart, 13)), sql`exists (select 1 from unnest(${orderMeals.conflicts}) c where c not like 'Kitchen note:%')`)),
    ctx.db.select({ clientId: checkins.clientId, last: sql<string>`max(${checkins.checkinDate})::text` }).from(checkins).groupBy(checkins.clientId),
  ]);

  const kpis = dashboardKpis({
    month: today, today,
    clients: clientRows.map((c) => ({ id: c.id, status: c.status, endedAt: c.endedAt })),
    subscriptions: subRows.map((s) => ({ clientId: s.clientId, status: s.status, startDate: s.startDate, planPriceBirr: s.planPriceBirr,
      discountMonthBirr: s.discountMonthBirr, isQuickStart: s.isQuickStart })),
    invoices: invoiceRows.map((i) => ({ amountBirr: i.amountBirr, status: i.status, issuedOn: addisDate(i.createdAt) })),
    payments: paymentRows.map((p) => ({ amountBirr: p.amountBirr, status: p.status, confirmedOn: p.confirmedAt ? addisDate(p.confirmedAt) : null })),
    purchases: purchaseRows,
    drops: dropRows.map((d) => ({ ...d, kind: d.kind as "delivery" | "pickup" })),
    pricing: settings.pricing,
    schedule: settings.schedule,
  });

  const ratings = mealRatingAverages(ratingRows, today).map((r) => ({ ...r, meal: mealRows.find((m) => m.id === r.mealId) ?? null }));

  const active = clientRows.filter((c) => c.status === "active");
  const activeSince = new Map<string, string>();
  for (const s of subRows) {
    if (s.status === "cancelled") continue;
    const prev = activeSince.get(s.clientId);
    if (!prev || s.startDate < prev) activeSince.set(s.clientId, s.startDate);
  }
  const attention = clientsNeedingAttention({
    now: ctx.now, today,
    clients: active.map((c) => ({ clientId: c.id, activeSince: activeSince.get(c.id) ?? today })),
    invoices: invoiceRows.map((i) => ({ clientId: i.clientId, status: i.status, dueAt: i.dueAt })),
    currentOrderConflicts: conflictRows,
    lastCheckins: Object.fromEntries(lastRows.map((r) => [r.clientId, r.last])),
  }).map((a) => {
    const c = clientRows.find((x) => x.id === a.clientId)!;
    return { ...a, firstName: c.firstName, lastName: c.lastName };
  });

  return { today, monthStart: ms, kpis, ratings, attention, deliveryDeadlineTime: settings.schedule.deliveryDeadlineTime };
}

export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  unpaid: "Unpaid past due",
  allergy_conflict: "Allergy or dislike conflict",
  no_checkin_2w: "No check-in for 2 weeks",
};

