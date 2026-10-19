// Weekly orders and quick start (module 7): the Thursday lock, the daily 18:00 quick-start lock, and drops.
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  accountCredits, areas, clients, deliveryDrops, invoices, orderDays, orderMeals, pauses, subscriptions, weeklyOrders,
} from "@db/schema";
import type { DbOrTx } from "@db/client";
import { buildOrderDays, lockWeek, type OrderDayDraft } from "@/domain/orders";
import { quickStartAmount } from "@/domain/pricing";
import { dropsFor, mealDatesBetween, nextServiceDay, quickStartPlan, type MealDate } from "@/domain/schedule";
import { addDays, addisDate, addisInstant, weekStartOf } from "@/domain/time";
import { subscriptionEndDate } from "@/domain/subscriptions";
import type { DateStr, DeliveryOption, Profile } from "@/domain/types";
import { loadClientPlanInputs, withDelivery } from "./client-plan";
import { loadMenuData } from "./menu-data";
import { loadSettings } from "./settings";

type Snapshot = { db: DbOrTx; now: Date };

async function insertOrderDays(db: DbOrTx, weeklyOrderId: string, clientId: string, profile: Profile, days: OrderDayDraft[], isQuickStart: boolean) {
  let meals = 0;
  for (const d of days) {
    const [day] = await db.insert(orderDays).values({
      weeklyOrderId, clientId, serviceDate: d.serviceDate, cookDate: d.cookDate, dropDate: d.dropDate, menu: d.menu, isQuickStart,
    }).onConflictDoNothing().returning();
    if (!day) continue; // already ordered (idempotent)
    if (d.meals.length) {
      await db.insert(orderMeals).values(d.meals.map((m) => ({
        orderDayId: day.id, clientId, mealId: m.mealId, slot: m.slot, profile,
        items: m.items.map((it) => ({ ...it, ingredients: it.ingredients.map((x) => ({ ...x, name: "" })) })),
        kcal: m.kcal, proteinG: m.proteinG, carbG: m.carbG, fatG: m.fatG, conflicts: m.conflicts, cookDate: m.cookDate, eatBy: m.eatBy,
      })));
      meals += d.meals.length;
    }
  }
  return meals;
}

async function upsertWeeklyOrder(db: DbOrTx, v: typeof weeklyOrders.$inferInsert) {
  const [row] = await db.insert(weeklyOrders).values(v).onConflictDoNothing().returning();
  if (row) return { row, created: true };
  const [existing] = await db.select().from(weeklyOrders).where(and(eq(weeklyOrders.clientId, v.clientId), eq(weeklyOrders.weekStart, v.weekStart)));
  return { row: existing, created: false };
}

/**
 * The Thursday 18:00 lock for `weekStart` (ORD-01). Idempotent: existing orders and order days are kept.
 * Returns counts for the ops summary.
 */
export async function lockWeekOrders({ db, now }: Snapshot, weekStart: DateStr) {
  const [data, settings] = await Promise.all([loadMenuData(db), loadSettings(db)]);
  const weekEnd = addDays(weekStart, 6);
  const subs = await db.select().from(subscriptions)
    .where(and(inArray(subscriptions.status, ["active", "paused", "pending_payment"]), lte(subscriptions.startDate, weekEnd), gte(subscriptions.endDate, weekStart)));
  const live = subs.filter((s) => !(s.isQuickStart && s.status === "pending_payment"));
  const clientIds = [...new Set(live.map((s) => s.clientId))];
  const [plans, pauseRows, invRows, existingDays] = await Promise.all([
    loadClientPlanInputs(db, clientIds, weekStart),
    clientIds.length ? db.select().from(pauses).where(inArray(pauses.clientId, clientIds)) : [],
    clientIds.length ? db.select().from(invoices).where(and(inArray(invoices.clientId, clientIds), eq(invoices.status, "paid"))) : [],
    clientIds.length ? db.select({ clientId: orderDays.clientId, serviceDate: orderDays.serviceDate }).from(orderDays)
      .where(and(inArray(orderDays.clientId, clientIds), gte(orderDays.serviceDate, weekStart), lte(orderDays.serviceDate, weekEnd))) : [],
  ]);
  const lockClients = live.flatMap((s) => {
    const plan = plans.get(s.clientId);
    if (!plan) return [];
    return [{
      ...withDelivery(plan, s.deliveryOption),
      subscription: { id: s.id, status: s.status, startDate: s.startDate, endDate: s.endDate },
      pauses: pauseRows.filter((p) => p.subscriptionId === s.id),
      paidInvoices: invRows.filter((i) => i.subscriptionId === s.id).map((i) => ({ periodStart: i.periodStart, periodEnd: i.periodEnd, status: i.status })),
      existingServiceDates: existingDays.filter((d) => d.clientId === s.clientId).map((d) => d.serviceDate),
    }];
  });
  const result = lockWeek({ weekStart, clients: lockClients, data,
    settings: { schedule: settings.schedule, pricing: settings.pricing, roundGramsTo: settings.nutrition.roundGramsTo } });

  const summary = { locked: 0, skippedUnpaid: 0, paused: 0, meals: 0, alreadyLocked: 0, skippedNames: [] as string[], pausedNames: [] as string[] };
  for (const o of result.orders) {
    const { row, created } = await upsertWeeklyOrder(db, {
      clientId: o.clientId, subscriptionId: o.subscriptionId, weekStart: o.weekStart, profile: o.profile, status: o.status,
      isQuickStart: false, lockedAt: now, deliveryOption: o.deliveryOption, skipReason: o.skipReason,
      isDemo: subs.find((s) => s.id === o.subscriptionId)?.isDemo ?? false,
    });
    if (!created && row.status !== "locked") { summary.alreadyLocked++; continue; }
    if (!created && o.status !== "locked") { summary.alreadyLocked++; continue; }
    const name = `${plans.get(o.clientId)?.firstName ?? ""} ${plans.get(o.clientId)?.lastName?.[0] ?? ""}.`;
    if (o.status === "locked") {
      const added = await insertOrderDays(db, row.id, o.clientId, o.profile, o.days, false);
      summary.meals += added;
      if (created) summary.locked++; else if (added === 0) summary.alreadyLocked++; else summary.locked++;
    } else if (o.status === "paused") { summary.paused++; summary.pausedNames.push(name); }
    else { summary.skippedUnpaid++; summary.skippedNames.push(name); }
    // client status follows the locked week
    if (created) {
      if (o.status === "paused") await db.update(clients).set({ status: "paused" }).where(and(eq(clients.id, o.clientId), eq(clients.status, "active")));
      if (o.status === "locked") await db.update(clients).set({ status: "active" }).where(and(eq(clients.id, o.clientId), eq(clients.status, "paused")));
    }
  }
  await ensureDrops(db, weekStart, weekEnd);
  return summary;
}

