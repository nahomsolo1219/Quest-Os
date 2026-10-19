import { describe, expect, it } from "vitest";
import {
  baseMealMacros, indexIngredients, ingredientMacros, ingredientUse, isShortShelfLife, lineCost, mealCost, partMacros, resolveMeal, roundMacros, sumMacros,
} from "./recipes";
import { seedIngredients, seedMeals } from "./seed-domain";
import { SEED_MEALS } from "./seed-data";
import { DEFAULT_PRICING } from "./settings";

const ING = indexIngredients(seedIngredients());
const MEALS = seedMeals();
const meal = (code: string) => MEALS.find((m) => m.code === code)!;

/**
 * Base macros of every seeded meal, calculated by hand from SPEC document 5 (per 100 g, or per piece).
 *
 * A_BREAKFAST: oats 50 g (194.5 kcal, P 8.5, C 33, F 3.5) + 1 egg (72, 6.3, 0.4, 4.8) + 3 egg whites (51, 10.8, 0.6, 0)
 *   + Greek yogurt 100 g (97, 9, 4, 5) + banana 60 g (53.4, 0.66, 13.8, 0.18) + peanut butter 16 g (94.08, 4, 3.2, 8);
 *   cinnamon / stevia are seasoning (0)  =>  561.98 kcal, P 39.26, C 55, F 21.48
 * A_LUNCH: chicken 130 g (156, 29.9, 0, 3.38) + rice 45 g (162, 3.15, 36, 0.27) + cabbage 120 g (30, 1.56, 7.2, 0.12)
 *   + carrot 80 g (32.8, 0.72, 8, 0.16) + oil 7 g (61.88, 0, 0, 7)  =>  442.68 kcal, P 35.33, C 51.2, F 10.93
 * C_SNACK: oats 30 g (116.7, 5.1, 19.8, 2.1) + peanut butter 16 g (94.08, 4, 3.2, 8) + cocoa 5 g (11.4, 1, 2.9, 0.7);
 *   the milk splash is seasoning (stock only)  =>  222.18 kcal, P 10.1, C 25.9, F 10.8
 * D_DINNER: tilapia 180 g (172.8, 36, 0, 3.06) + potatoes 200 g (154, 4, 34, 0.2) + cauliflower 100 g (25, 1.9, 5, 0.3)
 *   + carrot 50 g (20.5, 0.45, 5, 0.1) + oil 13.5 g (119.34, 0, 0, 13.5)  =>  491.64 kcal, P 42.35, C 44, F 17.16
 */
const EXPECTED: Record<string, [number, number, number, number]> = {
  A_BREAKFAST: [561.98, 39.26, 55, 21.48],
  A_LUNCH: [442.68, 35.33, 51.2, 10.93],
  A_DINNER: [501.54, 33.08, 39.4, 24.01],
  A_SNACK: [250.25, 17.95, 25.1, 10.95],
  B_BREAKFAST: [431.7, 38.72, 30.57, 16.16],
  B_LUNCH: [508.88, 30.24, 59.88, 16.97],
  B_DINNER: [493.58, 39.56, 53.75, 14.29],
  B_SNACK: [242.1, 12.06, 34, 7.08],
  C_BREAKFAST: [431, 37.26, 34.05, 15.21],
  C_LUNCH: [495.38, 44.12, 49.41, 14.09],
  C_DINNER: [488.5, 36.06, 51.08, 15.84],
  C_SNACK: [222.18, 10.1, 25.9, 10.8],
  D_BREAKFAST: [497.7, 30.27, 58.6, 16.68],
  D_LUNCH: [414.66, 35.021, 46.24, 10.83],
  D_DINNER: [491.64, 42.35, 44, 17.16],
  D_SNACK: [258, 20, 22.76, 10.16],
  SAVORY_SNACK: [159, 13.3, 4.4, 9.7],
};

describe("seeded meal macros", () => {
  it("covers all 17 seeded meals", () => {
    expect(SEED_MEALS).toHaveLength(17);
    expect(Object.keys(EXPECTED).sort()).toEqual(SEED_MEALS.map((m) => m.code).sort());
  });

  it.each(Object.entries(EXPECTED))("%s matches the hand calculation", (code, [kcal, p, c, f]) => {
    const m = baseMealMacros(meal(code), ING);
    expect(m.kcal).toBeCloseTo(kcal, 6);
    expect(m.proteinG).toBeCloseTo(p, 6);
    expect(m.carbG).toBeCloseTo(c, 6);
    expect(m.fatG).toBeCloseTo(f, 6);
  });

  it("base menu days come to roughly 1,640–1,760 kcal", () => {
    const day = (menu: string) => sumMacros(MEALS.filter((m) => m.menu === menu).map((m) => baseMealMacros(m, ING))).kcal;
    expect(day("A")).toBeCloseTo(1756.45, 6);
    expect(day("B")).toBeCloseTo(1676.26, 6);
    expect(day("C")).toBeCloseTo(1637.06, 6);
    expect(day("D")).toBeCloseTo(1662, 6);
  });
});

