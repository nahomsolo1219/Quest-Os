// Weekly orders and quick start (module 7): the Thursday lock, the daily 18:00 quick-start lock, and drops.
import { and, asc, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  accountCredits, areas, auditLog, clients, deliveryDrops, invoices, orderDays, orderMeals, pauses, payments, subscriptions, weeklyOrders,
} from "@db/schema";
import type { DbOrTx } from "@db/client";
import { buildOrderDays, lockWeek, type OrderDayDraft } from "@/domain/orders";
import { quickStartAmount } from "@/domain/pricing";
import { dropsFor, mealDatesBetween, nextServiceDay, quickStartPlan, serviceDaysBetween, weekLockedAt, weeklyCutoff, type MealDate } from "@/domain/schedule";
import { isPausedWeek } from "@/domain/subscriptions";
import { addDays, addisDate, addisInstant, daysBetween, weekStartOf } from "@/domain/time";
import { subscriptionEndDate } from "@/domain/subscriptions";
import type { DateStr, DeliveryOption, Profile } from "@/domain/types";
import { loadClientPlanInputs, withDelivery } from "./client-plan";
import { loadMenuData } from "./menu-data";
import { loadSettings } from "./settings";
import { generateInvoicesForSubscription, takeDaysOffInvoice, voidInvoice } from "./billing";

type Snapshot = { db: DbOrTx; now: Date };

