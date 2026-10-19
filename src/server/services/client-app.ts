// The client app (module 11, APP-03…APP-10). Every function works on the signed-in client's own record:
// the client id always comes from ctx.actor.clientId, never from the browser.
import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  areas, checkins, clientAddons, clientSwaps, clients, deliveryDrops, invoices, meals, nutritionProfiles, orderDays, orderMeals,
  packages, pauses, swapRules, weeklyOrders,
} from "@db/schema";
import { assertCan, ForbiddenError, type Actor, type Permission } from "@/server/authz";
import { buildClientMeal } from "@/domain/orders";
import { profileOf } from "@/domain/nutrition";
import { changeEffectiveWeek, mealDatesForWeek, nextLockableWeek, weeklyCutoff } from "@/domain/schedule";
import { checkSwapRequest, swapActiveInWeek, swapTouchesMeal } from "@/domain/swaps";
import { sortBySlot } from "@/domain/recipes";
import { addDays, addisDate, isDateStr, weekStartOf } from "@/domain/time";
import type { DateStr, PaymentMethod, Slot } from "@/domain/types";
import { SLOTS } from "@/domain/types";
import { writeAudit } from "./audit";
import { listClientInvoices, submitPayment } from "./billing";
import { loadClientPlanInputs } from "./client-plan";
import { ServiceError, actorUserId, type Ctx } from "./context";
import { loadMenuData } from "./menu-data";
import { createTelegramLink, notify, unlinkTelegram, userIdsWithRoles } from "./notifications";
import { extraProteinQuote } from "./pricing";
import { loadSettings } from "./settings";
import { currentSubscription, pausePlan } from "./subscriptions";

const LIVE = ["pending_payment", "active", "paused"] as const;

/** Asserts the permission and returns the actor's own client id. */
function own(ctx: Ctx, permission: Permission): { actor: Actor; clientId: string } {
  assertCan(ctx.actor, permission);
  if (!ctx.actor.clientId) throw new ForbiddenError("This screen is for clients.");
  return { actor: ctx.actor, clientId: ctx.actor.clientId };
}

async function liveSubscription(ctx: Ctx, clientId: string) {
  const sub = await currentSubscription(ctx.db, clientId);
  return sub && (LIVE as readonly string[]).includes(sub.status) ? sub : null;
}

export type MealCard = {
  mealId: string; mealName: string; slot: Slot; kcal: number; proteinG: number; carbG: number; fatG: number;
  eatBy: DateStr | null; items: string[]; conflicts: string[];
};

function itemsSummary(items: { partName: string; qty: number; unit: "g" | "piece"; category: string }[]): string[] {
  return items.filter((i) => i.category !== "seasoning").map((i) => `${i.partName} ${i.unit === "piece" ? `× ${i.qty}` : `${i.qty} g`}`);
}

