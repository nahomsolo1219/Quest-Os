// Client price quotes: the domain pricing formula over the client's 7-day rotation week (profile portions,
// swaps and add-ons). Missing ingredient prices block a quote (PLN-06).
import { eq } from "drizzle-orm";
import { packages } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { buildClientMeal, type MenuData } from "@/domain/orders";
import { priceClient, type PriceResult } from "@/domain/pricing";
import type { AllSettings } from "@/domain/settings";
import { menuForDate, type MealDate } from "@/domain/schedule";
import { applyAddons, extraProteinPrice } from "@/domain/swaps";
import { lineCost, resolveMeal, sortBySlot } from "@/domain/recipes";
import { addDays, weekStartOf } from "@/domain/time";
import type { DateStr, DeliveryOption, Profile, ResolvedMeal, Slot } from "@/domain/types";
import { ServiceError } from "./context";
import { loadMenuData } from "./menu-data";
import { loadSettings } from "./settings";

export type QuoteInput = {
  profile: Profile;
  deliveryOption: DeliveryOption;
  packageId: string;
  swapRuleIds?: string[];
  addonSlots?: Slot[];
  allergies?: string[];
  dislikes?: string[];
};

/** The client's rotation week (7 menu days by weekday), resolved at their profile with swaps and add-ons. */
export function rotationWeek(data: MenuData, settings: AllSettings, q: Omit<QuoteInput, "packageId" | "deliveryOption">, anyDate: DateStr): ResolvedMeal[][] {
  const monday = weekStartOf(anyDate);
  const week: ResolvedMeal[][] = [];
  for (let i = 0; i < settings.pricing.menuDaysPerWeek && i < 7; i++) {
    const date = addDays(monday, i);
    const md: MealDate = { serviceDate: date, cookDate: date, dropDate: date, menu: menuForDate(date, settings.schedule) };
    const dayMeals = sortBySlot(data.meals.filter((m) => m.menu === md.menu));
    week.push(dayMeals.map((m) => {
      const draft = buildClientMeal(m, {
        profile: q.profile, allergies: q.allergies ?? [], dislikes: q.dislikes ?? [], swapRuleIds: q.swapRuleIds ?? [],
        addons: (q.addonSlots ?? []).map((slot) => ({ kind: "extra_protein" as const, slot })),
      }, md, data, { schedule: settings.schedule, pricing: settings.pricing, roundGramsTo: settings.nutrition.roundGramsTo });
      return { mealId: draft.mealId, mealCode: draft.mealCode, mealName: draft.mealName, slot: draft.slot, items: draft.items };
    }));
  }
  return week;
}

export async function quotePrice(db: DbOrTx, q: QuoteInput, today: DateStr): Promise<PriceResult> {
  const [data, settings] = await Promise.all([loadMenuData(db), loadSettings(db)]);
  const [pkg] = await db.select().from(packages).where(eq(packages.id, q.packageId));
  if (!pkg) throw new ServiceError("Choose a package.");
  // Swaps marked "0" extra cost in the swap table do not change the price; only price-difference swaps (and add-ons) do.
  const priced = { ...q, swapRuleIds: (q.swapRuleIds ?? []).filter((id) => data.swapRules.find((r) => r.id === id)?.costMode === "price_difference") };
  return priceClient({
    weekMenu: rotationWeek(data, settings, priced, today),
    ingredients: data.ingredients,
    settings: settings.pricing,
    deliveryOption: q.deliveryOption,
    serviceFeeMonthBirr: pkg.serviceFeeMonthBirr,
  });
}

/**
 * Price per portion of the extra-protein add-on for a slot at a profile (SWP-07): the add-on's ingredient cost
 * × (1 + buffer) ÷ (1 − margin floor), rounded up to 10 ETB. The meal in a slot changes with the rotation, so the
 * cost is averaged over the 7 rotation days. Null when a needed price is missing or the slot has no protein.
 */
export async function extraProteinQuote(db: DbOrTx, profile: Profile, slot: Slot, today: DateStr): Promise<number | null> {
  const [data, settings] = await Promise.all([loadMenuData(db), loadSettings(db)]);
  const monday = weekStartOf(today);
  const costs: number[] = [];
  for (let i = 0; i < 7; i++) {
    const menu = menuForDate(addDays(monday, i), settings.schedule);
    const meal = data.meals.find((m) => m.menu === menu && m.slot === slot);
    if (!meal) continue;
    const withAddon = applyAddons(resolveMeal(meal, data.portions[profile] ?? {}), [{ kind: "extra_protein", slot }],
      { ingredients: data.ingredients, extraProteinGrams: settings.pricing.extraProteinGrams });
    const item = withAddon.items.find((it) => it.source?.code === "extra_protein");
    if (!item) continue;
    let buffered = 0;
    for (const pi of item.ingredients) {
      const ing = data.ingredients[pi.ingredientId];
      const cost = ing ? lineCost(ing, pi.qty, data.ingredients) : null;
      if (cost == null) return null;
      const group = data.ingredients[ing.stockIngredientId ?? ing.id]?.foodGroup ?? ing.foodGroup;
      buffered += cost * (1 + settings.pricing.buffers[group]);
    }
    costs.push(buffered);
  }
  if (costs.length === 0) return null;
  const avg = costs.reduce((x, y) => x + y, 0) / costs.length;
  return extraProteinPrice(avg, 0, settings.pricing.marginFloor);
}
