// Pricing formula (SPEC document 6), reproduced exactly.
import { addMonths } from "./time";
import { roundToNearest } from "./money";
import { ingredientUse, mealCost, type IngredientIndex } from "./recipes";
import type { PricingSettings } from "./settings";
import type { DateStr, DeliveryOption, ResolvedMeal } from "./types";

export type PriceInput = {
  /** the client's rotation week: one entry per menu day (7), each the day's meals after profile portions, swaps and add-ons */
  weekMenu: ResolvedMeal[][];
  ingredients: IngredientIndex;
  settings: PricingSettings;
  deliveryOption: DeliveryOption;
  /** package plan_service_fee per month (default 0) */
  serviceFeeMonthBirr: number;
};

export type PriceLine = { ingredientId: string; name: string; foodGroup: string; qtyPerWeek: number; costWeek: number; bufferedWeek: number };

export type PriceBreakdown = {
  ok: true;
  foodDay: number;
  bufferedFoodDay: number;
  deliveryDay: number;
  consultDay: number;
  fixedDay: number;
  /** unrounded price per service day */
  priceDay: number;
  /** price_day rounded to whole birr (stored as price_day_birr) */
  priceDayBirr: number;
  priceMonth: number;
  planPrice: number;
  lines: PriceLine[];
};

export type PriceResult = PriceBreakdown | { ok: false; missing: string[] };

/**
 * food_day        = Σ over the week's menu days of ingredient cost ÷ menu days per week (7)
 * buffered_food   = Σ over ingredients of cost × (1 + buffer[food_group])
 * delivery_day    = drops_per_month × drop_cost ÷ service_days_per_month
 * consult_day     = consult_per_month ÷ service_days_per_month
 * fixed_day       = fixed_costs_per_month ÷ (capacity_clients × service_days_per_month)
 * price_day       = (buffered_food_day + delivery_day + consult_day + fixed_day) ÷ (1 − margin_floor)
 * price_month     = round_to_nearest(price_day × service_days_per_month, 100)
 * plan_price      = price_month + plan_service_fee[package]
 * Any ingredient without a price -> { ok: false, missing } (a client price cannot be published).
 */
export function priceClient(i: PriceInput): PriceResult {
  const s = i.settings;
  const allItems = i.weekMenu.flatMap((day) => day.flatMap((m) => m.items));
  const uses = ingredientUse(allItems, i.ingredients);
  const cost = mealCost(uses, i.ingredients, s.buffers);
  if (cost.missing.length) return { ok: false, missing: cost.missing };

  const days = s.menuDaysPerWeek;
  return {
    ok: true,
    foodDay: cost.costBirr! / days,
    ...priceFromFoodDay(cost.bufferedBirr! / days, i.deliveryOption, i.serviceFeeMonthBirr, s),
    lines: cost.lines.map((l) => ({
      ingredientId: l.ingredientId,
      name: l.name,
      foodGroup: i.ingredients[l.ingredientId].foodGroup,
      qtyPerWeek: l.qty,
      costWeek: l.costBirr!,
      bufferedWeek: l.bufferedBirr!,
    })),
  };
}

/** Same formula from a known buffered food cost per day (used by the calculator's indicative price and tests). */
export function priceFromFoodDay(
  bufferedFoodDay: number,
  deliveryOption: DeliveryOption,
  serviceFeeMonthBirr: number,
  s: PricingSettings,
): Omit<PriceBreakdown, "ok" | "foodDay" | "lines"> {
  const deliveryDay = (s.dropsPerMonth[deliveryOption] * s.dropCostBirr) / s.serviceDaysPerMonth;
  const consultDay = s.consultPerMonthBirr / s.serviceDaysPerMonth;
  const fixedDay = s.fixedCostsPerMonthBirr / (s.capacityClients * s.serviceDaysPerMonth);
  const priceDay = (bufferedFoodDay + deliveryDay + consultDay + fixedDay) / (1 - s.marginFloor);
  const priceMonth = roundToNearest(priceDay * s.serviceDaysPerMonth, s.roundMonthTo);
  return {
    bufferedFoodDay, deliveryDay, consultDay, fixedDay, priceDay,
    priceDayBirr: Math.round(priceDay), priceMonth, planPrice: priceMonth + serviceFeeMonthBirr,
  };
}

/** first_week_quick_start = price_day × service days, rounded to the nearest 10 (quickStartRoundTo). */
export function quickStartAmount(priceDay: number, serviceDays: number, s?: Pick<PricingSettings, "quickStartRoundTo">): number {
  return roundToNearest(priceDay * serviceDays, s?.quickStartRoundTo ?? 10);
}

/**
 * Invoice amount for a billing period (DECISIONS D021): a full month = plan price − monthly discount;
 * any other period = round to nearest 10 of (plan price − discount) × service days ÷ service days per month.
 */
export function periodAmount(
  i: { planPriceBirr: number; discountMonthBirr?: number; serviceDays: number; isFullMonth: boolean },
  s: Pick<PricingSettings, "serviceDaysPerMonth">,
): number {
  const monthly = i.planPriceBirr - (i.discountMonthBirr ?? 0);
  if (i.isFullMonth) return monthly;
  return roundToNearest((monthly * i.serviceDays) / s.serviceDaysPerMonth, 10);
}

/** Price is locked for priceLockMonths (default 4) from the subscription start. */
export function priceLockedUntil(start: DateStr, months = 4): DateStr {
  return addMonths(start, months);
}