/** Today's meals (by service date), today's drop, a due invoice and the plan state for the empty state (APP-03). */
export async function todayForClient(ctx: Ctx) {
  const { clientId } = own(ctx, "orders.readOwn");
  const today = addisDate(ctx.now);
  const rows = await ctx.db.select({ m: orderMeals, name: meals.name, day: orderDays }).from(orderMeals)
    .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
    .innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
    .innerJoin(meals, eq(meals.id, orderMeals.mealId))
    .where(and(eq(orderMeals.clientId, clientId), eq(orderDays.serviceDate, today), eq(weeklyOrders.status, "locked")));
  const cards: MealCard[] = sortBySlot(rows.map((r) => ({
    mealId: r.m.mealId, mealName: r.name, slot: r.m.slot, kcal: r.m.kcal, proteinG: r.m.proteinG, carbG: r.m.carbG, fatG: r.m.fatG,
    eatBy: r.m.eatBy, items: itemsSummary(r.m.items), conflicts: r.m.conflicts,
  })));
  const [drops, due, sub, nextDay, pausedWeek] = await Promise.all([
    ctx.db.select({ status: deliveryDrops.status, kind: deliveryDrops.kind, slot: deliveryDrops.slot, failedReason: deliveryDrops.failedReason, deliveredAt: deliveryDrops.deliveredAt })
      .from(deliveryDrops).where(and(eq(deliveryDrops.clientId, clientId), eq(deliveryDrops.dropDate, today))),
    ctx.db.select().from(invoices).where(and(eq(invoices.clientId, clientId), eq(invoices.status, "issued"))).orderBy(asc(invoices.dueAt)).limit(1),
    currentSubscription(ctx.db, clientId),
    ctx.db.select({ d: orderDays.serviceDate }).from(orderDays).innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
      .where(and(eq(orderDays.clientId, clientId), gte(orderDays.serviceDate, addDays(today, 1)), eq(weeklyOrders.status, "locked")))
      .orderBy(asc(orderDays.serviceDate)).limit(1),
    ctx.db.select({ startWeek: pauses.startWeek, weeks: pauses.weeks }).from(pauses).where(eq(pauses.clientId, clientId)),
  ]);
  const thisWeek = weekStartOf(today);
  const paused = pausedWeek.some((p) => p.startWeek <= thisWeek && addDays(p.startWeek, 7 * p.weeks) > thisWeek);
  return {
    today, meals: cards, drops, dueInvoice: due[0] ?? null, nextMealDate: nextDay[0]?.d ?? null, paused,
    plan: sub ? { status: sub.status, startDate: sub.startDate, endDate: sub.endDate } : null,
  };
}

/**
 * The week's menu (APP-04): the locked order if the week is locked, otherwise the standard menu at the client's
 * profile with the swaps and add-ons in force that week, and the cutoff until which changes still count.
 */
export async function weekMenu(ctx: Ctx, weekStart: DateStr) {
  const { clientId } = own(ctx, "orders.readOwn");
  if (!isDateStr(weekStart)) throw new ServiceError("That week is not valid.");
  const monday = weekStartOf(weekStart);
  const settings = await loadSettings(ctx.db);
  const [order] = await ctx.db.select().from(weeklyOrders).where(and(eq(weeklyOrders.clientId, clientId), eq(weeklyOrders.weekStart, monday)));
  const cutoff = weeklyCutoff(monday, settings.schedule);
  if (order && order.status === "locked") {
    const rows = await ctx.db.select({ m: orderMeals, name: meals.name, day: orderDays }).from(orderMeals)
      .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId)).innerJoin(meals, eq(meals.id, orderMeals.mealId))
      .where(eq(orderDays.weeklyOrderId, order.id));
    const byDate = new Map<DateStr, { serviceDate: DateStr; dropDate: DateStr; menu: string; meals: MealCard[] }>();
    for (const r of rows) {
      const d = byDate.get(r.day.serviceDate) ?? { serviceDate: r.day.serviceDate, dropDate: r.day.dropDate, menu: r.day.menu, meals: [] };
      d.meals.push({ mealId: r.m.mealId, mealName: r.name, slot: r.m.slot, kcal: r.m.kcal, proteinG: r.m.proteinG, carbG: r.m.carbG, fatG: r.m.fatG,
        eatBy: r.m.eatBy, items: itemsSummary(r.m.items), conflicts: r.m.conflicts });
      byDate.set(r.day.serviceDate, d);
    }
    const days = [...byDate.values()].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate)).map((d) => ({ ...d, meals: sortBySlot(d.meals) }));
    return { weekStart: monday, state: "locked" as const, cutoff, profile: order.profile, days };
  }
  if (order) return { weekStart: monday, state: order.status, cutoff, profile: order.profile, days: [] };
  const [data, plan] = await Promise.all([loadMenuData(ctx.db), loadClientPlanInputs(ctx.db, [clientId], monday)]);
  const p = plan.get(clientId);
  if (!p) throw new ServiceError("Your record was not found.");
  const days = mealDatesForWeek(monday, settings.schedule).map((md) => ({
    serviceDate: md.serviceDate, dropDate: md.dropDate, menu: md.menu,
    meals: sortBySlot(data.meals.filter((m) => m.menu === md.menu)).map((m): MealCard => {
      const d = buildClientMeal(m, p, md, data, { schedule: settings.schedule, pricing: settings.pricing, roundGramsTo: settings.nutrition.roundGramsTo });
      return { mealId: d.mealId, mealName: d.mealName, slot: d.slot, kcal: d.kcal, proteinG: d.proteinG, carbG: d.carbG, fatG: d.fatG,
        eatBy: null, items: itemsSummary(d.items), conflicts: d.conflicts };
    }),
  }));
  return { weekStart: monday, state: (ctx.now < cutoff ? "open" : "closed") as "open" | "closed", cutoff, profile: p.profile, days };
}