async function insertOrderDays(db: DbOrTx, weeklyOrderId: string, clientId: string, profile: Profile, days: OrderDayDraft[], isQuickStart: boolean, kitchenNotes: string[] = [], deliveryOption: DeliveryOption | null = null) {
  let meals = 0;
  for (const d of days) {
    const [day] = await db.insert(orderDays).values({
      weeklyOrderId, clientId, serviceDate: d.serviceDate, cookDate: d.cookDate, dropDate: d.dropDate, menu: d.menu, isQuickStart, deliveryOption,
    }).onConflictDoNothing().returning();
    if (!day) continue; // already ordered (idempotent)
    if (d.meals.length) {
      await db.insert(orderMeals).values(d.meals.map((m) => ({
        orderDayId: day.id, clientId, mealId: m.mealId, slot: m.slot, profile,
        items: m.items.map((it) => ({ ...it, ingredients: it.ingredients.map((x) => ({ ...x, name: "" })) })),
        kcal: m.kcal, proteinG: m.proteinG, carbG: m.carbG, fatG: m.fatG, conflicts: [...m.conflicts, ...kitchenNotes], cookDate: m.cookDate, eatBy: m.eatBy,
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
    loadClientPlanInputs(db, clientIds, weekStart, weeklyCutoff(weekStart, settings.schedule)),
    clientIds.length ? db.select().from(pauses).where(inArray(pauses.clientId, clientIds)) : [],
    paidInvoicesBy(db, clientIds, weeklyCutoff(weekStart, settings.schedule)),
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
  for (let o of result.orders) {
    // One transaction per client: the order, its days and any invoice reduction land together, so a run that stops
    // partway is redone cleanly by the next run (job idempotency, money integrity).
    await db.transaction(async (tx) => {
      // lock the plan and re-read its pauses: a pause committed after the reads above (a tap at 17:59:59) wins over
      // cooking the week, and a pause arriving after this point is refused because the week now has an order
      await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, o.subscriptionId)).for("update");
      const freshPauses = await tx.select().from(pauses).where(eq(pauses.subscriptionId, o.subscriptionId));
      if (o.status !== "paused" && isPausedWeek(freshPauses.map((p) => ({ startWeek: p.startWeek, weeks: p.weeks })), weekStart)) {
        o = { ...o, status: "paused", days: [], skipReason: null };
      }
      const { row, created } = await upsertWeeklyOrder(tx, {
        clientId: o.clientId, subscriptionId: o.subscriptionId, weekStart: o.weekStart, profile: o.profile, status: o.status,
        isQuickStart: false, lockedAt: now, deliveryOption: o.deliveryOption, skipReason: o.skipReason,
        isDemo: subs.find((s) => s.id === o.subscriptionId)?.isDemo ?? false,
      });
      if (!created && (row.status !== "locked" || o.status !== "locked")) { summary.alreadyLocked++; return; }
      const name = `${plans.get(o.clientId)?.firstName ?? ""} ${plans.get(o.clientId)?.lastName?.[0] ?? ""}.`;
      if (o.status === "locked") {
        const added = await insertOrderDays(tx, row.id, o.clientId, o.profile, o.days, false, plans.get(o.clientId)?.kitchenNotes ?? [], o.deliveryOption);
        summary.meals += added;
        if (created || added > 0) summary.locked++; else summary.alreadyLocked++;
      } else if (o.status === "paused") { summary.paused++; summary.pausedNames.push(name); }
      else { summary.skippedUnpaid++; summary.skippedNames.push(name); }
      if (!created || o.status === "paused") return;
      // Not paid by the cutoff = not cooked (rule 1): every service day of this week that the plan covers but the lock
      // did not cook — the whole week when skipped, or the unpaid part of a week at a billing boundary — comes off the
      // invoice that billed it, so the client is never asked to pay for food that will not be made.
      const sub = subs.find((x) => x.id === o.subscriptionId)!;
      const cooked = new Set([...o.days.map((d) => d.serviceDate), ...existingDays.filter((d) => d.clientId === o.clientId).map((d) => d.serviceDate)]);
      const from = sub.startDate > weekStart ? sub.startDate : weekStart;
      const to = sub.endDate < weekEnd ? sub.endDate : weekEnd;
      const uncooked = serviceDaysBetween(from, to, settings.schedule).filter((d) => !cooked.has(d));
      if (uncooked.length === 0) return;
      const billed = await tx.select().from(invoices).where(and(eq(invoices.subscriptionId, sub.id), ne(invoices.status, "void"),
        lte(invoices.periodStart, weekEnd), gte(invoices.periodEnd, weekStart))).for("update");
      for (const inv of billed) {
        const days = uncooked.filter((d) => d >= inv.periodStart && d <= inv.periodEnd).length;
        await takeDaysOffInvoice(tx, inv, days, "days not cooked (unpaid at the cutoff)");
      }
    });
    // client status follows the locked week
    if (o.status === "paused") await db.update(clients).set({ status: "paused" }).where(and(eq(clients.id, o.clientId), eq(clients.status, "active")));
    if (o.status === "locked") await db.update(clients).set({ status: "active" }).where(and(eq(clients.id, o.clientId), eq(clients.status, "paused")));
  }
  await ensureDrops(db, weekStart, weekEnd, weeklyCutoff(weekStart, settings.schedule));
  return summary;
}

/**
 * Invoices that count as paid at `instant` (business rule 1: pay before cooking): status paid AND fully covered by
 * payments confirmed at or before the instant (an invoice paid entirely by credit counts from its creation).
 * So a late confirmation never sneaks a client into a lock that already ran, and re-running a lock gives the same result.
 */
export async function paidInvoicesBy(db: DbOrTx, clientIds: string[], instant: Date) {
  if (clientIds.length === 0) return [];
  const rows = await db.select().from(invoices).where(and(inArray(invoices.clientId, clientIds), eq(invoices.status, "paid")));
  if (rows.length === 0) return [];
  const paidSums = await db.select({ invoiceId: payments.invoiceId, n: sql<number>`coalesce(sum(${payments.amountBirr}), 0)::int` })
    .from(payments)
    .where(and(inArray(payments.invoiceId, rows.map((r) => r.id)), eq(payments.status, "confirmed"), lte(payments.confirmedAt, instant)))
    .groupBy(payments.invoiceId);
  return rows.filter((r) => r.amountBirr === 0 ? r.createdAt <= instant : (paidSums.find((p) => p.invoiceId === r.id)?.n ?? 0) >= r.amountBirr);
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
  const summary = { added: 0, shifted: 0, replanned: 0, expired: 0, meals: 0, names: [] as string[] };
  if (!nextDay) return summary;
  // the lock instant this run stands for (today 18:00 Addis); payment status is judged at this instant
  const lockInstant = addisInstant(today, settings.schedule.quickStartCutoffTime);
  const asOf = new Date(Math.min(now.getTime(), lockInstant.getTime()));
  const subs = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.isQuickStart, true), inArray(subscriptions.status, ["pending_payment", "active"]), lte(subscriptions.startDate, nextDay)));
  for (const sub of subs) {
    const [qsInv] = await db.select().from(invoices).where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.kind, "quick_start")));
    if (!qsInv || qsInv.status === "void") continue;
    // Already added for THIS plan by an earlier run. The weekly lock may have created the following week's days
    // first when both run at Thursday 18:00 — those are not quick-start days and their dates are kept.
    const [already] = await db.select({ id: orderDays.id }).from(orderDays)
      .where(and(eq(orderDays.clientId, sub.clientId), eq(orderDays.isQuickStart, true),
        gte(orderDays.serviceDate, sub.startDate), lte(orderDays.serviceDate, sub.quickStartPeriodEnd ?? addDays(weekStartOf(sub.startDate), 6)))).limit(1);
    if (already) continue;
    const paid = (await paidInvoicesBy(db, [sub.clientId], asOf)).some((i) => i.id === qsInv.id);
    let startDate = sub.startDate;
    let periodEnd = sub.quickStartPeriodEnd ?? addDays(weekStartOf(sub.startDate), 6);
    if (!paid && startDate >= nextDay) continue; // not paid by tonight's lock: not cooked; handled once the start passes
    if (!paid) {
      const [waiting] = await db.select({ id: payments.id }).from(payments)
        .where(and(eq(payments.invoiceId, qsInv.id), inArray(payments.status, ["submitted", "confirmed"]))).limit(1);
      if (waiting) continue; // a receipt is waiting (or confirmed after the lock): keep the amount; shift on the next run
      if (now.getTime() - sub.createdAt.getTime() > QUICK_START_EXPIRY_MS) {
        // abandoned sign-up: release the capacity it holds (D032) — re-checked under the locks, so a receipt that
        // arrived meanwhile is never voided
        const expired = await db.transaction(async (tx) => {
          await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, sub.id)).for("update");
          const [inv] = await tx.select().from(invoices).where(eq(invoices.id, qsInv.id)).for("update");
          const [anyReceipt] = await tx.select({ id: payments.id }).from(payments)
            .where(and(eq(payments.invoiceId, qsInv.id), inArray(payments.status, ["submitted", "confirmed"]))).limit(1);
          if (!inv || inv.status !== "issued" || anyReceipt) return false;
          await tx.update(subscriptions).set({ status: "cancelled" }).where(and(eq(subscriptions.id, sub.id), eq(subscriptions.status, "pending_payment")));
          await voidInvoice(tx, qsInv.id, "quick start not paid");
          return true;
        });
        if (expired) summary.expired++;
        continue;
      }
    }
    if (startDate < nextDay) {
      // Missed start. Paid ones are re-planned as if paid just before this lock (next service day with room, credit
      // for the difference); unpaid ones are re-planned from now (start after the next lock, new amount).
      const taken = await quickStartsTakenByDate(db, nextDay);
      if (taken[startDate]) taken[startDate]--; // don't count this client against its own old date
      const plan = quickStartPlan(paid ? new Date(lockInstant.getTime() - 1000) : now, settings.schedule, taken);
      if (!plan) continue;
      const priceDay = (sub.priceBreakdown as { priceDay?: number } | null)?.priceDay ?? sub.priceDayBirr;
      let newAmount = quickStartAmount(priceDay, plan.serviceDays, settings.pricing);
      // Every write below happens under the plan row lock, on fresh rows (a pause, renewal or payment may have
      // committed since the reads above).
      const outcome = await db.transaction(async (tx) => {
        const [fresh] = await tx.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).for("update");
        const [freshInv] = await tx.select().from(invoices).where(eq(invoices.id, qsInv.id)).for("update");
        if (!fresh || !freshInv || freshInv.status === "void" || (freshInv.status === "paid") !== paid) return "retry" as const;
        if (!paid) {
          const [waiting] = await tx.select({ id: payments.id }).from(payments)
            .where(and(eq(payments.invoiceId, qsInv.id), inArray(payments.status, ["submitted", "confirmed"]))).limit(1);
          if (waiting) return "retry" as const;
        }
        // The moved period bills only days that will be cooked: it stops before any week the Thursday lock has already
        // decided for this plan, and paused weeks are not billed (rules 1 and 6).
        const decided = await tx.select({ weekStart: weeklyOrders.weekStart }).from(weeklyOrders)
          .where(and(eq(weeklyOrders.subscriptionId, sub.id), eq(weeklyOrders.isQuickStart, false)));
        const qsPauses = (await tx.select().from(pauses).where(eq(pauses.subscriptionId, sub.id))).map((x) => ({ startWeek: x.startWeek, weeks: x.weeks }));
        let end = plan.periodEnd;
        for (const d of decided) if (d.weekStart >= weekStartOf(plan.startDate) && d.weekStart <= end) end = addDays(d.weekStart, -1);
        if (end < plan.startDate) return "retry" as const;
        const billable = serviceDaysBetween(plan.startDate, end, settings.schedule).filter((d) => !isPausedWeek(qsPauses, weekStartOf(d))).length;
        plan.periodEnd = end;
        plan.serviceDays = billable;
        newAmount = quickStartAmount(priceDay, billable, settings.pricing);
        // keep any extension the plan already had (paused weeks move the end date, rule 6)
        const extension = daysBetween(subscriptionEndDate(fresh.startDate, fresh.termMonths), fresh.endDate);
        await tx.update(subscriptions).set({ startDate: plan.startDate, quickStartPeriodEnd: plan.periodEnd,
          endDate: addDays(subscriptionEndDate(plan.startDate, fresh.termMonths), extension) }).where(eq(subscriptions.id, sub.id));
        // regular invoices made for dates the quick-start period now covers are cancelled (paid ones become credit)
        const later = await tx.select().from(invoices).where(and(eq(invoices.subscriptionId, sub.id), ne(invoices.kind, "quick_start"), ne(invoices.status, "void"))).for("update");
        for (const inv of later) {
          if (inv.periodStart > plan.periodEnd) continue;
          const voided = await voidInvoice(tx, inv.id, "covered by the moved quick start");
          if (voided && inv.status === "paid" && inv.amountBirr > 0) await tx.insert(accountCredits).values({ clientId: sub.clientId, amountBirr: inv.amountBirr, reason: `Paid invoice ${inv.periodStart} covered by the moved quick start` });
        }
        if (!paid) {
          await tx.update(invoices).set({ periodStart: plan.startDate, periodEnd: plan.periodEnd, serviceDays: plan.serviceDays, amountBirr: newAmount, dueAt: plan.lockAt })
            .where(eq(invoices.id, qsInv.id));
        } else {
          await tx.update(invoices).set({ periodStart: plan.startDate, periodEnd: plan.periodEnd, serviceDays: plan.serviceDays }).where(eq(invoices.id, qsInv.id));
          const diff = freshInv.amountBirr - newAmount;
          if (diff !== 0) await tx.insert(accountCredits).values({ clientId: sub.clientId, amountBirr: diff,
            reason: `Quick start moved to ${plan.startDate}: ${plan.serviceDays} service days instead of ${freshInv.serviceDays}` });
        }
        await generateInvoicesForSubscription(tx, sub.id, weekLockedAt(now, settings.schedule));
        return "done" as const;
      });
      if (outcome === "retry") continue; // something changed meanwhile: the next run decides on fresh data
      startDate = plan.startDate;
      periodEnd = plan.periodEnd;
      if (!paid) { summary.replanned++; continue; }
      summary.shifted++;
      if (startDate !== nextDay) continue; // pushed further by capacity: the lock before that date adds them
    }
    // paid and starting on the next service day: add the whole quick-start period now, serialised on the plan row
    // with pausePlan (a pause that committed first is honoured; one arriving later sees the orders and is refused)
    const plans = await loadClientPlanInputs(db, [sub.clientId], weekStartOf(startDate));
    const plan = plans.get(sub.clientId);
    if (!plan) continue;
    const client = { ...withDelivery(plan, sub.deliveryOption), swapRuleIds: [], addons: [] }; // standard menu, no swaps (quick start step 3)
    const qsStart = startDate, qsEnd = periodEnd;
    await db.transaction(async (tx) => {
      await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, sub.id)).for("update");
      const qsPauses = (await tx.select().from(pauses).where(eq(pauses.subscriptionId, sub.id))).map((p) => ({ startWeek: p.startWeek, weeks: p.weeks }));
      // weeks the Thursday lock already decided (locked, skipped or paused) are its, not the quick start's
      const decidedWeeks = new Set((await tx.select({ w: weeklyOrders.weekStart }).from(weeklyOrders)
        .where(and(eq(weeklyOrders.subscriptionId, sub.id), eq(weeklyOrders.isQuickStart, false)))).map((r) => r.w));
      const mealDates: MealDate[] = mealDatesBetween(qsStart, qsEnd, settings.schedule)
        .filter((md) => !isPausedWeek(qsPauses, weekStartOf(md.serviceDate)) && !decidedWeeks.has(weekStartOf(md.serviceDate)));
      const days = buildOrderDays(client, mealDates, data, { schedule: settings.schedule, pricing: settings.pricing, roundGramsTo: settings.nutrition.roundGramsTo });
      const byWeek = new Map<DateStr, OrderDayDraft[]>();
      for (const d of days) byWeek.set(weekStartOf(d.serviceDate), [...(byWeek.get(weekStartOf(d.serviceDate)) ?? []), d]);
      for (const [week, wdays] of byWeek) {
        let { row } = await upsertWeeklyOrder(tx, { clientId: sub.clientId, subscriptionId: sub.id, weekStart: week, profile: plan.profile,
          status: "locked", isQuickStart: true, lockedAt: now, deliveryOption: sub.deliveryOption, isDemo: sub.isDemo });
        // a returning client: the week's row may belong to their previous plan (weekly orders are one per client and
        // week). If that plan left it skipped or paused, the new quick start takes the row so its paid days are cooked.
        if (row.status !== "locked") {
          [row] = await tx.update(weeklyOrders).set({ status: "locked", isQuickStart: true, subscriptionId: sub.id, skipReason: null, lockedAt: now,
            deliveryOption: sub.deliveryOption, profile: plan.profile }).where(eq(weeklyOrders.id, row.id)).returning();
        }
        summary.meals += await insertOrderDays(tx, row.id, sub.clientId, plan.profile, wdays, true, [], sub.deliveryOption);
      }
    });
    summary.added++;
    summary.names.push(`${plan.firstName} ${plan.lastName[0] ?? ""}.`);
    await ensureDrops(db, startDate, periodEnd);
  }
  return summary;
}

