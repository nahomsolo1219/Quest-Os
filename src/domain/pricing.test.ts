import { describe, expect, it } from "vitest";
import { periodAmount, priceClient, priceFromFoodDay, priceLockedUntil, quickStartAmount } from "./pricing";
import { indexIngredients, resolveMeal } from "./recipes";
import { seedIngredients, seedMeals } from "./seed-domain";
import { DEFAULT_PRICING as P, DEFAULT_SCHEDULE } from "./settings";
import { SEED_INGREDIENTS } from "./seed-data";
import { mealDatesForWeek } from "./schedule";
import type { Ingredient, ResolvedMeal } from "./types";

// A scenario with buffered food exactly 1,665 birr a day: one "other" ingredient (buffer 11%) at 1,500 birr/kg,
// 1 kg per menu day -> food_day 1,500, buffered 1,500 × 1.11 = 1,665.
const testIng: Ingredient = {
  id: "x", name: "Test food", foodGroup: "other", purchaseUnit: "kg", gramsPerUnit: 1000, nutritionBasis: "per_100g",
  kcal: 100, proteinG: 0, carbG: 0, fatG: 0, costPerUnitBirr: 1500, stockIngredientId: null, trackedInStock: true, shortShelfLife: false, isSeasoning: false,
};
const dayMeal: ResolvedMeal = {
  mealId: "m", mealCode: "M", mealName: "Test", slot: "lunch",
  items: [{ partId: "p", partName: "Test", category: "carb", unit: "g", qty: 1000, ingredients: [{ ingredientId: "x", qty: 1000 }] }],
};
const week = Array.from({ length: 7 }, () => [dayMeal]);

