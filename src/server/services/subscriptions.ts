// Plans: create (regular or quick start), pause, renew, owner discounts and price changes (modules 5 and 7).
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { clients, invoices, nutritionProfiles, packages, pauses, subscriptions, weeklyOrders } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertCan, assertCanForClient, can } from "@/server/authz";
import { profileOf } from "@/domain/nutrition";
import { priceLockedUntil, quickStartAmount, type PriceBreakdown } from "@/domain/pricing";
import { nextLockableWeek, quickStartPlan, weekLockedAt, weeklyCutoff } from "@/domain/schedule";
import { applyPause, invoicePeriods, invoiceAmount, pausedServiceDays, renewEndDate, subscriptionEndDate } from "@/domain/subscriptions";
import { addDays, addisDate, weekStartOf } from "@/domain/time";
import type { BillingPeriod, DateStr, DeliveryOption, Slot } from "@/domain/types";
import { writeAudit } from "./audit";
import { loadClientPlanInputs } from "./client-plan";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { quickStartsTakenByDate } from "./orders";
import { quotePrice } from "./pricing";
import { generateInvoicesForSubscription, takeDaysOffInvoice } from "./billing";
import { loadSettings } from "./settings";

export type NewPlanInput = {
  clientId: string;
  packageId: string;
  deliveryOption: DeliveryOption;
  billingPeriod: BillingPeriod;
  termMonths: number;
  /** "quick_start" = next service day (pay by 18:00); "next_week" = Monday of the next lockable week */
  start: "quick_start" | "next_week";
};

const PAUSE_REASONS: Record<string, string> = {
  not_monday: "Pauses start on a Monday.",
  not_whole_weeks: "Pauses are taken in whole weeks.",
  after_cutoff: "That week is already locked. The earliest week you can pause is the next one after Thursday's cutoff.",
  after_end: "That week is after the plan ends.",
};

async function quoteFor(db: DbOrTx, clientId: string, packageId: string, deliveryOption: DeliveryOption, today: DateStr, standardMenu: boolean, choicesWeek?: DateStr) {
  const [np] = await db.select().from(nutritionProfiles).where(and(eq(nutritionProfiles.clientId, clientId), eq(nutritionProfiles.isCurrent, true)));
  if (!np) throw new ServiceError("Set the client's calorie target and size first.");
  // the choices in force from `choicesWeek` (default: the next lockable week, so changes already made count)
  const plan = (await loadClientPlanInputs(db, [clientId], choicesWeek ?? weekStartOf(today))).get(clientId)!;
  const choices: PricedChoices = standardMenu ? { swapRuleIds: [], addonSlots: [] } : { swapRuleIds: plan.swapRuleIds, addonSlots: plan.addons.map((a) => a.slot) };
  const quote = await quotePrice(db, { profile: profileOf(np.size, np.goal), deliveryOption, packageId, ...choices }, today);
  if (!quote.ok) throw new ServiceError(`Price cannot be published yet: price missing for ${quote.missing.join(", ")}.`, "price_missing");
  return { quote, np, choices };
}

/** The client choices (standing swaps, add-ons) that a plan's current price reflects. */
export type PricedChoices = { swapRuleIds: string[]; addonSlots: Slot[] };

/**
 * Creates a plan with its first invoice. Quick start: price per day × service days in the quick-start period,
 * due at the 18:00 lock; regular: first billing period from the next lockable Monday.
 */