/** Plan, package, price, macros and swaps used (APP-05). */
export async function myPlan(ctx: Ctx) {
  const { clientId } = own(ctx, "subscriptions.readOwn");
  const [[client], [np], sub] = await Promise.all([
    ctx.db.select().from(clients).where(eq(clients.id, clientId)),
    ctx.db.select().from(nutritionProfiles).where(and(eq(nutritionProfiles.clientId, clientId), eq(nutritionProfiles.isCurrent, true))),
    currentSubscription(ctx.db, clientId),
  ]);
  const settings = await loadSettings(ctx.db);
  const pkg = sub ? (await ctx.db.select().from(packages).where(eq(packages.id, sub.packageId)))[0] : null;
  const week = changeEffectiveWeek(ctx.now, settings.schedule);
  const swaps = await ctx.db.select().from(clientSwaps).where(eq(clientSwaps.clientId, clientId));
  const used = swaps.filter((s) => s.swapRuleId && (s.status === "approved" || s.status === "requested") && swapActiveInWeek(s, week)).length;
  return {
    client: { firstName: client.firstName, lastName: client.lastName, status: client.status },
    profile: np ? { size: np.size, goal: np.goal, kcal: np.kcalTarget, proteinG: np.proteinG, carbG: np.carbG, fatG: np.fatG, provisional: np.provisional, setAt: np.setAt, profile: profileOf(np.size, np.goal) } : null,
    subscription: sub, package: pkg, swapLimit: pkg?.swapLimit ?? 0, swapsUsed: used, nextWeek: week,
    cutoff: weeklyCutoff(week, settings.schedule),
  };
}

/** The client asks the nutritionist for a different size (NUT-07: they cannot change it themselves). */
export async function requestSizeChange(ctx: Ctx, note: string) {
  const { actor, clientId } = own(ctx, "nutrition.readOwn");
  const text = note.trim().slice(0, 500);
  if (!text) throw new ServiceError("Tell the nutritionist what you would like changed and why.");
  const [c] = await ctx.db.select({ firstName: clients.firstName, lastName: clients.lastName }).from(clients).where(eq(clients.id, clientId));
  const today = addisDate(ctx.now);
  const staff = await userIdsWithRoles(ctx.db, ["nutritionist"]);
  const created = await notify(ctx.db, { userIds: staff, kind: "nutrition.size_request", title: `Size change request: ${c.firstName} ${c.lastName[0] ?? ""}.`,
    body: text, link: `/staff/clients/${clientId}`, dedupeKey: `size-request:${clientId}:${today}` });
  if (created === 0 && staff.length > 0) throw new ServiceError("You already sent a request today. The nutritionist will get back to you.");
  await writeAudit(ctx.db, actor, { action: "nutrition.size_change_requested", entity: "clients", entityId: clientId, after: { note: text } });
  return { sentTo: staff.length };
}

