// Weekly lock and order building (business rules 1, 2, 6; PLAN section 7; DECISIONS D020).
import { eatBy } from "./production";
import { isShortShelfLife, mealMacros, resolveMeal, roundMacros, sortBySlot, type IngredientIndex, type QtyByPartId } from "./recipes";
import { alignToDrops, mealDatesForWeek, type MealDate } from "./schedule";
import type { PricingSettings, ScheduleSettings } from "./settings";
import { coveredDates, isPausedWeek, type InvoiceRange, type Pause } from "./subscriptions";
import { applySwaps, conflictText, findConflicts, type Addon, type Conflict, type SwapRule } from "./swaps";
import { addDays, weekStartOf } from "./time";
import type {
  DateStr, DeliveryOption, Meal, MenuCode, OrderStatus, Profile, ResolvedItem, ResolvedMeal, Slot, SubscriptionStatus,
} from "./types";

export type MenuData = {
  /** every meal (menus A–D and replacement meals such as the savory snack) */
  meals: Meal[];
  /** profile -> partId -> qty (profile_portions); a missing part falls back to its base qty */
  portions: Partial<Record<Profile, QtyByPartId>>;
  swapRules: SwapRule[];
  ingredients: IngredientIndex;
};

export type OrderClient = {
  clientId: string;
  firstName: string;
  lastName: string;
  allergies: string[];
  dislikes: string[];
  profile: Profile;
  deliveryOption: DeliveryOption;
  /** ids of swap rules in force for the week */
  swapRuleIds: string[];
  addons: Addon[];
};

export type OrderMealDraft = {
  serviceDate: DateStr;
  mealId: string;
  mealCode: string;
  mealName: string;
  slot: Slot;
  profile: Profile;
  items: ResolvedItem[];
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  /** "Allergy: peanut (Peanut butter)" lines left after swaps */
  conflicts: string[];
  conflictDetails: Conflict[];
  cookDate: DateStr;
  eatBy: DateStr;
};

export type OrderDayDraft = { serviceDate: DateStr; cookDate: DateStr; dropDate: DateStr; menu: MenuCode; meals: OrderMealDraft[] };

type BuildSettings = { schedule: ScheduleSettings; pricing?: Pick<PricingSettings, "extraProteinGrams">; roundGramsTo?: number };

/** One meal for one client: profile portions, then swaps and add-ons, then macros, conflicts and eat-by. */
export function buildClientMeal(
  meal: Meal,
  client: Pick<OrderClient, "profile" | "allergies" | "dislikes" | "swapRuleIds" | "addons">,
  md: MealDate,
  data: MenuData,
  s: BuildSettings,
): OrderMealDraft {
  const portions = data.portions[client.profile] ?? {};
  const rules = data.swapRules.filter((r) => client.swapRuleIds.includes(r.id));
  const replacementMeals: Record<string, ResolvedMeal> = {};
  for (const r of rules) {
    if (!r.toMealId) continue;
    const m = data.meals.find((x) => x.id === r.toMealId);
    if (m) replacementMeals[m.id] = resolveMeal(m, portions);
  }
  const resolved = applySwaps(resolveMeal(meal, portions), rules, client.addons, {
    ingredients: data.ingredients,
    replacementMeals,
    roundGramsTo: s.roundGramsTo ?? 5,
    extraProteinGrams: s.pricing?.extraProteinGrams ?? 50,
  });
  const macros = roundMacros(mealMacros(resolved, data.ingredients));
  const conflicts = findConflicts(client.allergies, client.dislikes, resolved, data.ingredients);
  return {
    serviceDate: md.serviceDate,
    mealId: resolved.mealId,
    mealCode: resolved.mealCode,
    mealName: resolved.mealName,
    slot: resolved.slot,
    profile: client.profile,
    items: resolved.items,
    kcal: macros.kcal,
    proteinG: macros.proteinG,
    carbG: macros.carbG,
    fatG: macros.fatG,
    conflicts: conflicts.map(conflictText),
    conflictDetails: conflicts,
    cookDate: md.cookDate,
    eatBy: eatBy(md.cookDate, isShortShelfLife(resolved.items, data.ingredients), s.schedule),
  };
}