export async function createSubscription(ctx: Ctx, input: NewPlanInput, opts: { selfService?: boolean } = {}) {
  if (opts.selfService) assertCanForClient(ctx.actor, input.clientId, "subscriptions.write", "subscriptions.readOwn");
  else assertCan(ctx.actor, "subscriptions.write");
  if (!Number.isInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > 4) throw new ServiceError("Plan term is 1 to 4 months.");
  const settings = await loadSettings(ctx.db);
  const [pkg] = await ctx.db.select().from(packages).where(eq(packages.id, input.packageId));
  if (!pkg || !pkg.active) throw new ServiceError("Choose a package.");
  if (!pkg.deliveryOptions.includes(input.deliveryOption) || !settings.pricing.enabledDeliveryOptions.includes(input.deliveryOption)) {
    throw new ServiceError(`${pkg.name} does not offer that delivery option.`);
  }
  const live = await ctx.db.select().from(subscriptions)
    .where(and(eq(subscriptions.clientId, input.clientId), inArray(subscriptions.status, ["pending_payment", "active", "paused"])));
  if (live.length) throw new ServiceError("This client already has a plan. Renew or change it instead.");
  const today = addisDate(ctx.now);
  const { quote, np, choices } = await quoteFor(ctx.db, input.clientId, input.packageId, input.deliveryOption, today, input.start === "quick_start");
  const isQs = input.start === "quick_start";

  let startDate: DateStr, qsPeriodEnd: DateStr | null = null, first: { start: DateStr; end: DateStr; days: number; amount: number; dueAt: Date; kind: "weekly" | "monthly" | "quick_start" };
  if (isQs) {
    const plan = quickStartPlan(ctx.now, settings.schedule, await quickStartsTakenByDate(ctx.db, today));
    if (!plan) throw new ServiceError("The kitchen is full for quick starts. Choose a start next week.", "capacity");
    startDate = plan.startDate;
    qsPeriodEnd = plan.periodEnd;
    first = { start: plan.startDate, end: plan.periodEnd, days: plan.serviceDays, amount: quickStartAmount(quote.priceDay, plan.serviceDays, settings.pricing), dueAt: plan.lockAt, kind: "quick_start" };
  } else {
    startDate = nextLockableWeek(ctx.now, settings.schedule);
    const endDate = subscriptionEndDate(startDate, input.termMonths);
    const p = invoicePeriods({ startDate, endDate, billingPeriod: input.billingPeriod }, settings.schedule)[0];
    first = { start: p.start, end: p.end, days: p.serviceDays, amount: invoiceAmount(p, { planPriceBirr: quote.planPrice }, settings.pricing), dueAt: weeklyCutoff(startDate, settings.schedule), kind: p.kind };
  }
  return ctx.db.transaction(async (tx) => {
    const [sub] = await tx.insert(subscriptions).values({
      clientId: input.clientId, packageId: pkg.id, goal: np.goal, deliveryOption: input.deliveryOption, billingPeriod: input.billingPeriod,
      startDate, endDate: subscriptionEndDate(startDate, input.termMonths), termMonths: input.termMonths,
      priceDayBirr: quote.priceDayBirr, priceMonthBirr: quote.priceMonth, planPriceBirr: quote.planPrice,
      priceBreakdown: breakdownJson(quote, choices), priceLockedUntil: priceLockedUntil(startDate, settings.pricing.priceLockMonths),
      status: "pending_payment", isQuickStart: isQs, quickStartPeriodEnd: qsPeriodEnd,
    }).returning();
    const [inv] = await tx.insert(invoices).values({
      clientId: input.clientId, subscriptionId: sub.id, kind: first.kind, periodStart: first.start, periodEnd: first.end,
      serviceDays: first.days, amountBirr: first.amount, status: "issued", dueAt: first.dueAt,
    }).returning();
    // Bill the periods that the next Thursday lock will need (e.g. a quick start's first regular week), so the
    // client can pay them before that cutoff (business rule 1).
    await generateInvoicesForSubscription(tx, sub.id, weekLockedAt(ctx.now, settings.schedule));
    await writeAudit(tx, ctx.actor, { action: "subscription.create", entity: "subscriptions", entityId: sub.id,
      after: { package: pkg.code, startDate, planPrice: quote.planPrice, quickStart: isQs, firstInvoice: first.amount } });
    return { subscription: sub, invoice: inv };
  });
}

function breakdownJson(q: PriceBreakdown, pricedChoices: PricedChoices) {
  return { ...Object.fromEntries(Object.entries(q).filter(([k]) => k !== "lines")), pricedChoices };
}

export async function currentSubscription(db: DbOrTx, clientId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.clientId, clientId)).orderBy(desc(subscriptions.createdAt)).limit(1);
  return sub ?? null;
}