/** Swaps screen data: current swaps, table rules relevant to the client's menu, add-ons with price (APP-06). */
export async function mySwaps(ctx: Ctx) {
  const { clientId } = own(ctx, "swaps.readOwn");
  const settings = await loadSettings(ctx.db);
  const week = changeEffectiveWeek(ctx.now, settings.schedule);
  const today = addisDate(ctx.now);
  const [swaps, rules, addons, sub, plan, data] = await Promise.all([
    ctx.db.select().from(clientSwaps).where(eq(clientSwaps.clientId, clientId)).orderBy(desc(clientSwaps.createdAt)),
    ctx.db.select().from(swapRules).where(eq(swapRules.active, true)).orderBy(asc(swapRules.sort)),
    ctx.db.select().from(clientAddons).where(eq(clientAddons.clientId, clientId)),
    liveSubscription(ctx, clientId),
    loadClientPlanInputs(ctx.db, [clientId], week),
    loadMenuData(ctx.db),
  ]);
  const pkg = sub ? (await ctx.db.select().from(packages).where(eq(packages.id, sub.packageId)))[0] : null;
  const profile = plan.get(clientId)?.profile ?? "M_LEAN";
  const domainRules = data.swapRules.filter((r) => r.active);
  const relevant = new Set(domainRules.filter((r) => data.meals.some((m) => swapTouchesMeal(r, { mealId: m.id, mealCode: m.code, mealName: m.name, slot: m.slot,
    items: m.parts.map((p) => ({ partId: p.id, partName: p.name, category: p.category, unit: p.unit, qty: p.baseQty, ingredients: p.ingredients })) }))).map((r) => r.id));
  const current = swaps.filter((s) => s.status !== "rejected" && (s.endedWeekStart == null || s.endedWeekStart > week) && s.status !== "ended");
  const used = current.filter((s) => s.swapRuleId && swapActiveInWeek(s, week)).length;
  const addonPrices = Object.fromEntries(await Promise.all(SLOTS.map(async (slot) => [slot, await extraProteinQuote(ctx.db, profile, slot, today)] as const)));
  return {
    week, cutoff: weeklyCutoff(week, settings.schedule), packageName: pkg?.name ?? null, swapLimit: pkg?.swapLimit ?? 0, used, hasPlan: Boolean(sub),
    current: current.map((s) => ({ id: s.id, status: s.status, effectiveWeekStart: s.effectiveWeekStart, endedWeekStart: s.endedWeekStart,
      label: s.swapRuleId ? rules.find((r) => r.id === s.swapRuleId)?.label ?? "Swap" : s.customRequest ?? "Custom request", custom: !s.swapRuleId, note: s.note })),
    history: swaps.filter((s) => s.status === "rejected").slice(0, 5).map((s) => ({ id: s.id, label: s.customRequest ?? rules.find((r) => r.id === s.swapRuleId)?.label ?? "Swap", note: s.note })),
    rules: rules.filter((r) => relevant.has(r.id)).map((r) => ({ id: r.id, label: r.label, extraCost: r.costMode === "price_difference",
      standing: current.some((s) => s.swapRuleId === r.id) })),
    addons: SLOTS.map((slot) => {
      const a = addons.find((x) => x.slot === slot && (x.endedWeekStart == null || x.endedWeekStart > week));
      return { slot, priceBirr: addonPrices[slot] ?? null, active: a ? { id: a.id, effectiveWeekStart: a.effectiveWeekStart, pricePerPortionBirr: a.pricePerPortionBirr } : null };
    }),
  };
}

/**
 * Swap request (SWP-04, SWP-09, RULE-02): a swap-table rule within the package limit is approved at once and takes
 * effect from the next lockable week; a custom request goes to the nutritionist; over the limit is refused.
 */