/** Order days for the given meal dates (shared by the weekly lock and quick start). */
export function buildOrderDays(client: OrderClient, mealDates: MealDate[], data: MenuData, s: BuildSettings): OrderDayDraft[] {
  const aligned = alignToDrops(client.deliveryOption, mealDates);
  return aligned.map((md) => ({
    serviceDate: md.serviceDate,
    cookDate: md.cookDate,
    dropDate: md.dropDate,
    menu: md.menu,
    meals: sortBySlot(data.meals.filter((m) => m.menu === md.menu)).map((m) => buildClientMeal(m, client, md, data, s)),
  }));
}

export type LockClient = OrderClient & {
  subscription: { id: string; status: SubscriptionStatus; startDate: DateStr; endDate: DateStr };
  pauses: Pause[];
  /** paid invoices (any kind) */
  paidInvoices: InvoiceRange[];
  /** service dates that already have an order day (e.g. from quick start); they are not rebuilt */
  existingServiceDates?: DateStr[];
};

export type LockedOrder = {
  clientId: string;
  subscriptionId: string;
  weekStart: DateStr;
  profile: Profile;
  deliveryOption: DeliveryOption;
  status: OrderStatus;
  skipReason: string | null;
  days: OrderDayDraft[];
};

export type LockWeekInput = {
  weekStart: DateStr;
  clients: LockClient[];
  data: MenuData;
  settings: BuildSettings;
};

/**
 * The Thursday lock for weekStart. Per client:
 * - subscriptions that are cancelled / ended, or whose dates miss the week, are left out;
 * - a paused week -> status paused, no days;
 * - only meal days covered by a paid invoice are cooked; none covered -> skipped_unpaid;
 * - days that already have an order day (quick start) are not rebuilt; a client with nothing left is left out.
 */
export function lockWeek(i: LockWeekInput): { orders: LockedOrder[]; summary: { locked: number; skippedUnpaid: number; paused: number; meals: number } } {
  const week = weekStartOf(i.weekStart);
  const weekEnd = addDays(week, 6);
  const allDates = mealDatesForWeek(week, i.settings.schedule);
  const orders: LockedOrder[] = [];
  for (const c of i.clients) {
    const sub = c.subscription;
    if (sub.status === "cancelled" || sub.status === "ended") continue;
    if (sub.endDate < week || sub.startDate > weekEnd) continue;
    const inSub = allDates.filter((md) => md.serviceDate >= sub.startDate && md.serviceDate <= sub.endDate);
    const existing = new Set(c.existingServiceDates ?? []);
    const todo = inSub.filter((md) => !existing.has(md.serviceDate));
    if (todo.length === 0) continue;
    const base = { clientId: c.clientId, subscriptionId: sub.id, weekStart: week, profile: c.profile, deliveryOption: c.deliveryOption };
    if (isPausedWeek(c.pauses, week)) {
      orders.push({ ...base, status: "paused", skipReason: "Paused this week", days: [] });
      continue;
    }
    const covered = coveredDates(c.paidInvoices, todo.map((m) => m.serviceDate));
    const paidDates = todo.filter((md) => covered.has(md.serviceDate));
    if (paidDates.length === 0) {
      orders.push({ ...base, status: "skipped_unpaid", skipReason: "No confirmed payment covers this week", days: [] });
      continue;
    }
    orders.push({ ...base, status: "locked", skipReason: null, days: buildOrderDays(c, paidDates, i.data, i.settings) });
  }
  const count = (st: OrderStatus) => orders.filter((o) => o.status === st).length;
  return {
    orders,
    summary: {
      locked: count("locked"),
      skippedUnpaid: count("skipped_unpaid"),
      paused: count("paused"),
      meals: orders.reduce((s, o) => s + o.days.reduce((t, d) => t + d.meals.length, 0), 0),
    },
  };
}