describe("part and ingredient macros", () => {
  it("per 100 g scales by qty/100, per piece by pieces", () => {
    expect(ingredientMacros(ING["chicken-breast"], 150)).toEqual({ kcal: 180, proteinG: 34.5, carbG: 0, fatG: 3.9000000000000004 });
    expect(ingredientMacros(ING["eggs"], 2).kcal).toBe(144);
    expect(ingredientMacros(ING["egg-white"], 3).kcal).toBe(51); // 17 kcal per white
    expect(ingredientMacros(ING["injera"], 1)).toEqual({ kcal: 180, proteinG: 6, carbG: 36, fatG: 1.2 });
  });

  it("scales a part's ingredients to the portion", () => {
    const veg = meal("A_LUNCH").parts[2]; // cabbage 120 + carrot 80
    const m = partMacros(veg, 300, ING); // × 1.5
    expect(m.kcal).toBeCloseTo((30 + 32.8) * 1.5, 9);
  });

  it("seasoning parts are excluded from macros", () => {
    const season = meal("C_SNACK").parts.find((p) => p.category === "seasoning")!;
    expect(partMacros(season, season.baseQty, ING)).toEqual({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
  });

  it("rounds macros for storage", () => {
    expect(roundMacros({ kcal: 561.98, proteinG: 39.26, carbG: 55, fatG: 21.5 })).toEqual({ kcal: 562, proteinG: 39, carbG: 55, fatG: 22 });
  });
});

describe("ingredient use and cost", () => {
  it("counts egg whites as eggs (one egg per white)", () => {
    const uses = ingredientUse(resolveMeal(meal("A_BREAKFAST")), ING);
    expect(uses.find((u) => u.ingredientId === "eggs")!.qty).toBe(4); // 1 whole egg + 3 whites
    expect(uses.find((u) => u.ingredientId === "egg-white")).toBeUndefined();
  });

  it("trackedOnly keeps stock-tracked seasonings (milk) and drops nothing else here", () => {
    const uses = ingredientUse(resolveMeal(meal("C_SNACK")), ING, { trackedOnly: true });
    expect(uses.find((u) => u.ingredientId === "milk")!.qty).toBe(15);
  });

  it("costs per kg / litre by grams ÷ grams per unit, pieces by count", () => {
    const priced = indexIngredients(seedIngredients({ "cooking-oil": 230, eggs: 12, "chicken-breast": 600 }));
    expect(lineCost(priced["cooking-oil"], 13.5)).toBeCloseTo((13.5 / 920) * 230, 9); // 3.375 birr
    expect(lineCost(priced["eggs"], 4)).toBe(48);
    expect(lineCost(priced["egg-white"], 3, priced)).toBe(36); // priced as eggs
    expect(lineCost(priced["chicken-breast"], 130)).toBeCloseTo(78, 9);
    expect(lineCost(priced["rice"], 45)).toBeNull();
  });

  it("lists missing prices and returns no cost", () => {
    const priced = indexIngredients(seedIngredients({ "chicken-breast": 600, rice: 120 }));
    const r = mealCost(ingredientUse(resolveMeal(meal("A_LUNCH")), priced), priced);
    expect(r.costBirr).toBeNull();
    expect(r.missing).toEqual(["Cabbage", "Carrot", "Cooking oil"]);
  });

  it("applies the food-group buffer per line", () => {
    const priced = indexIngredients(seedIngredients({ "chicken-breast": 600, rice: 120, cabbage: 40, carrot: 50, "cooking-oil": 230 }));
    const r = mealCost(ingredientUse(resolveMeal(meal("A_LUNCH")), priced), priced, DEFAULT_PRICING.buffers);
    // chicken 78 (+15%), rice 5.4 (+5%), cabbage 4.8 (+10%), carrot 4 (+10%), oil 7/920×230 = 1.75 (+10%)
    expect(r.costBirr).toBeCloseTo(78 + 5.4 + 4.8 + 4 + 1.75, 9);
    expect(r.bufferedBirr).toBeCloseTo(78 * 1.15 + 5.4 * 1.05 + 4.8 * 1.1 + 4 * 1.1 + 1.75 * 1.1, 9);
    expect(r.missing).toEqual([]);
  });

  it("short shelf life follows fish and injera", () => {
    expect(isShortShelfLife(resolveMeal(meal("D_DINNER")).items, ING)).toBe(true);
    expect(isShortShelfLife(resolveMeal(meal("C_LUNCH")).items, ING)).toBe(true);
    expect(isShortShelfLife(resolveMeal(meal("A_LUNCH")).items, ING)).toBe(false);
  });
});