export async function requestSwap(ctx: Ctx, input: { swapRuleId?: string | null; customRequest?: string | null }) {
  const { actor, clientId } = own(ctx, "swaps.request");
  const sub = await liveSubscription(ctx, clientId);
  if (!sub) throw new ServiceError("Choose a plan first. Swaps come with your plan.");
  const [pkg] = await ctx.db.select().from(packages).where(eq(packages.id, sub.packageId));
  const settings = await loadSettings(ctx.db);
  const week = changeEffectiveWeek(ctx.now, settings.schedule);
  const existing = await ctx.db.select().from(clientSwaps).where(eq(clientSwaps.clientId, clientId));
  const ruleId = input.swapRuleId ?? null;
  if (ruleId) {
    const [rule] = await ctx.db.select().from(swapRules).where(and(eq(swapRules.id, ruleId), eq(swapRules.active, true)));
    if (!rule) throw new ServiceError("That swap is not in the swap table.");
    const check = checkSwapRequest({ swapLimit: pkg.swapLimit }, existing, ruleId, week);
    if (!check.ok && check.reason === "duplicate") throw new ServiceError("You already have this swap.");
    if (!check.ok) throw new ServiceError(`Your ${pkg.name} plan allows ${pkg.swapLimit} standing swaps. End one first, or ask the nutritionist.`, "limit");
    const [row] = await ctx.db.insert(clientSwaps).values({ clientId, swapRuleId: ruleId, status: "approved", effectiveWeekStart: week,
      requestedByUserId: actorUserId(actor), decidedAt: ctx.now, note: "Swap table, within plan limit" }).returning();
    await writeAudit(ctx.db, actor, { action: "swap.request_table", entity: "client_swaps", entityId: row.id, after: { rule: rule.code, effectiveWeekStart: week } });
    return row;
  }
  const text = input.customRequest?.trim().slice(0, 300);
  if (!text) throw new ServiceError("Describe the swap you would like.");
  const [row] = await ctx.db.insert(clientSwaps).values({ clientId, swapRuleId: null, customRequest: text, status: "requested", effectiveWeekStart: week,
    requestedByUserId: actorUserId(actor) }).returning();
  await notify(ctx.db, { userIds: await userIdsWithRoles(ctx.db, ["nutritionist"]), kind: "swap.requested", title: "Custom swap to review",
    body: text, link: "/staff/nutrition/swaps", dedupeKey: `swap-requested:${row.id}` });
  return row;
}

/** Ends a standing swap from the next lockable week (or withdraws a request). */
export async function endSwap(ctx: Ctx, swapId: string) {
  const { actor, clientId } = own(ctx, "swaps.request");
  const [s] = await ctx.db.select().from(clientSwaps).where(and(eq(clientSwaps.id, swapId), eq(clientSwaps.clientId, clientId)));
  if (!s) throw new ServiceError("That swap was not found.");
  const week = changeEffectiveWeek(ctx.now, (await loadSettings(ctx.db)).schedule);
  if (s.status === "requested" && !s.swapRuleId) {
    await ctx.db.update(clientSwaps).set({ status: "ended", endedWeekStart: s.effectiveWeekStart }).where(eq(clientSwaps.id, s.id));
  } else {
    if (s.endedWeekStart && s.endedWeekStart <= week) throw new ServiceError("This swap already ends.");
    const ended = s.effectiveWeekStart > week ? s.effectiveWeekStart : week;
    await ctx.db.update(clientSwaps).set({ endedWeekStart: ended, ...(ended <= s.effectiveWeekStart ? { status: "ended" as const } : {}) }).where(eq(clientSwaps.id, s.id));
  }
  await writeAudit(ctx.db, actor, { action: "swap.end", entity: "client_swaps", entityId: s.id, after: { endedWeekStart: week } });
  return { endedWeekStart: week };
}

/** Extra protein add-on for a slot, from the next lockable week, at the formula price (SWP-07). */
export async function addExtraProtein(ctx: Ctx, slot: Slot) {
  const { actor, clientId } = own(ctx, "swaps.request");
  if (!SLOTS.includes(slot)) throw new ServiceError("Choose a meal.");
  const sub = await liveSubscription(ctx, clientId);
  if (!sub) throw new ServiceError("Choose a plan first.");
  const settings = await loadSettings(ctx.db);
  const week = changeEffectiveWeek(ctx.now, settings.schedule);
  const plan = (await loadClientPlanInputs(ctx.db, [clientId], week)).get(clientId)!;
  const existing = await ctx.db.select().from(clientAddons).where(and(eq(clientAddons.clientId, clientId), eq(clientAddons.slot, slot)));
  if (existing.some((a) => a.endedWeekStart == null || a.endedWeekStart > week)) throw new ServiceError("You already have extra protein on this meal.");
  const price = await extraProteinQuote(ctx.db, plan.profile, slot, addisDate(ctx.now));
  if (price == null) throw new ServiceError("Prices are being updated — extra protein can be added once the price is set.", "price_missing");
  const [row] = await ctx.db.insert(clientAddons).values({ clientId, kind: "extra_protein", slot, effectiveWeekStart: week, pricePerPortionBirr: price, createdBy: actorUserId(actor) }).returning();
  await writeAudit(ctx.db, actor, { action: "addon.add", entity: "client_addons", entityId: row.id, after: { slot, price, effectiveWeekStart: week } });
  return row;
}

