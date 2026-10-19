import { describe, expect, it } from "vitest";
import { indexIngredients, mealCost, ingredientUse, resolveMeal } from "./recipes";
import { seedIngredients, seedMeals, seedSwapRules } from "./seed-domain";
import {
  applyAddons, applySwaps, checkSwapRequest, conflictText, conflictWords, countStandingSwaps, extraProteinPrice, findConflicts,
  mainProteinItem, swapActiveInWeek, swapTouchesMeal, termMatches, type ClientSwap,
} from "./swaps";

const ING = indexIngredients(seedIngredients());
const MEALS = seedMeals();
const RULES = seedSwapRules();
const meal = (code: string, qty?: Record<string, number>) => resolveMeal(MEALS.find((m) => m.code === code)!, qty);
const rule = (code: string) => RULES.find((r) => r.code === code)!;
const ctx = { ingredients: ING, replacementMeals: { SAVORY_SNACK: meal("SAVORY_SNACK") } };

describe("applySwaps", () => {
  it("same grams: tilapia -> chicken breast", () => {
    const out = applySwaps(meal("D_DINNER"), [rule("TILAPIA_TO_CHICKEN")], [], ctx);
    const item = out.items.find((i) => i.partId === "D_DINNER:0")!;
    expect(item.ingredients).toEqual([{ ingredientId: "chicken-breast", qty: 180 }]);
    expect(item.qty).toBe(180);
    expect(item.partName).toBe("Tilapia → Chicken breast");
    expect(item.source).toEqual({ kind: "swap", code: "TILAPIA_TO_CHICKEN" });
  });

  it("matches any of several ingredients: lean beef (diced or minced) -> chicken", () => {
    const a = applySwaps(meal("A_DINNER"), [rule("BEEF_TO_CHICKEN")], [], ctx);
    const c = applySwaps(meal("C_DINNER"), [rule("BEEF_TO_CHICKEN")], [], ctx);
    expect(a.items[0].ingredients[0].ingredientId).toBe("chicken-breast");
    expect(c.items[1].ingredients).toEqual([{ ingredientId: "chicken-breast", qty: 100 }]);
  });

  it("fixed amount scales with the profile: injera (1 piece) -> rice 45 g, 2 pieces -> 90 g", () => {
    const base = applySwaps(meal("C_LUNCH"), [rule("INJERA_TO_RICE")], [], ctx);
    const inj = base.items.find((i) => i.partId === "C_LUNCH:2")!;
    expect(inj).toMatchObject({ unit: "g", qty: 45, ingredients: [{ ingredientId: "rice", qty: 45 }] });
    const big = applySwaps(meal("C_LUNCH", { "C_LUNCH:2": 2 }), [rule("INJERA_TO_RICE")], [], ctx);
    expect(big.items.find((i) => i.partId === "C_LUNCH:2")!.qty).toBe(90);
    // rice 60 g at a 1.333 profile ratio: 150 g × 60/45 = 200 g potatoes
    const rice = applySwaps(meal("A_LUNCH", { "A_LUNCH:1": 60 }), [rule("RICE_TO_POTATOES")], [], ctx);
    expect(rice.items[1].ingredients).toEqual([{ ingredientId: "potatoes", qty: 200 }]);
  });

  it("multiply: feta 20 g -> ayib 40 g", () => {
    const out = applySwaps(meal("B_BREAKFAST"), [rule("CHEESE_TO_AYIB")], [], ctx);
    expect(out.items.find((i) => i.partId === "B_BREAKFAST:3")!.ingredients).toEqual([{ ingredientId: "ayib", qty: 40 }]);
  });

  it("add: no beans -> +60 g lean minced beef, beans removed", () => {
    const out = applySwaps(meal("B_LUNCH"), [rule("BEANS_TO_BEEF")], [], ctx);
    expect(out.items.some((i) => i.ingredients.some((pi) => pi.ingredientId === "dry-beans"))).toBe(false);
    const extra = out.items.find((i) => i.source?.code === "BEANS_TO_BEEF")!;
    expect(extra).toMatchObject({ category: "protein", unit: "g", qty: 60, ingredients: [{ ingredientId: "lean-minced-beef", qty: 60 }] });
    // scaled with the beans' profile ratio (50/40) and rounded to 5 g: 75
    const scaled = applySwaps(meal("B_LUNCH", { "B_LUNCH:1": 50 }), [rule("BEANS_TO_BEEF")], [], ctx);
    expect(scaled.items.find((i) => i.source?.code === "BEANS_TO_BEEF")!.qty).toBe(75);
  });

  it("restricted rules only touch their meals", () => {
    const fake = { ...meal("B_LUNCH"), mealCode: "OTHER" };
    expect(applySwaps(fake, [rule("BEANS_TO_BEEF")], [], ctx).items).toEqual(fake.items);
    expect(swapTouchesMeal(rule("BEANS_TO_BEEF"), meal("B_LUNCH"))).toBe(true);
    expect(swapTouchesMeal(rule("BEANS_TO_BEEF"), meal("A_LUNCH"))).toBe(false);
  });

  it("split replacement: gomen 170 g -> cabbage 102 g + carrot 68 g, onion kept", () => {
    const out = applySwaps(meal("C_LUNCH"), [rule("GOMEN_TO_MIXED_VEG")], [], ctx);
    const veg = out.items.find((i) => i.partId === "C_LUNCH:1")!;
    expect(veg.ingredients).toEqual([
      { ingredientId: "onion", qty: 30 },
      { ingredientId: "cabbage", qty: 102 },
      { ingredientId: "carrot", qty: 68 },
    ]);
    expect(veg.qty).toBe(200);
  });

  it("slot rule replaces the sweet snack with the savory snack", () => {
    const out = applySwaps(meal("A_SNACK"), [rule("SWEET_TO_SAVORY_SNACK")], [], ctx);
    expect(out.mealId).toBe("SAVORY_SNACK");
    expect(out.slot).toBe("snack");
    expect(out.items.every((i) => i.source?.code === "SWEET_TO_SAVORY_SNACK")).toBe(true);
    // not applied to other slots
    expect(applySwaps(meal("A_LUNCH"), [rule("SWEET_TO_SAVORY_SNACK")], [], ctx).mealId).toBe("A_LUNCH");
  });

  it("an item made by a swap is not swapped again", () => {
    const out = applySwaps(meal("D_DINNER"), [rule("TILAPIA_TO_CHICKEN"), rule("CHICKEN_TO_BEEF")], [], ctx);
    expect(out.items[0].ingredients[0].ingredientId).toBe("chicken-breast");
  });

  it("inactive rules are ignored", () => {
    const off = { ...rule("TILAPIA_TO_CHICKEN"), active: false };
    expect(applySwaps(meal("D_DINNER"), [off], [], ctx).items[0].ingredients[0].ingredientId).toBe("tilapia-fillet");
  });
});