/** Pause whole weeks from the next lockable week; extends the end date (RULE-03, RULE-04, APP-07). */
export async function pausePlan(ctx: Ctx, input: { clientId: string; startWeek: DateStr; weeks: number }) {
  assertCanForClient(ctx.actor, input.clientId, "pauses.write", "pauses.requestOwn");
  const settings = await loadSettings(ctx.db);
  const sub = await currentSubscription(ctx.db, input.clientId);
  if (!sub || !["active", "paused"].includes(sub.status)) throw new ServiceError("There is no active plan to pause.");
  const res = applyPause({ endDate: sub.endDate }, input.startWeek, input.weeks, ctx.now, settings.schedule);
  if (!res.ok) throw new ServiceError(PAUSE_REASONS[res.reason]);
  await ctx.db.transaction(async (tx) => {
    // Serialised per plan: the subscription row is locked, then the overlap is checked and the invoices are read
    // locked, so a double tap or a payment confirmation running at the same time cannot double-reduce or read stale rows.
    const [locked] = await tx.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).for("update");
    if (locked.endDate !== sub.endDate) throw new ServiceError("The plan just changed. Refresh and try again.");
    const existing = await tx.select().from(pauses).where(eq(pauses.subscriptionId, sub.id));
    if (existing.some((p) => p.startWeek <= res.endWeek && addWeeks(p.startWeek, p.weeks) > res.startWeek)) throw new ServiceError("Part of that time is already paused.");
    // the Thursday lock may have locked the week while this request was in flight: a locked week cannot be paused
    const [lockedWeek] = await tx.select({ id: weeklyOrders.id }).from(weeklyOrders)
      .where(and(eq(weeklyOrders.subscriptionId, sub.id), sql`${weeklyOrders.weekStart} between ${res.startWeek} and ${res.endWeek}`)).limit(1);
    if (lockedWeek) throw new ServiceError(PAUSE_REASONS.after_cutoff);
    await tx.insert(pauses).values({ subscriptionId: sub.id, clientId: sub.clientId, startWeek: res.startWeek, weeks: res.weeks, requestedByUserId: actorUserId(ctx.actor) });
    await tx.update(subscriptions).set({ endDate: res.endDate }).where(eq(subscriptions.id, sub.id));
    // Paused days are not charged (rule 6: they extend the plan). Invoices already made for the paused weeks:
    // a weekly invoice inside the pause is voided (and refunded as credit when paid); any other invoice that
    // overlaps the pause is reduced (unpaid) or credited (paid) by the paused service days.
    const pauseList = [{ startWeek: res.startWeek, weeks: res.weeks }];
    const overlapping = await tx.select().from(invoices).where(and(eq(invoices.subscriptionId, sub.id), ne(invoices.status, "void"))).for("update");
    for (const inv of overlapping) {
      if (inv.periodEnd < res.startWeek || inv.periodStart > res.endWeek) continue;
      const pausedDays = pausedServiceDays(pauseList, inv.periodStart, inv.periodEnd, settings.schedule);
      await takeDaysOffInvoice(tx, inv, pausedDays, "week paused");
    }
    await writeAudit(tx, ctx.actor, { action: "subscription.pause", entity: "subscriptions", entityId: sub.id,
      before: { endDate: sub.endDate }, after: { endDate: res.endDate, startWeek: res.startWeek, weeks: res.weeks } });
  });
  return res;
}

function addWeeks(monday: DateStr, weeks: number): DateStr {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  return d.toISOString().slice(0, 10);
}

/** Renew: extend by the term; the locked price stays until price_locked_until (PLN-07). */
export async function renewPlan(ctx: Ctx, clientId: string) {
  assertCan(ctx.actor, "subscriptions.write");
  return ctx.db.transaction((tx) => renewPlanLocked({ ...ctx, db: tx }, clientId));
}