export async function removeExtraProtein(ctx: Ctx, addonId: string) {
  const { actor, clientId } = own(ctx, "swaps.request");
  const [a] = await ctx.db.select().from(clientAddons).where(and(eq(clientAddons.id, addonId), eq(clientAddons.clientId, clientId)));
  if (!a) throw new ServiceError("That add-on was not found.");
  const week = changeEffectiveWeek(ctx.now, (await loadSettings(ctx.db)).schedule);
  const ended = a.effectiveWeekStart > week ? a.effectiveWeekStart : week;
  await ctx.db.update(clientAddons).set({ endedWeekStart: ended }).where(eq(clientAddons.id, a.id));
  await writeAudit(ctx.db, actor, { action: "addon.remove", entity: "client_addons", entityId: a.id, after: { endedWeekStart: ended } });
  return { endedWeekStart: ended };
}

/** Pause screen data: lockable weeks and the current end date (APP-07). */
export async function pauseOptions(ctx: Ctx) {
  const { clientId } = own(ctx, "subscriptions.readOwn");
  const settings = await loadSettings(ctx.db);
  const sub = await liveSubscription(ctx, clientId);
  const first = nextLockableWeek(ctx.now, settings.schedule);
  const existing = sub ? await ctx.db.select().from(pauses).where(eq(pauses.subscriptionId, sub.id)).orderBy(asc(pauses.startWeek)) : [];
  const weeks: DateStr[] = [];
  if (sub && ["active", "paused"].includes(sub.status)) for (let w = first; w <= sub.endDate && weeks.length < 8; w = addDays(w, 7)) weeks.push(w);
  return { subscription: sub, weeks, cutoff: weeklyCutoff(first, settings.schedule), pauses: existing };
}

export async function pauseMyPlan(ctx: Ctx, input: { startWeek: DateStr; weeks: number }) {
  const { clientId } = own(ctx, "pauses.requestOwn");
  return pausePlan(ctx, { clientId, startWeek: input.startWeek, weeks: input.weeks });
}

export async function myInvoices(ctx: Ctx) {
  const { clientId } = own(ctx, "invoices.readOwn");
  return listClientInvoices(ctx, clientId);
}

/** Receipt upload (PAY-02): the invoice must be the client's own; billing checks it again. */
export async function uploadReceipt(ctx: Ctx, input: { invoiceId: string; method: PaymentMethod; reference?: string; receipt?: File | null }) {
  const { clientId } = own(ctx, "payments.submitOwn");
  const [inv] = await ctx.db.select({ clientId: invoices.clientId }).from(invoices).where(eq(invoices.id, input.invoiceId));
  if (!inv || inv.clientId !== clientId) throw new ServiceError("That invoice was not found.");
  if (input.method !== "cash" && !input.reference?.trim()) throw new ServiceError("Enter the transaction reference from your receipt.");
  return submitPayment(ctx, input);
}

/** The client logs their own weight (APP-09). One entry per day: logging again the same day updates it. */
export async function logWeight(ctx: Ctx, input: { date?: DateStr; weightKg: number }) {
  const { actor, clientId } = own(ctx, "checkins.writeOwn");
  const today = addisDate(ctx.now);
  const date = input.date ?? today;
  if (!isDateStr(date) || date > today) throw new ServiceError("Choose today or an earlier date.");
  if (date < addDays(today, -60)) throw new ServiceError("You can log weights for the last 60 days.");
  if (!(input.weightKg >= 30 && input.weightKg <= 250)) throw new ServiceError("Enter your weight in kg (30–250).");
  const weightG = Math.round(input.weightKg * 1000);
  const [same] = await ctx.db.select().from(checkins).where(and(eq(checkins.clientId, clientId), eq(checkins.checkinDate, date), eq(checkins.source, "client")));
  if (same) {
    const [row] = await ctx.db.update(checkins).set({ weightG }).where(eq(checkins.id, same.id)).returning();
    return row;
  }
  const [row] = await ctx.db.insert(checkins).values({ clientId, checkinDate: date, weightG, source: "client", byUserId: actorUserId(actor) }).returning();
  return row;
}

