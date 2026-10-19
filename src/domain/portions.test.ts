import { describe, expect, it } from "vitest";
import { clampedRound, computeProfilePortions, portionGroupOf, roundPortion } from "./portions";
import { indexIngredients, itemMacros, resolvePart, sumMacros } from "./recipes";
import { seedIngredients, seedMenuDay } from "./seed-domain";
import { DEFAULT_NUTRITION as N } from "./settings";
import { MENU_CODES, PROFILES } from "./types";
import { sizeAndGoalOf, macroTargets } from "./nutrition";

const ING = indexIngredients(seedIngredients());
const ALL = MENU_CODES.flatMap((menu) => PROFILES.map((profile) => ({ menu, profile })));
const results = ALL.map(({ menu, profile }) => computeProfilePortions({ menu, meals: seedMenuDay(menu) }, profile, ING, N));

/** combinations that cannot meet the tolerances inside the 0.6–1.8 clamp with the seeded recipes */
const EXPECTED_FLAGGED = ["A S_BUILD", "A L_BUILD", "B L_BUILD", "C M_BUILD", "C L_LEAN", "C L_BUILD", "D L_BUILD"];

describe("portion groups and rounding", () => {
  it("maps categories to scaling groups", () => {
    expect(portionGroupOf("protein")).toBe("protein");
    expect(portionGroupOf("dairy")).toBe("protein");
    expect(portionGroupOf("carb")).toBe("carb");
    expect(portionGroupOf("fruit")).toBe("carb");
    expect(portionGroupOf("fat")).toBe("fat");
    expect(portionGroupOf("veg")).toBe("fixed");
    expect(portionGroupOf("sauce")).toBe("fixed");
    expect(portionGroupOf("seasoning")).toBe("untracked");
  });

  it("rounds grams to 5 g and pieces to whole pieces (at least 1)", () => {
    expect(roundPortion(132.4, "g")).toBe(130);
    expect(roundPortion(132.5, "g")).toBe(135);
    expect(roundPortion(1.4, "piece")).toBe(1);
    expect(roundPortion(1.5, "piece")).toBe(2);
    expect(roundPortion(1, "piece")).toBe(1);
    expect(roundPortion(0.6, "piece")).toBe(1);
  });

  it("clamp-aware rounding never leaves 0.6–1.8 × base", () => {
    const oil = seedMenuDay("A")[1].parts[3]; // 7 g oil
    expect(clampedRound(oil, 1.8, N)).toBe(10); // 12.6 would round to 15 (> 1.8 × 7)
    expect(clampedRound(oil, 0.6, N)).toBe(5);
    const egg = seedMenuDay("A")[0].parts[1]; // 1 whole egg
    expect(clampedRound(egg, 1.8, N)).toBe(1); // 2 eggs would be factor 2.0
    const whites = seedMenuDay("A")[0].parts[2]; // 3 whites
    expect(clampedRound(whites, 1.8, N)).toBe(5);
    expect(clampedRound(whites, 0.6, N)).toBe(2);
  });
});

describe("profile portions for all 4 menus × 6 profiles", () => {
  it.each(results.map((r) => [`${r.menu} ${r.profile}`, r] as const))("%s is within tolerance or flagged", (_k, r) => {
    const okKcal = Math.abs(r.deviation.kcal) <= N.kcalTolerance;
    const okMacros = [r.deviation.protein, r.deviation.carb, r.deviation.fat].every((d) => Math.abs(d) <= N.macroTolerance);
    expect(r.flagged).toBe(!(okKcal && okMacros));
    if (r.flagged) expect(r.flagReason).toBeTruthy();
    else expect(r.flagReason).toBeUndefined();
  });

  it("flags exactly the combinations the clamp cannot satisfy", () => {
    expect(results.filter((r) => r.flagged).map((r) => `${r.menu} ${r.profile}`)).toEqual(EXPECTED_FLAGGED);
  });

  it("never exceeds the clamps, for factors and for every rounded part", () => {
    for (const r of results) {
      for (const f of Object.values(r.factors)) {
        expect(f).toBeGreaterThanOrEqual(N.factorMin);
        expect(f).toBeLessThanOrEqual(N.factorMax);
      }
      for (const meal of seedMenuDay(r.menu)) {
        for (const p of meal.parts) {
          const q = r.qtyByPartId[p.id];
          const g = portionGroupOf(p.category);
          if (g === "fixed" || g === "untracked") {
            expect(q).toBe(p.baseQty);
            continue;
          }
          expect(q / p.baseQty).toBeGreaterThanOrEqual(N.factorMin - 1e-9);
          expect(q / p.baseQty).toBeLessThanOrEqual(N.factorMax + 1e-9);
          if (p.unit === "g") expect(q % 5).toBe(0);
          else {
            expect(Number.isInteger(q)).toBe(true);
            expect(q).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it("totals are the macros of the rounded quantities", () => {
    for (const r of results) {
      const parts = seedMenuDay(r.menu).flatMap((m) => m.parts);
      const t = sumMacros(parts.map((p) => itemMacros(resolvePart(p, r.qtyByPartId[p.id]), ING)));
      expect(Math.abs(r.totals.kcal - t.kcal)).toBeLessThanOrEqual(0.051);
      expect(Math.abs(r.totals.proteinG - t.proteinG)).toBeLessThanOrEqual(0.051);
    }
  });

  it("targets come from the size kcal and goal split", () => {
    const r = results.find((x) => x.menu === "B" && x.profile === "M_LEAN")!;
    const { size, goal } = sizeAndGoalOf("M_LEAN");
    expect(r.target.kcal).toBe(N.sizeKcal[size]);
    expect(r.target.proteinG).toBeCloseTo(macroTargets(2100, goal, N).proteinG, 1);
    expect(Math.abs(r.totals.kcal - 2100) / 2100).toBeLessThanOrEqual(0.03);
  });

  it("the unclamped M-Lean menu A scales protein and carbs up and fat down", () => {
    const r = results.find((x) => x.menu === "A" && x.profile === "M_LEAN")!;
    expect(r.factors.protein).toBeGreaterThan(1);
    expect(r.factors.carb).toBeGreaterThan(1);
    expect(r.factors.fat).toBeLessThan(1);
    expect(r.flagged).toBe(false);
    expect(r.clamped).toBe(false);
  });
});

describe("manual overrides", () => {
  it("keeps manual cells and re-solves around them", () => {
    const meals = seedMenuDay("A");
    const chicken = meals[1].parts[0]; // Awaze chicken, 130 g base
    const auto = computeProfilePortions({ menu: "A", meals }, "M_LEAN", ING, N);
    const r = computeProfilePortions({ menu: "A", meals }, "M_LEAN", ING, N, { [chicken.id]: 200 });
    expect(r.qtyByPartId[chicken.id]).toBe(200);
    expect(r.manualPartIds).toEqual([chicken.id]);
    expect(r.computedQtyByPartId[chicken.id]).toBe(auto.qtyByPartId[chicken.id]);
    // more chicken fixed -> the remaining protein parts get a smaller factor
    expect(r.factors.protein).toBeLessThan(auto.factors.protein);
    expect(Math.abs(r.deviation.kcal)).toBeLessThanOrEqual(0.03);
  });

  it("keeps a manual value even outside the clamp (the nutritionist decides)", () => {
    const meals = seedMenuDay("D");
    const oil = meals[2].parts[3];
    const r = computeProfilePortions({ menu: "D", meals }, "S_LEAN", ING, N, { [oil.id]: 30 });
    expect(r.qtyByPartId[oil.id]).toBe(30);
  });
});
