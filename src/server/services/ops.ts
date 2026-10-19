// Operations screens: today's queues, weekly order review (preview before the lock, rows after), quick-start
// queue, "lock now", onboarding quotes and cash at the counter. Reuses the lead's loaders and the domain lock.
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { clients, invoices, jobRuns, nutritionProfiles, orderDays, packages, pauses, payments, subscriptions, weeklyOrders } from "@db/schema";
import type { Db } from "@db/client";
import { assertCan, can } from "@/server/authz";
import { lockWeek } from "@/domain/orders";
import { profileOf } from "@/domain/nutrition";
import { nextLockableWeek, weekLockedAt, weeklyCutoff } from "@/domain/schedule";
import { addDays, addisDate, weekStartOf } from "@/domain/time";
import type { DateStr, DeliveryOption, OrderStatus } from "@/domain/types";
import { runJob } from "@/server/jobs";
import { confirmPayment, submitPayment } from "./billing";
import { loadClientPlanInputs, withDelivery } from "./client-plan";
import { ServiceError, type Ctx } from "./context";
import { loadMenuData } from "./menu-data";
import { paidInvoicesBy, quickStartsTakenByDate, weekOrderRows } from "./orders";
import { quotePrice } from "./pricing";
import { loadSettings } from "./settings";

/** A week counts as locked once the Thursday lock ran for it (job_runs) or regular orders exist for it. */
async function isWeekLocked(db: Ctx["db"], weekStart: DateStr) {
  const [run] = await db.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.job, "thursday-lock"), eq(jobRuns.runKey, weekStart))).limit(1);
  if (run) return true;
  const [o] = await db.select({ id: weeklyOrders.id }).from(weeklyOrders)
    .where(and(eq(weeklyOrders.weekStart, weekStart), eq(weeklyOrders.isQuickStart, false))).limit(1);
  return Boolean(o);
}

// ---------------------------------------------------------------------------------------------
// Today

export async function todaySummary(ctx: Ctx) {
  assertCan(ctx.actor, "clients.read");
  const settings = await loadSettings(ctx.db);
  const today = addisDate(ctx.now);
  const nextWeek = nextLockableWeek(ctx.now, settings.schedule);
  const cutoff = weeklyCutoff(nextWeek, settings.schedule);
  const lockedWeek = weekLockedAt(ctx.now, settings.schedule);
  const lockedWeekDone = await isWeekLocked(ctx.db, lockedWeek);
  const canMoney = can(ctx.actor, "payments.confirm");

  const [receipts, qsPending, provisional, leads, overdue] = await Promise.all([
    canMoney ? ctx.db.select({ id: payments.id }).from(payments).where(eq(payments.status, "submitted")) : [],
    ctx.db.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.isQuickStart, true), eq(subscriptions.status, "pending_payment"))),
    ctx.db.select({ clientId: nutritionProfiles.clientId, setAt: nutritionProfiles.setAt, firstName: clients.firstName, lastName: clients.lastName })
      .from(nutritionProfiles).innerJoin(clients, eq(clients.id, nutritionProfiles.clientId))
      .where(and(eq(nutritionProfiles.isCurrent, true), eq(nutritionProfiles.provisional, true))).orderBy(asc(nutritionProfiles.setAt)),
    ctx.db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, createdAt: clients.createdAt }).from(clients)
      .where(eq(clients.status, "lead")).orderBy(desc(clients.createdAt)),
    canMoney ? ctx.db.select({ clientId: invoices.clientId, firstName: clients.firstName, lastName: clients.lastName, amountBirr: invoices.amountBirr, dueAt: invoices.dueAt })
      .from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(eq(invoices.status, "issued"), lte(invoices.dueAt, ctx.now))).orderBy(asc(invoices.dueAt)) : [],
  ]);
  const unpaidNext = canMoney ? await ctx.db.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.status, "issued"), lte(invoices.periodStart, addDays(nextWeek, 6)), gte(invoices.periodEnd, nextWeek))) : [];

  type Attention = { clientId: string; name: string; reason: string; tone: "bad" | "warn" };
  const attention: Attention[] = [];
  const confirmBy = settings.schedule.quickStartConfirmHours * 3600_000;
  for (const p of provisional) {
    const late = ctx.now.getTime() - p.setAt.getTime() > confirmBy;
    attention.push({ clientId: p.clientId, name: `${p.firstName} ${p.lastName}`, reason: late ? "Provisional size older than 48 h: nutritionist to confirm" : "Provisional size: nutritionist to confirm", tone: late ? "bad" : "warn" });
  }
  for (const o of overdue) attention.push({ clientId: o.clientId, name: `${o.firstName} ${o.lastName}`, reason: "Invoice overdue", tone: "bad" });
  for (const l of leads.slice(0, 10)) attention.push({ clientId: l.id, name: `${l.firstName} ${l.lastName}`, reason: "Lead: book a consult and onboard", tone: "warn" });

  return {
    today,
    nextWeek,
    cutoff,
    lockedWeek,
    lockedWeekDone,
    lockDue: !lockedWeekDone && ctx.now.getTime() >= weeklyCutoff(lockedWeek, settings.schedule).getTime(),
    counts: {
      receipts: receipts.length,
      quickStartsPending: qsPending.length,
      provisional: provisional.length,
      leads: leads.length,
      overdue: overdue.length,
      unpaidNextWeek: unpaidNext.length,
    },
    attention,
    canMoney,
  };
}