describe("priceClient — the SPEC document 6 formula", () => {
  it("daily delivery: 58,400 ETB a month", () => {
    const r = priceClient({ weekMenu: week, ingredients: { x: testIng }, settings: P, deliveryOption: "daily", serviceFeeMonthBirr: 0 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.foodDay).toBeCloseTo(1500, 9);
    expect(r.bufferedFoodDay).toBeCloseTo(1665, 9);
    expect(r.deliveryDay).toBeCloseTo(150, 9); // 26 × 150 ÷ 26
    expect(r.consultDay).toBeCloseTo(84.615385, 5); // 2,200 ÷ 26
    expect(r.fixedDay).toBeCloseTo(121.794872, 5); // 38,000 ÷ (12 × 26)
    // (1665 + 150 + 84.615385 + 121.794872) ÷ 0.9 = 2,246.011396
    expect(r.priceDay).toBeCloseTo(2246.011396, 5);
    expect(r.priceDayBirr).toBe(2246);
    // 2,246.011396 × 26 = 58,396.30 -> nearest 100 = 58,400
    expect(r.priceMonth).toBe(58400);
    expect(r.planPrice).toBe(58400);
    expect(r.lines).toEqual([{ ingredientId: "x", name: "Test food", foodGroup: "other", qtyPerWeek: 7000, costWeek: 10500, bufferedWeek: 11655.000000000002 }]);
  });

  it("pick-up: 54,100 ETB; three drops and every 3 days use their drop counts", () => {
    // (1665 + 0 + 84.615385 + 121.794872) ÷ 0.9 = 2,079.344729; × 26 = 54,062.96 -> 54,100
    expect(priceFromFoodDay(1665, "pickup", 0, P).priceMonth).toBe(54100);
    // three drops: delivery_day = 78 × 150 ÷ 26 = 450; (1665 + 450 + 206.410256) ÷ 0.9 × 26 = 67,062.96 -> 67,100
    expect(priceFromFoodDay(1665, "three_drops", 0, P).priceMonth).toBe(67100);
    // every 3 days: 9 × 150 ÷ 26 = 51.923; (1665 + 51.923 + 206.410) ÷ 0.9 × 26 = 55,562.96 -> 55,600
    expect(priceFromFoodDay(1665, "every_3_days", 0, P).priceMonth).toBe(55600);
  });

  it("adds the package service fee to the plan price", () => {
    expect(priceFromFoodDay(1665, "daily", 1500, P).planPrice).toBe(59900);
  });

  it("rounds the month to the nearest 100 (setting)", () => {
    expect(priceFromFoodDay(1665, "daily", 0, { ...P, roundMonthTo: 500 }).priceMonth).toBe(58500);
    expect(priceFromFoodDay(1665, "daily", 0, { ...P, roundMonthTo: 1 }).priceMonth).toBe(58396);
  });

  it("missing prices block the price and list the ingredient names", () => {
    const ing = indexIngredients(seedIngredients({ "chicken-breast": 600 }));
    const lunch = resolveMeal(seedMeals().find((m) => m.code === "A_LUNCH")!);
    const r = priceClient({ weekMenu: [[lunch]], ingredients: ing, settings: P, deliveryOption: "daily", serviceFeeMonthBirr: 0 });
    expect(r).toEqual({ ok: false, missing: ["Cabbage", "Carrot", "Cooking oil", "Rice"] });
  });

  it("prices the full seeded menu once every ingredient has a price (egg whites priced as eggs)", () => {
    const prices = Object.fromEntries(SEED_INGREDIENTS.map((s) => [s.slug, s.purchaseUnit === "piece" ? 15 : 300]));
    delete prices["egg-white"]; // never needs its own price
    const ing = indexIngredients(seedIngredients(prices));
    const meals = seedMeals();
    const weekMenu = mealDatesForWeek("2026-10-26", DEFAULT_SCHEDULE).map((d) => meals.filter((m) => m.menu === d.menu).map((m) => resolveMeal(m)));
    expect(weekMenu).toHaveLength(7);
    const r = priceClient({ weekMenu, ingredients: ing, settings: P, deliveryOption: "daily", serviceFeeMonthBirr: 0 });
    if (!r.ok) throw new Error(`missing ${r.missing}`);
    expect(r.priceMonth % 100).toBe(0);
    expect(r.lines.find((l) => l.ingredientId === "egg-white")).toBeUndefined();
    const eggs = r.lines.find((l) => l.ingredientId === "eggs")!;
    // eggs per rotation week: A (1+3+1) ×2 days, B (2+4+1) ×2, C (2+2) ×2, D 1 = 10 + 14 + 8 + 1 = 33
    expect(eggs.qtyPerWeek).toBe(33);
    expect(eggs.bufferedWeek).toBeCloseTo(33 * 15 * 1.1, 9);
  });
});

describe("quick start, periods and price lock", () => {
  it("quick start = price_day × service days, nearest 10", () => {
    expect(quickStartAmount(2246.011396, 5)).toBe(11230); // 11,230.06
    expect(quickStartAmount(2246.011396, 7)).toBe(15720); // 15,722.08
    expect(quickStartAmount(2246.5, 1)).toBe(2250);
  });

  it("period amounts (D021)", () => {
    expect(periodAmount({ planPriceBirr: 58400, serviceDays: 26, isFullMonth: true }, P)).toBe(58400);
    expect(periodAmount({ planPriceBirr: 58400, discountMonthBirr: 2000, serviceDays: 27, isFullMonth: true }, P)).toBe(56400);
    // weekly: 58,400 × 6 ÷ 26 = 13,476.92 -> 13,480
    expect(periodAmount({ planPriceBirr: 58400, serviceDays: 6, isFullMonth: false }, P)).toBe(13480);
    // partial with discount: (58,400 − 2,600) × 4 ÷ 26 = 8,584.6 -> 8,580
    expect(periodAmount({ planPriceBirr: 58400, discountMonthBirr: 2600, serviceDays: 4, isFullMonth: false }, P)).toBe(8580);
  });

  it("price is locked for 4 months from the start", () => {
    expect(priceLockedUntil("2026-10-26")).toBe("2027-02-26");
    expect(priceLockedUntil("2026-10-31")).toBe("2027-02-28");
    expect(priceLockedUntil("2026-10-26", 2)).toBe("2026-12-26");
  });
});