async function renewPlanLocked(ctx: Ctx, clientId: string) {
  assertCan(ctx.actor, "subscriptions.write");
  const current = await currentSubscription(ctx.db, clientId);
  if (!current) throw new ServiceError("There is no active plan to renew.");
  // fresh row under the plan lock: a pause or re-price committed meanwhile is never overwritten
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.id, current.id)).for("update");
  if (!sub || !["active", "paused"].includes(sub.status)) throw new ServiceError("There is no active plan to renew.");
  const endDate = renewEndDate(sub.endDate, sub.termMonths);
  await ctx.db.update(subscriptions).set({ endDate }).where(eq(subscriptions.id, sub.id));
  await writeAudit(ctx.db, ctx.actor, { action: "subscription.renew", entity: "subscriptions", entityId: sub.id, before: { endDate: sub.endDate }, after: { endDate } });
  // bill the renewed term's next periods now, due at their cutoffs, so the client can pay before those weeks lock
  const schedule = (await loadSettings(ctx.db)).schedule;
  // A price change applies at the next renewal (doc 6). Renewed after the lock: the renewed plan is priced from the
  // current formula now and locked again. Renewed inside the lock: the old price stays until the lock ends and the
  // daily job re-prices it on that date (repriceAtLockEnd) — never inside the lock without an owner.
  if (addisDate(ctx.now) >= sub.priceLockedUntil) {
    const r = await repriceAtRenewal(ctx, sub.id);
    await generateInvoicesForSubscription(ctx.db, sub.id, weekLockedAt(ctx.now, schedule));
    if (r) return { endDate, planPriceBirr: r.planPriceBirr };
    return { endDate };
  } else {
    await ctx.db.update(subscriptions).set({ priceBreakdown: { ...((sub.priceBreakdown as Record<string, unknown> | null) ?? {}), repriceAtLockEnd: true } })
      .where(eq(subscriptions.id, sub.id));
  }
  await generateInvoicesForSubscription(ctx.db, sub.id, weekLockedAt(ctx.now, schedule));
  return { endDate };
}

/** Owner-only manual discount per month, logged with who and why (PLN-08). */
export async function applyDiscount(ctx: Ctx, input: { subscriptionId: string; discountMonthBirr: number; reason: string }) {
  assertCan(ctx.actor, "discounts.apply");
  if (!Number.isInteger(input.discountMonthBirr) || input.discountMonthBirr < 0) throw new ServiceError("Discount is whole birr, 0 or more.");
  if (!input.reason.trim()) throw new ServiceError("Give a reason for the discount.");
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId));
  if (!sub) throw new ServiceError("Plan not found.");
  if (input.discountMonthBirr > sub.planPriceBirr) throw new ServiceError("The discount cannot be more than the plan price.");
  await ctx.db.update(subscriptions).set({ discountMonthBirr: input.discountMonthBirr, discountReason: input.reason.trim(), discountByUserId: actorUserId(ctx.actor) })
    .where(eq(subscriptions.id, sub.id));
  await writeAudit(ctx.db, ctx.actor, { action: "discount.apply", entity: "subscriptions", entityId: sub.id,
    before: { discountMonthBirr: sub.discountMonthBirr }, after: { discountMonthBirr: input.discountMonthBirr }, reason: input.reason.trim() });
}

/**
 * Re-price a plan from the current formula. During the 4-month price lock only an owner may apply it, with a
 * reason (PLN-07); otherwise operations can apply it (at renewal). Applies to invoices generated from now on.
 */
export async function repricePlan(ctx: Ctx, input: { subscriptionId: string; reason?: string }) {
  assertCan(ctx.actor, "subscriptions.write");
  return ctx.db.transaction((tx) => repricePlanLocked({ ...ctx, db: tx }, input));
}