describe("add-ons", () => {
  it("extra protein adds 50 g of the meal's main protein", () => {
    const out = applyAddons(meal("A_DINNER"), [{ kind: "extra_protein", slot: "dinner" }], ctx);
    const extra = out.items.at(-1)!;
    expect(extra).toMatchObject({ qty: 50, ingredients: [{ ingredientId: "lean-beef-diced", qty: 50 }], source: { kind: "addon", code: "extra_protein" } });
    expect(mainProteinItem(meal("A_BREAKFAST"))!.partName).toBe("Greek yogurt"); // eggs are pieces
    expect(applyAddons(meal("A_LUNCH"), [{ kind: "extra_protein", slot: "dinner" }], ctx).items).toHaveLength(4);
  });

  it("follows a protein swap", () => {
    const out = applySwaps(meal("A_DINNER"), [rule("BEEF_TO_CHICKEN")], [{ kind: "extra_protein", slot: "dinner" }], ctx);
    expect(out.items.at(-1)!.ingredients[0].ingredientId).toBe("chicken-breast");
  });

  it("prices extra protein: cost × (1 + buffer) ÷ (1 − margin), up to the nearest 10", () => {
    // 50 g chicken at 600 birr/kg = 30 birr; 30 × 1.15 ÷ 0.9 = 38.33 -> 40
    expect(extraProteinPrice(30, 0.15, 0.1)).toBe(40);
    expect(extraProteinPrice(36, 0.1, 0.1)).toBe(50); // 44
    expect(extraProteinPrice(90, 0, 0.1)).toBe(100); // exactly 100
    const priced = indexIngredients(seedIngredients({ "chicken-breast": 600 }));
    const cost = mealCost([{ ingredientId: "chicken-breast", qty: 50 }], priced).costBirr!;
    expect(extraProteinPrice(cost, 0.15, 0.1)).toBe(40);
  });

  it("price-difference swaps change the food cost", () => {
    const priced = indexIngredients(seedIngredients({ "chicken-breast": 600, "lean-beef-diced": 900, rice: 100, cabbage: 30, carrot: 40, "cooking-oil": 200 }));
    const base = mealCost(ingredientUse(meal("A_LUNCH"), priced), priced).costBirr!;
    const swapped = mealCost(ingredientUse(applySwaps(meal("A_LUNCH"), [rule("CHICKEN_TO_BEEF")], [], ctx), priced), priced).costBirr!;
    expect(swapped - base).toBeCloseTo(0.13 * (900 - 600), 9);
  });
});