/** Unpaid quick-start sign-ups with no receipt are cancelled after this long, releasing their capacity. */
const QUICK_START_EXPIRY_MS = 72 * 60 * 60 * 1000;

/** Creates delivery / pick-up drops for order days in [from, to] (idempotent; address snapshot at creation). */
export async function ensureDrops(db: DbOrTx, from: DateStr, to: DateStr, addressAsOf?: Date) {
  const days = await db.select({ day: orderDays, option: sql<DeliveryOption>`coalesce(${orderDays.deliveryOption}, ${weeklyOrders.deliveryOption})` }).from(orderDays)
    .innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
    .where(and(gte(orderDays.dropDate, from), lte(orderDays.dropDate, to), eq(weeklyOrders.status, "locked")));
  if (days.length === 0) return 0;
  const clientIds = [...new Set(days.map((d) => d.day.clientId))];
  const cs = await db.select({ c: clients, areaSort: areas.sort }).from(clients).leftJoin(areas, eq(areas.id, clients.areaId)).where(inArray(clients.id, clientIds));
  // Address changes made after the cutoff start the week after (business rule 2): take the address in force then.
  const later = addressAsOf
    ? await db.select().from(auditLog).where(and(eq(auditLog.entity, "clients"), inArray(auditLog.entityId, clientIds),
        gt(auditLog.createdAt, addressAsOf))).orderBy(asc(auditLog.createdAt))
    : [];
  let created = 0;
  // drops are planned per client AND delivery option: each day carries the option of the plan that ordered it
  const groups = new Map<string, typeof days>();
  for (const d of days) groups.set(`${d.day.clientId}|${d.option}`, [...(groups.get(`${d.day.clientId}|${d.option}`) ?? []), d]);
  for (const mine of groups.values()) {
    const clientId = mine[0].day.clientId;
    const option = mine[0].option as DeliveryOption;
    const found = cs.find((x) => x.c.id === clientId)!;
    const info = { ...found, c: { ...found.c } };
    for (const field of ["address", "landmark", "areaId"] as const) {
      const first = later.find((a) => a.entityId === clientId && a.before && typeof a.before === "object" && field in (a.before as object));
      if (first) (info.c as Record<string, unknown>)[field] = (first.before as Record<string, unknown>)[field];
    }
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