/** Quick-start reservations per start date, for capacity (D018). */
export async function quickStartsTakenByDate(db: DbOrTx, fromDate: DateStr): Promise<Record<DateStr, number>> {
  const rows = await db.select({ d: subscriptions.startDate, n: sql<number>`count(*)::int` }).from(subscriptions)
    .where(and(eq(subscriptions.isQuickStart, true), inArray(subscriptions.status, ["pending_payment", "active", "paused"]), gte(subscriptions.startDate, fromDate)))
    .groupBy(subscriptions.startDate);
  return Object.fromEntries(rows.map((r) => [r.d, r.n]));
}

/**
 * Daily 18:00 quick-start lock (ORD-12): every quick-start subscription starting on the next service day whose
 * quick-start invoice is paid gets its order days now (cooked to order, nothing on spec). Paid clients whose start
 * was missed (confirmed after their lock) move to the next start with room; the price difference becomes a credit (D019).
 * Unpaid quick starts whose start has passed are re-planned to the next possible start with a new amount.
 */
export async function lockQuickStarts({ db, now }: Snapshot) {
  const [data, settings] = await Promise.all([loadMenuData(db), loadSettings(db)]);
  const today = addisDate(now);
  const nextDay = nextServiceDay(today, settings.schedule);
  const summary = { added: 0, shifted: 0, replanned: 0, meals: 0, names: [] as string[] };
  if (!nextDay) return summary;
  const subs = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.isQuickStart, true), inArray(subscriptions.status, ["pending_payment", "active"]), lte(subscriptions.startDate, nextDay)));
  for (const sub of subs) {
    const [qsInv] = await db.select().from(invoices).where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.kind, "quick_start")));
    if (!qsInv) continue;
    const [already] = await db.select({ id: orderDays.id }).from(orderDays).where(eq(orderDays.clientId, sub.clientId)).limit(1);
    if (already) continue;
    let startDate = sub.startDate;
    let periodEnd = sub.quickStartPeriodEnd ?? addDays(weekStartOf(sub.startDate), 6);
    const paid = qsInv.status === "paid";
    if (!paid || startDate < nextDay) {
      // Missed start: paid ones are re-planned as if paid just before this lock (they start on the next service day
      // with room, credit for the difference); unpaid ones are re-planned from now (start after the next lock).
      const taken = await quickStartsTakenByDate(db, nextDay);
      if (taken[startDate]) taken[startDate]--; // don't count this client against its own old date
      const lockInstant = addisInstant(today, settings.schedule.quickStartCutoffTime);
      const planNow = paid ? new Date(Math.min(now.getTime(), lockInstant.getTime() - 1000)) : now;
      const plan = quickStartPlan(planNow, settings.schedule, taken);
      if (!plan) continue;
      const newAmount = quickStartAmount(sub.priceDayBirr, plan.serviceDays, settings.pricing);
      startDate = plan.startDate;
      periodEnd = plan.periodEnd;
      await db.update(subscriptions).set({ startDate, quickStartPeriodEnd: periodEnd, endDate: subscriptionEndDate(startDate, sub.termMonths) })
        .where(eq(subscriptions.id, sub.id));
      if (!paid) {
        await db.update(invoices).set({ periodStart: startDate, periodEnd, serviceDays: plan.serviceDays, amountBirr: newAmount, dueAt: plan.lockAt })
          .where(eq(invoices.id, qsInv.id));
        summary.replanned++;
        continue;
      }
      await db.update(invoices).set({ periodStart: startDate, periodEnd, serviceDays: plan.serviceDays }).where(eq(invoices.id, qsInv.id));
      const diff = qsInv.amountBirr - newAmount;
      if (diff !== 0) await db.insert(accountCredits).values({ clientId: sub.clientId, amountBirr: diff,
        reason: `Quick start moved to ${startDate}: ${plan.serviceDays} service days instead of ${qsInv.serviceDays}` });
      summary.shifted++;
      if (startDate !== nextDay) continue; // pushed further by capacity: the lock before that date adds them
    }
    // paid and starting on the next service day: add the whole quick-start period now
    const plans = await loadClientPlanInputs(db, [sub.clientId], weekStartOf(startDate));
    const plan = plans.get(sub.clientId);
    if (!plan) continue;
    const client = { ...withDelivery(plan, sub.deliveryOption), swapRuleIds: [], addons: [] }; // standard menu, no swaps (quick start step 3)
    const mealDates: MealDate[] = mealDatesBetween(startDate, periodEnd, settings.schedule);
    const days = buildOrderDays(client, mealDates, data, { schedule: settings.schedule, pricing: settings.pricing, roundGramsTo: settings.nutrition.roundGramsTo });
    const byWeek = new Map<DateStr, OrderDayDraft[]>();
    for (const d of days) byWeek.set(weekStartOf(d.serviceDate), [...(byWeek.get(weekStartOf(d.serviceDate)) ?? []), d]);
    for (const [week, wdays] of byWeek) {
      const { row } = await upsertWeeklyOrder(db, { clientId: sub.clientId, subscriptionId: sub.id, weekStart: week, profile: plan.profile,
        status: "locked", isQuickStart: true, lockedAt: now, deliveryOption: sub.deliveryOption, isDemo: sub.isDemo });
      summary.meals += await insertOrderDays(db, row.id, sub.clientId, plan.profile, wdays, true);
    }
    summary.added++;
    summary.names.push(`${plan.firstName} ${plan.lastName[0] ?? ""}.`);
    await ensureDrops(db, startDate, periodEnd);
  }
  return summary;
}