describe("swap limits", () => {
  const w = "2026-10-26";
  const sw = (id: string | null, status: ClientSwap["status"] = "approved", eff = "2026-10-19", ended: string | null = null): ClientSwap => ({
    swapRuleId: id, status, effectiveWeekStart: eff, endedWeekStart: ended,
  });

  it("counts table swaps in force for the week", () => {
    const list = [sw("A"), sw("B", "requested"), sw("C", "rejected"), sw("D", "ended"), sw(null), sw("E", "approved", "2026-11-02"), sw("F", "approved", "2026-10-12", "2026-10-26")];
    expect(countStandingSwaps(list, w)).toBe(2);
    expect(swapActiveInWeek(sw("X", "approved", "2026-10-26"), w)).toBe(true);
    expect(swapActiveInWeek(sw("X", "approved", "2026-10-12", "2026-10-26"), w)).toBe(false);
  });

  it.each([
    ["essential", 3],
    ["performance", 6],
    ["premium", 10],
  ] as const)("%s allows %i standing swaps", (_pkg, limit) => {
    const standing = Array.from({ length: limit - 1 }, (_, i) => sw(`R${i}`));
    expect(checkSwapRequest({ swapLimit: limit }, standing, "NEW", w)).toEqual({ ok: true });
    const full = [...standing, sw("LAST")];
    expect(checkSwapRequest({ swapLimit: limit }, full, "NEW", w)).toEqual({ ok: false, reason: "limit" });
  });

  it("a request without a table rule needs the nutritionist; repeats are duplicates", () => {
    expect(checkSwapRequest({ swapLimit: 3 }, [], null, w)).toEqual({ ok: false, reason: "needs_approval" });
    expect(checkSwapRequest({ swapLimit: 3 }, [sw("A")], "A", w)).toEqual({ ok: false, reason: "duplicate" });
    // ended swaps free a slot
    expect(checkSwapRequest({ swapLimit: 1 }, [sw("A", "approved", "2026-10-12", "2026-10-19")], "B", w)).toEqual({ ok: true });
  });
});

