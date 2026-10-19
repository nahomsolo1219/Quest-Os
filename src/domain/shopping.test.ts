import { describe, expect, it } from "vitest";
import { indexIngredients, resolveMeal } from "./recipes";
import { seedIngredients, seedMeals } from "./seed-domain";
import { requiredIngredients, shoppingList, stockOnHand, toPurchaseUnits } from "./shopping";

const ING = indexIngredients(seedIngredients({ "chicken-breast": 600, eggs: 12, "cooking-oil": 230 }));
const MEALS = seedMeals();
const m = (code: string) => resolveMeal(MEALS.find((x) => x.code === code)!);

describe("required ingredients", () => {
  it("counts egg whites as eggs", () => {
    const r = requiredIngredients([m("A_BREAKFAST"), m("B_BREAKFAST")], ING);
    expect(r.eggs).toBe(4 + 6); // (1 + 3 whites) + (2 + 4 whites)
    expect(r["egg-white"]).toBeUndefined();
  });
  it("includes seasonings tracked in stock (milk, stevia)", () => {
    const r = requiredIngredients([m("C_SNACK")], ING);
    expect(r.milk).toBe(15);
    expect(r.stevia).toBe(1);
  });
  it("sums across meals", () => {
    const r = requiredIngredients([m("A_LUNCH"), m("A_LUNCH"), m("C_LUNCH")], ING);
    expect(r["chicken-breast"]).toBe(130 * 3);
    expect(r["cooking-oil"]).toBe(21);
  });
});

describe("stock on hand", () => {
  it("last count + purchases − waste − usage, never negative", () => {
    expect(stockOnHand({ lastCount: 2000, purchasesSince: 5000, wasteSince: 300, usedSince: 1200 })).toBe(5500);
    expect(stockOnHand({ lastCount: 100, purchasesSince: 0, wasteSince: 50, usedSince: 500 })).toBe(0);
  });
});

describe("shopping list", () => {
  it("subtracts stock and never goes negative", () => {
    const req = { "chicken-breast": 5230, eggs: 40, rice: 900, "cooking-oil": 300 };
    const r = shoppingList(req, { "chicken-breast": 1000, eggs: 55, rice: -20 }, ING);
    const line = (id: string) => r.lines.find((l) => l.ingredientId === id);
    expect(line("chicken-breast")).toMatchObject({ needQty: 5230, onHand: 1000, buyQty: 4230, buyUnits: 4.3, unit: "kg", costBirr: 2580 });
    expect(line("eggs")).toBeUndefined(); // 55 on hand covers 40
    expect(line("rice")).toMatchObject({ onHand: 0, buyQty: 900, buyUnits: 0.9, costBirr: null });
    // oil: 300 g ÷ 920 g per litre = 0.326 -> 0.4 litre × 230 = 92
    expect(line("cooking-oil")).toMatchObject({ buyUnits: 0.4, unit: "litre", costBirr: 92 });
    expect(r.missingPrices).toEqual(["Rice"]);
    expect(r.totalBirr).toBe(2580 + 92);
    expect(r.lines.every((l) => l.buyQty >= 0)).toBe(true);
    const all = shoppingList(req, { eggs: 55 }, ING, { includeCovered: true });
    expect(all.lines.find((l) => l.ingredientId === "eggs")).toMatchObject({ buyQty: 0, buyUnits: 0, costBirr: 0 });
  });

  it("rounds purchase units up: 0.1 kg / litre, whole pieces", () => {
    expect(toPurchaseUnits(1001, "kg", 1000)).toBe(1.1);
    expect(toPurchaseUnits(1000, "kg", 1000)).toBe(1);
    expect(toPurchaseUnits(920, "litre", 920)).toBe(1);
    expect(toPurchaseUnits(15, "litre", 1030)).toBe(0.1);
    expect(toPurchaseUnits(3.2, "piece", 50)).toBe(4);
    expect(toPurchaseUnits(0, "kg", 1000)).toBe(0);
  });
});