async function repricePlanLocked(ctx: Ctx, input: { subscriptionId: string; reason?: string }) {
  // locked fresh row: a concurrent add-on/swap re-price or renewal is never overwritten
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId)).for("update");
  if (!sub) throw new ServiceError("Plan not found.");
  const today = addisDate(ctx.now);
  const locked = today < sub.priceLockedUntil;
  if (locked && !can(ctx.actor, "discounts.apply")) throw new ServiceError("The price is locked until " + sub.priceLockedUntil + ". Only an owner can change it earlier.");
  if (locked && !input.reason?.trim()) throw new ServiceError("Give a reason for changing a locked price.");
  const nextWeek = nextLockableWeek(ctx.now, (await loadSettings(ctx.db)).schedule);
  const { quote, choices } = await quoteFor(ctx.db, sub.clientId, sub.packageId, sub.deliveryOption, today, false, nextWeek);
  await ctx.db.update(subscriptions).set({ priceDayBirr: quote.priceDayBirr, priceMonthBirr: quote.priceMonth, planPriceBirr: quote.planPrice,
    priceBreakdown: breakdownJson(quote, choices), ...(locked ? {} : { priceLockedUntil: priceLockedUntil(today) }) }).where(eq(subscriptions.id, sub.id));
  await writeAudit(ctx.db, ctx.actor, { action: locked ? "price.change_early" : "price.change", entity: "subscriptions", entityId: sub.id,
    before: { planPriceBirr: sub.planPriceBirr }, after: { planPriceBirr: quote.planPrice }, reason: input.reason ?? null });
  return { planPriceBirr: quote.planPrice };
}

/** Ends plans whose end date has passed; clients become ended (community access ends 14 days later). */
export async function endExpiredPlans(db: DbOrTx, today: DateStr) {
  const live = await db.select().from(subscriptions).where(inArray(subscriptions.status, ["active", "paused"]));
  let ended = 0;
  for (const s of live) {
    if (s.endDate >= today) continue;
    // conditional on the row as it is now: a renewal that committed after the read above keeps the plan running
    const [row] = await db.update(subscriptions).set({ status: "ended" })
      .where(and(eq(subscriptions.id, s.id), inArray(subscriptions.status, ["active", "paused"]), sql`${subscriptions.endDate} < ${today}`))
      .returning({ endDate: subscriptions.endDate });
    if (!row) continue;
    await db.update(clients).set({ status: "ended", endedAt: row.endDate }).where(eq(clients.id, s.clientId));
    ended++;
  }
  return ended;
}

/**
 * Adjusts a plan's price after a change to what the client ordered (extra-protein add-on, or a "price difference"
 * swap), from the week it takes effect (D029, D037, D040). The old and the new choices are priced with the SAME
 * current formula and only the difference is added to the plan's locked price, so ingredient-price or settings
 * changes never reach a client during the 4-month price lock (rule 7). Audited. Callers authorize the change itself.
 */
export async function repriceForPlanChange(ctx: Ctx, clientId: string, effectiveWeek: DateStr, reason: string) {
  return ctx.db.transaction(async (tx) => repriceForPlanChangeLocked({ ...ctx, db: tx }, clientId, effectiveWeek, reason));
}