describe("allergy and dislike conflicts", () => {
  it("matches ingredient names case-insensitively", () => {
    const c = findConflicts(["Peanut"], [], meal("A_BREAKFAST"), ING);
    expect(c).toContainEqual({ term: "Peanut", kind: "allergy", item: "Peanut butter", on: "ingredient" });
    expect(conflictText(c[0])).toBe("Allergy: Peanut (Peanut butter)");
  });

  it("uses synonyms: fish -> tilapia, nuts -> peanut, dairy -> yogurt / ayib / cheese, egg -> egg whites, gluten -> bread", () => {
    expect(findConflicts(["fish"], [], meal("D_DINNER"), ING).map((c) => c.item)).toContain("Tilapia fillet");
    expect(findConflicts(["nuts"], [], meal("C_SNACK"), ING).map((c) => c.item)).toContain("Peanut butter");
    expect(findConflicts(["dairy"], [], meal("C_LUNCH"), ING).map((c) => c.item)).toContain("Ayib");
    expect(findConflicts(["Dairy"], [], meal("B_DINNER"), ING).map((c) => c.item)).toContain("Mozzarella");
    expect(findConflicts(["egg"], [], meal("B_BREAKFAST"), ING).map((c) => c.item)).toEqual(expect.arrayContaining(["Eggs", "Egg white"]));
    expect(findConflicts(["gluten"], [], meal("B_BREAKFAST"), ING).map((c) => c.item)).toContain("Whole-wheat bread");
    expect(findConflicts([], ["beef"], meal("B_LUNCH"), ING)[0]).toMatchObject({ kind: "dislike", item: "Lean minced beef" });
    expect(findConflicts([], ["beans"], meal("D_LUNCH"), ING).map((c) => c.item)).toContain("Green beans");
  });

  it("does not match inside other words", () => {
    expect(termMatches("nut", "Peanut butter")).toBe(true); // via the synonym peanut
    expect(termMatches("oat", "Goat cheese")).toBe(false);
    expect(termMatches("egg", "Eggplant")).toBe(true); // word start: deliberately over-cautious
    expect(conflictWords("eggs")).toEqual(expect.arrayContaining(["eggs", "egg"]));
    expect(findConflicts(["fish"], ["shellfish"], meal("A_LUNCH"), ING)).toEqual([]);
  });

  it("falls back to the meal name", () => {
    expect(findConflicts([], ["chili"], meal("B_LUNCH"), ING)).toEqual([{ term: "chili", kind: "dislike", item: "Beef and bean chili with rice", on: "meal" }]);
  });

  it("a swap clears the conflict", () => {
    const swapped = applySwaps(meal("C_SNACK"), [rule("PEANUT_TO_AYIB")], [], ctx);
    expect(findConflicts(["peanut"], [], swapped, ING)).toEqual([]);
    const fish = applySwaps(meal("D_DINNER"), [rule("TILAPIA_TO_CHICKEN")], [], ctx);
    expect(findConflicts(["fish"], [], fish, ING)).toEqual([]);
    const beans = applySwaps(meal("B_LUNCH"), [rule("BEANS_TO_BEEF")], [], ctx);
    expect(findConflicts(["beans"], [], beans, ING)).toEqual([]);
    const chicken = applySwaps(meal("A_LUNCH"), [rule("CHICKEN_TO_BEEF")], [], ctx);
    expect(findConflicts(["chicken"], [], chicken, ING)).toEqual([]);
  });

  it("ignores blank terms and reports allergy and dislike separately", () => {
    const c = findConflicts(["  ", "egg"], ["egg"], meal("A_SNACK"), ING);
    expect([...new Set(c.map((x) => x.kind))]).toEqual(["allergy", "dislike"]);
    expect(c.map((x) => x.item)).toEqual(["Eggs", "Eggs"]); // one line per conflict: the part "Whole egg" adds nothing once "Eggs" matched (D050)
  });
});

describe("pantry allergies (spec review)", () => {
  it("flags an allergy to a pantry item such as garlic", async () => {
    const { findConflicts } = await import("./swaps");
    const meal = { mealId: "m", mealCode: "B_LUNCH", mealName: "Beef and bean chili with rice", slot: "lunch" as const, items: [] };
    const c = findConflicts(["garlic"], [], meal, {}, ["Garlic", "Salt"]);
    expect(c).toEqual([{ term: "garlic", kind: "allergy", item: "Garlic", on: "pantry" }]);
    expect(findConflicts(["garlic"], [], meal, {}, [])).toEqual([]);
  });
});

describe("conflict lines are not duplicated (qa)", () => {
  it("a fish dislike on the tilapia dinner gives one line", async () => {
    const { findConflicts } = await import("./swaps");
    const ing = indexIngredients(seedIngredients());
    const meal = resolveMeal(seedMeals().find((m) => m.code === "D_DINNER")!);
    const c = findConflicts([], ["fish"], meal, ing);
    expect(c).toHaveLength(1);
    expect(c[0].item).toBe("Tilapia fillet");
  });
});