/** Check-ins for the progress chart, with nutritionist notes (APP-09). */
export async function myProgress(ctx: Ctx) {
  const { clientId } = own(ctx, "checkins.readOwn");
  const rows = await ctx.db.select({ id: checkins.id, date: checkins.checkinDate, weightG: checkins.weightG, notes: checkins.notes, source: checkins.source, adherencePct: checkins.adherencePct })
    .from(checkins).where(eq(checkins.clientId, clientId)).orderBy(asc(checkins.checkinDate), asc(checkins.createdAt));
  return rows;
}

/** Profile screen data. */
export async function myProfile(ctx: Ctx) {
  const { clientId } = own(ctx, "clients.readOwn");
  const [[c], areaRows] = await Promise.all([
    ctx.db.select().from(clients).where(eq(clients.id, clientId)),
    ctx.db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.active, true)).orderBy(areas.sort, areas.name),
  ]);
  const settings = await loadSettings(ctx.db);
  return {
    firstName: c.firstName, lastName: c.lastName, phone: c.phone, address: c.address ?? "", areaId: c.areaId, landmark: c.landmark ?? "",
    telegramOptIn: c.telegramOptIn, areas: areaRows, effectiveWeek: changeEffectiveWeek(ctx.now, settings.schedule),
  };
}

/**
 * Address, area, landmark and Telegram opt-in. Drops of locked weeks keep the address they were created with,
 * so a new address is used from the next lockable week (RULE-02, D393).
 */
export async function updateMyProfile(ctx: Ctx, input: { address: string; areaId: string | null; landmark: string; telegramOptIn: boolean }) {
  const { actor, clientId } = own(ctx, "clients.writeOwn");
  if (input.areaId) {
    const [a] = await ctx.db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, input.areaId), eq(areas.active, true)));
    if (!a) throw new ServiceError("Choose your area from the list.");
  }
  const sub = await liveSubscription(ctx, clientId);
  if (sub && sub.deliveryOption !== "pickup" && (!input.address.trim() || !input.areaId)) throw new ServiceError("Your plan is delivered: enter an address and area.");
  const [before] = await ctx.db.select({ address: clients.address, areaId: clients.areaId, landmark: clients.landmark }).from(clients).where(eq(clients.id, clientId));
  const after = { address: input.address.trim().slice(0, 300) || null, areaId: input.areaId, landmark: input.landmark.trim().slice(0, 200) || null };
  await ctx.db.update(clients).set({ ...after, telegramOptIn: input.telegramOptIn }).where(eq(clients.id, clientId));
  const changed = before.address !== after.address || before.areaId !== after.areaId || before.landmark !== after.landmark;
  if (changed) await writeAudit(ctx.db, actor, { action: "client.address_change", entity: "clients", entityId: clientId, before, after });
  const week = changeEffectiveWeek(ctx.now, (await loadSettings(ctx.db)).schedule);
  return { addressChanged: changed, effectiveWeek: week };
}

/** Telegram opt-in by deep link (APP-10, NOT-04): sets the opt-in and returns the one-time link. */
export async function connectTelegram(ctx: Ctx) {
  const { clientId } = own(ctx, "telegram.own");
  const res = await createTelegramLink(ctx);
  await ctx.db.update(clients).set({ telegramOptIn: true }).where(eq(clients.id, clientId));
  return { link: res.link };
}

export async function disconnectTelegram(ctx: Ctx) {
  const { clientId } = own(ctx, "telegram.own");
  await unlinkTelegram(ctx);
  await ctx.db.update(clients).set({ telegramOptIn: false }).where(eq(clients.id, clientId));
}