async function repriceForPlanChangeLocked(ctx: Ctx, clientId: string, effectiveWeek: DateStr, reason: string) {
  const current = await currentSubscription(ctx.db, clientId);
  if (!current) return null;
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.id, current.id)).for("update");
  if (!sub || !["active", "paused", "pending_payment"].includes(sub.status)) return null;
  const [np] = await ctx.db.select().from(nutritionProfiles).where(and(eq(nutritionProfiles.clientId, clientId), eq(nutritionProfiles.isCurrent, true)));
  if (!np) return null;
  const choicesIn = async (week: DateStr): Promise<PricedChoices> => {
    const plan = (await loadClientPlanInputs(ctx.db, [clientId], week)).get(clientId)!;
    return { swapRuleIds: plan.swapRuleIds, addonSlots: plan.addons.map((a) => a.slot) };
  };
  const priceWith = (c: PricedChoices) => quotePrice(ctx.db, { profile: profileOf(np.size, np.goal), deliveryOption: sub.deliveryOption,
    packageId: sub.packageId, ...c }, effectiveWeek);
  // "before" = the choices the current price already reflects, so each change is counted once and a withdrawn
  // change is taken back (older plans without the record fall back to the week before)
  const priced = (sub.priceBreakdown as { pricedChoices?: PricedChoices } | null)?.pricedChoices ?? await choicesIn(addDays(effectiveWeek, -7));
  const nextChoices = await choicesIn(effectiveWeek);
  const [before, after] = await Promise.all([priceWith(priced), priceWith(nextChoices)]);
  if (!before.ok || !after.ok) return null;
  const deltaMonth = after.priceMonth - before.priceMonth;
  if (deltaMonth === 0) {
    await ctx.db.update(subscriptions).set({ priceBreakdown: { ...((sub.priceBreakdown as Record<string, unknown> | null) ?? {}), pricedChoices: nextChoices } })
      .where(eq(subscriptions.id, sub.id));
    return null;
  }
  const priceMonth = sub.priceMonthBirr + deltaMonth;
  const planPrice = sub.planPriceBirr + deltaMonth;
  const priceDayBirr = Math.round(sub.priceDayBirr + (after.priceDay - before.priceDay));
  const breakdown = { ...((sub.priceBreakdown as Record<string, unknown> | null) ?? {}), pricedChoices: nextChoices,
    priceDay: (((sub.priceBreakdown as { priceDay?: number } | null)?.priceDay) ?? sub.priceDayBirr) + (after.priceDay - before.priceDay) };
  await ctx.db.update(subscriptions).set({ priceDayBirr, priceMonthBirr: priceMonth, planPriceBirr: planPrice, priceBreakdown: breakdown })
    .where(eq(subscriptions.id, sub.id));
  await writeAudit(ctx.db, ctx.actor, { action: "price.plan_change", entity: "subscriptions", entityId: sub.id,
    before: { planPriceBirr: sub.planPriceBirr }, after: { planPriceBirr: planPrice, deltaMonth, effectiveWeek }, reason });
  return { planPriceBirr: planPrice };
}

/** Prices a renewed plan from the current formula and locks it again from today (audited as price.renewal). */
export async function repriceAtRenewal(ctx: Ctx, subscriptionId: string): Promise<{ planPriceBirr: number } | null> {
  return ctx.db.transaction((tx) => repriceAtRenewalLocked({ ...ctx, db: tx }, subscriptionId));
}

async function repriceAtRenewalLocked(ctx: Ctx, subscriptionId: string): Promise<{ planPriceBirr: number } | null> {
  // choices and price are read under the plan lock, so a concurrent add-on/swap re-price is not erased
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).for("update");
  if (!sub) return null;
  const settings = await loadSettings(ctx.db);
  const today = addisDate(ctx.now);
  try {
    const { quote, choices } = await quoteFor(ctx.db, sub.clientId, sub.packageId, sub.deliveryOption, today, false, nextLockableWeek(ctx.now, settings.schedule));
    await ctx.db.update(subscriptions).set({ priceDayBirr: quote.priceDayBirr, priceMonthBirr: quote.priceMonth, planPriceBirr: quote.planPrice,
      priceBreakdown: breakdownJson(quote, choices), priceLockedUntil: priceLockedUntil(today, settings.pricing.priceLockMonths) })
      .where(eq(subscriptions.id, sub.id));
    await writeAudit(ctx.db, ctx.actor, { action: "price.renewal", entity: "subscriptions", entityId: sub.id,
      before: { planPriceBirr: sub.planPriceBirr }, after: { planPriceBirr: quote.planPrice }, reason: "Price lock ended: renewed at the current price" });
    return { planPriceBirr: quote.planPrice };
  } catch (e) {
    if (e instanceof ServiceError) return null; // price missing: keep the old price until prices exist
    throw e;
  }
}

/** Daily: renewed plans whose price lock ended today or earlier get the current price (D058). */
export async function repriceRenewedPlansAtLockEnd(ctx: Ctx): Promise<number> {
  const today = addisDate(ctx.now);
  const due = await ctx.db.select().from(subscriptions)
    .where(and(inArray(subscriptions.status, ["active", "paused"]), sql`(${subscriptions.priceBreakdown} ->> 'repriceAtLockEnd')::boolean is true`,
      sql`${subscriptions.priceLockedUntil} <= ${today}`));
  let n = 0;
  for (const sub of due) if (await repriceAtRenewal(ctx, sub.id)) n++;
  return n;
}