/** Creates delivery / pick-up drops for order days in [from, to] (idempotent; address snapshot at creation). */
export async function ensureDrops(db: DbOrTx, from: DateStr, to: DateStr) {
  const days = await db.select({ day: orderDays, option: weeklyOrders.deliveryOption }).from(orderDays)
    .innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
    .where(and(gte(orderDays.dropDate, from), lte(orderDays.dropDate, to), eq(weeklyOrders.status, "locked")));
  if (days.length === 0) return 0;
  const clientIds = [...new Set(days.map((d) => d.day.clientId))];
  const cs = await db.select({ c: clients, areaSort: areas.sort }).from(clients).leftJoin(areas, eq(areas.id, clients.areaId)).where(inArray(clients.id, clientIds));
  let created = 0;
  for (const clientId of clientIds) {
    const mine = days.filter((d) => d.day.clientId === clientId);
    const option = mine[0].option as DeliveryOption;
    const info = cs.find((x) => x.c.id === clientId)!;
    const plansFor = dropsFor(option, mine.map((d) => ({ serviceDate: d.day.serviceDate, cookDate: d.day.cookDate, dropDate: d.day.dropDate, menu: d.day.menu })));
    for (const p of plansFor) {
      const rows = await db.insert(deliveryDrops).values({
        dropDate: p.dropDate, clientId, slot: p.slot, kind: p.kind, areaId: info.c.areaId,
        addressSnapshot: p.kind === "delivery" ? [info.c.address, info.c.landmark].filter(Boolean).join(" · ") : null,
        phoneSnapshot: info.c.phone, routePosition: (info.areaSort ?? 99) * 1000, serviceDates: p.serviceDates, status: "pending",
      }).onConflictDoNothing().returning({ id: deliveryDrops.id });
      created += rows.length;
    }
  }
  return created;
}

/** Order review for a week (ORD-05): status per client, with conflicts. */
export async function weekOrderRows(db: DbOrTx, weekStart: DateStr) {
  const orders = await db.select({ o: weeklyOrders, c: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName } })
    .from(weeklyOrders).innerJoin(clients, eq(clients.id, weeklyOrders.clientId)).where(eq(weeklyOrders.weekStart, weekStart)).orderBy(asc(clients.firstName));
  const conflicts = orders.length ? await db.select({ clientId: orderMeals.clientId, conflicts: orderMeals.conflicts }).from(orderMeals)
    .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
    .where(and(inArray(orderDays.weeklyOrderId, orders.map((x) => x.o.id)), ne(sql`cardinality(${orderMeals.conflicts})`, 0))) : [];
  return orders.map(({ o, c }) => ({ ...o, client: c, conflicts: [...new Set(conflicts.filter((x) => x.clientId === c.id).flatMap((x) => x.conflicts))] }));
}