// ---------------------------------------------------------------------------------------------
// Weekly order review

export type PreviewRow = {
  clientId: string;
  name: string;
  status: OrderStatus;
  profile: string;
  deliveryOption: DeliveryOption;
  days: number;
  reason: string | null;
  conflicts: string[];
};

/**
 * What the Thursday lock would do for weekStart if it ran now, without saving (ORD-05). Same inputs and domain
 * function as lockWeekOrders (payments confirmed by the cutoff), so the preview matches the lock.
 */
export async function previewWeek(ctx: Ctx, weekStart: DateStr): Promise<PreviewRow[]> {
  assertCan(ctx.actor, "orders.read");
  const week = weekStartOf(weekStart);
  const weekEnd = addDays(week, 6);
  const [data, settings] = await Promise.all([loadMenuData(ctx.db), loadSettings(ctx.db)]);
  const subs = await ctx.db.select().from(subscriptions)
    .where(and(inArray(subscriptions.status, ["active", "paused", "pending_payment"]), lte(subscriptions.startDate, weekEnd), gte(subscriptions.endDate, week)));
  const live = subs.filter((s) => !(s.isQuickStart && s.status === "pending_payment"));
  const ids = [...new Set(live.map((s) => s.clientId))];
  if (ids.length === 0) return [];
  const [plans, pauseRows, invRows, existingDays] = await Promise.all([
    loadClientPlanInputs(ctx.db, ids, week),
    ctx.db.select().from(pauses).where(inArray(pauses.clientId, ids)),
    // same rule as the lock (D033): only payments confirmed at or before the cutoff count
    paidInvoicesBy(ctx.db, ids, weeklyCutoff(week, settings.schedule)),
    ctx.db.select({ clientId: orderDays.clientId, serviceDate: orderDays.serviceDate }).from(orderDays)
      .where(and(inArray(orderDays.clientId, ids), gte(orderDays.serviceDate, week), lte(orderDays.serviceDate, weekEnd))),
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
  const res = lockWeek({ weekStart: week, clients: lockClients, data,
    settings: { schedule: settings.schedule, pricing: settings.pricing, roundGramsTo: settings.nutrition.roundGramsTo } });
  const ORDER: Record<OrderStatus, number> = { skipped_unpaid: 0, paused: 1, locked: 2 };
  return res.orders.map((o) => {
    const p = plans.get(o.clientId)!;
    return {
      clientId: o.clientId,
      name: `${p.firstName} ${p.lastName}`,
      status: o.status,
      profile: o.profile,
      deliveryOption: o.deliveryOption,
      days: o.days.length,
      reason: o.skipReason,
      conflicts: [...new Set(o.days.flatMap((d) => d.meals.flatMap((m) => m.conflicts)))],
    };
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
}

/** The order review page: preview before the lock, saved rows after. */
export async function weekReview(ctx: Ctx, weekStart: DateStr) {
  assertCan(ctx.actor, "orders.read");
  const week = weekStartOf(weekStart);
  const settings = await loadSettings(ctx.db);
  const cutoff = weeklyCutoff(week, settings.schedule);
  const locked = await isWeekLocked(ctx.db, week);
  const cutoffPassed = ctx.now.getTime() >= cutoff.getTime();
  const canLock = can(ctx.actor, "orders.lock") && !locked && cutoffPassed && week === weekLockedAt(ctx.now, settings.schedule);
  if (locked) {
    const rows = await weekOrderRows(ctx.db, week);
    const dayCounts = rows.length ? await ctx.db.select({ weeklyOrderId: orderDays.weeklyOrderId }).from(orderDays)
      .where(inArray(orderDays.weeklyOrderId, rows.map((r) => r.id))) : [];
    return {
      week, cutoff, locked, cutoffPassed, canLock,
      rows: rows.map((r): PreviewRow & { lockedAt: Date; isQuickStart: boolean } => ({
        clientId: r.clientId, name: `${r.client.firstName} ${r.client.lastName}`, status: r.status, profile: r.profile,
        deliveryOption: r.deliveryOption, days: dayCounts.filter((d) => d.weeklyOrderId === r.id).length, reason: r.skipReason,
        conflicts: r.conflicts, lockedAt: r.lockedAt, isQuickStart: r.isQuickStart,
      })),
    };
  }
  const rows = await previewWeek(ctx, week);
  return { week, cutoff, locked, cutoffPassed, canLock, rows: rows.map((r) => ({ ...r, lockedAt: null as Date | null, isQuickStart: false })) };
}

/** Operations run the Thursday lock by hand when the cutoff has passed and the job has not run (cron missed). */
export async function lockWeekNow(ctx: Ctx, weekStart: DateStr) {
  assertCan(ctx.actor, "orders.lock");
  const settings = await loadSettings(ctx.db);
  const week = weekLockedAt(ctx.now, settings.schedule);
  if (weekStartOf(weekStart) !== week) throw new ServiceError("Only the week whose cutoff has just passed can be locked now.");
  if (ctx.now.getTime() < weeklyCutoff(week, settings.schedule).getTime()) throw new ServiceError("The cutoff has not passed yet.");
  if (await isWeekLocked(ctx.db, week)) throw new ServiceError("This week is already locked.");
  const res = await runJob(ctx.db as Db, "thursday-lock", ctx.now);
  return res.result as { locked: number; skippedUnpaid: number; paused: number; invoicesCreated: number };
}

// ---------------------------------------------------------------------------------------------
// Quick starts

export async function quickStartQueue(ctx: Ctx) {
  assertCan(ctx.actor, "orders.read");
  const settings = await loadSettings(ctx.db);
  const today = addisDate(ctx.now);
  const rows = await ctx.db.select({ s: subscriptions, c: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName, phone: clients.phone }, pkg: packages.name })
    .from(subscriptions).innerJoin(clients, eq(clients.id, subscriptions.clientId)).innerJoin(packages, eq(packages.id, subscriptions.packageId))
    .where(and(eq(subscriptions.isQuickStart, true), inArray(subscriptions.status, ["pending_payment", "active", "paused"]), gte(subscriptions.endDate, today)))
    .orderBy(asc(subscriptions.startDate));
  const ids = rows.map((r) => r.s.id);
  const clientIds = rows.map((r) => r.c.id);
  const [invs, pays, nps, days] = await Promise.all([
    ids.length ? ctx.db.select().from(invoices).where(and(inArray(invoices.subscriptionId, ids), eq(invoices.kind, "quick_start"))) : [],
    clientIds.length ? ctx.db.select().from(payments).where(and(inArray(payments.clientId, clientIds), eq(payments.status, "submitted"))) : [],
    clientIds.length ? ctx.db.select().from(nutritionProfiles).where(and(inArray(nutritionProfiles.clientId, clientIds), eq(nutritionProfiles.isCurrent, true))) : [],
    clientIds.length ? ctx.db.select({ clientId: orderDays.clientId }).from(orderDays).where(and(inArray(orderDays.clientId, clientIds), eq(orderDays.isQuickStart, true))) : [],
  ]);
  const taken = await quickStartsTakenByDate(ctx.db, today);
  const items = rows.map(({ s, c, pkg }) => {
    const inv = invs.find((i) => i.subscriptionId === s.id) ?? null;
    const np = nps.find((p) => p.clientId === c.id);
    const added = days.some((d) => d.clientId === c.id);
    const stage: "pending_payment" | "receipt_waiting" | "paid" | "added" = added ? "added"
      : inv?.status === "paid" ? "paid"
      : inv && pays.some((p) => p.invoiceId === inv.id) ? "receipt_waiting" : "pending_payment";
    return {
      subscriptionId: s.id, clientId: c.id, name: `${c.firstName} ${c.lastName}`, phone: c.phone, packageName: pkg,
      startDate: s.startDate, periodEnd: s.quickStartPeriodEnd, deliveryOption: s.deliveryOption,
      amountBirr: inv?.amountBirr ?? null, serviceDays: inv?.serviceDays ?? null, dueAt: inv?.dueAt ?? null, stage,
      profile: np ? profileOf(np.size, np.goal) : null, provisional: np?.provisional ?? false,
      confirmBy: np?.provisional ? new Date(np.setAt.getTime() + settings.schedule.quickStartConfirmHours * 3600_000) : null,
    };
  });
  const capacity = Object.entries(taken).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, n]) => ({ date, taken: n, capacity: settings.schedule.quickStartDailyCapacity }));
  return { items, capacity, dailyCapacity: settings.schedule.quickStartDailyCapacity, cutoffTime: settings.schedule.quickStartCutoffTime };
}

// ---------------------------------------------------------------------------------------------
// Onboarding

/** Packages with the delivery options each one allows under the current settings. */
export async function planOptions(ctx: Ctx) {
  assertCan(ctx.actor, "subscriptions.read");
  const settings = await loadSettings(ctx.db);
  const pkgs = await ctx.db.select().from(packages).where(eq(packages.active, true)).orderBy(asc(packages.sort));
  return pkgs.map((p) => ({
    id: p.id, code: p.code, name: p.name, swapLimit: p.swapLimit, coaching: p.coaching,
    deliveryOptions: p.deliveryOptions.filter((d) => settings.pricing.enabledDeliveryOptions.includes(d)),
  }));
}

/**
 * Price quote for the wizard (the same quote createSubscription uses). Quick starts are priced on the standard menu.
 * Missing ingredient prices come back as { ok: false, missing }.
 */
export async function onboardingQuote(ctx: Ctx, input: { clientId: string; packageId: string; deliveryOption: DeliveryOption; quickStart: boolean }) {
  assertCan(ctx.actor, "subscriptions.read");
  const [np] = await ctx.db.select().from(nutritionProfiles).where(and(eq(nutritionProfiles.clientId, input.clientId), eq(nutritionProfiles.isCurrent, true)));
  if (!np) throw new ServiceError("Set the client's calorie target and size first.");
  const today = addisDate(ctx.now);
  const plan = (await loadClientPlanInputs(ctx.db, [input.clientId], weekStartOf(today))).get(input.clientId)!;
  const q = await quotePrice(ctx.db, {
    profile: profileOf(np.size, np.goal), deliveryOption: input.deliveryOption, packageId: input.packageId,
    swapRuleIds: input.quickStart ? [] : plan.swapRuleIds, addonSlots: input.quickStart ? [] : plan.addons.map((a) => a.slot),
  }, today);
  if (!q.ok) return { ok: false as const, missing: q.missing };
  return { ok: true as const, priceDayBirr: q.priceDayBirr, priceMonth: q.priceMonth, planPrice: q.planPrice };
}

/** Cash paid at the counter: submit (method cash, no receipt) and confirm in one step. */
export async function recordCashPayment(ctx: Ctx, input: { invoiceId: string; reference?: string }) {
  assertCan(ctx.actor, "payments.confirm");
  const p = await submitPayment(ctx, { invoiceId: input.invoiceId, method: "cash", reference: input.reference, receipt: null });
  return confirmPayment(ctx, p.id);
}
