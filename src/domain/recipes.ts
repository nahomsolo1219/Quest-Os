// Recipes: macros, ingredient use and cost of parts and meals, computed from ingredient data (SPEC docs 3-5).
import type { PricingSettings } from "./settings";
import type { Ingredient, Macros, Meal, Part, PartCategory, ResolvedItem, ResolvedMeal, Slot } from "./types";

export type IngredientIndex = Record<string, Ingredient>;
export type QtyByPartId = Record<string, number>;
export type IngredientQty = { ingredientId: string; qty: number };

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
export const SLOT_ORDER: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

export function indexIngredients(list: Ingredient[]): IngredientIndex {
  return Object.fromEntries(list.map((i) => [i.id, i]));
}

function getIngredient(ingredients: IngredientIndex, id: string): Ingredient {
  const ing = ingredients[id];
  if (!ing) throw new Error(`Unknown ingredient ${id}`);
  return ing;
}

export function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(addMacros, ZERO_MACROS);
}

export function scaleMacros(m: Macros, f: number): Macros {
  return { kcal: m.kcal * f, proteinG: m.proteinG * f, carbG: m.carbG * f, fatG: m.fatG * f };
}

/** Whole kcal and whole grams (what order_meals and labels store). */
export function roundMacros(m: Macros): Macros {
  return { kcal: Math.round(m.kcal), proteinG: Math.round(m.proteinG), carbG: Math.round(m.carbG), fatG: Math.round(m.fatG) };
}

/** per_100g: qty/100 × value; per_piece: pieces × value. */
export function ingredientMacros(ing: Ingredient, qty: number): Macros {
  const f = ing.nutritionBasis === "per_piece" ? qty : qty / 100;
  return { kcal: ing.kcal * f, proteinG: ing.proteinG * f, carbG: ing.carbG * f, fatG: ing.fatG * f };
}

/** Seasoning parts and seasoning ingredients are on the recipe card and in stock, never in macros. */
export function countsForMacros(category: PartCategory, ing: Ingredient): boolean {
  return category !== "seasoning" && !ing.isSeasoning;
}

export function itemMacros(item: Pick<ResolvedItem, "category" | "ingredients">, ingredients: IngredientIndex): Macros {
  let m = ZERO_MACROS;
  for (const pi of item.ingredients) {
    const ing = getIngredient(ingredients, pi.ingredientId);
    if (countsForMacros(item.category, ing)) m = addMacros(m, ingredientMacros(ing, pi.qty));
  }
  return m;
}

/** A part's ingredients scaled to qty (grams or pieces). Ingredient amounts keep one decimal. */
export function partIngredientsAt(part: Part, qty: number): IngredientQty[] {
  const f = part.baseQty > 0 ? qty / part.baseQty : 0;
  return part.ingredients.map((pi) => ({ ingredientId: pi.ingredientId, qty: Math.round(pi.qty * f * 10) / 10 }));
}

export function resolvePart(part: Part, qty: number = part.baseQty): ResolvedItem {
  return {
    partId: part.id,
    partName: part.name,
    category: part.category,
    unit: part.unit,
    qty,
    baseQty: part.baseQty,
    ingredients: partIngredientsAt(part, qty),
  };
}

/** A meal with each part at qtyByPartId[part.id] (default: base recipe). */
export function resolveMeal(meal: Meal, qtyByPartId: QtyByPartId = {}): ResolvedMeal {
  const parts = [...meal.parts].sort((a, b) => a.sort - b.sort);
  return {
    mealId: meal.id,
    mealCode: meal.code,
    mealName: meal.name,
    slot: meal.slot,
    items: parts.map((p) => resolvePart(p, qtyByPartId[p.id] ?? p.baseQty)),
  };
}

export function partMacros(part: Part, qty: number, ingredients: IngredientIndex): Macros {
  return itemMacros(resolvePart(part, qty), ingredients);
}

export function mealMacros(meal: ResolvedMeal, ingredients: IngredientIndex): Macros {
  return sumMacros(meal.items.map((i) => itemMacros(i, ingredients)));
}

/** Macros of a recipe meal at the given part quantities (default base). */
export function baseMealMacros(meal: Meal, ingredients: IngredientIndex, qtyByPartId?: QtyByPartId): Macros {
  return mealMacros(resolveMeal(meal, qtyByPartId), ingredients);
}

/**
 * Ingredient use at stock level: an ingredient with stockIngredientId (egg white) is counted as that
 * ingredient, one piece per piece (each white uses one egg). trackedOnly drops ingredients not tracked in stock.
 */
export function ingredientUse(
  items: Pick<ResolvedItem, "ingredients">[] | ResolvedMeal,
  ingredients: IngredientIndex,
  opts: { trackedOnly?: boolean } = {},
): IngredientQty[] {
  const list = Array.isArray(items) ? items : items.items;
  const totals = new Map<string, number>();
  for (const item of list) {
    for (const pi of item.ingredients) {
      const ing = getIngredient(ingredients, pi.ingredientId);
      const target = ing.stockIngredientId ? getIngredient(ingredients, ing.stockIngredientId) : ing;
      if (opts.trackedOnly && !target.trackedInStock) continue;
      totals.set(target.id, (totals.get(target.id) ?? 0) + pi.qty);
    }
  }
  return [...totals.entries()]
    .map(([ingredientId, qty]) => ({ ingredientId, qty: Math.round(qty * 10) / 10 }))
    .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
}

/**
 * Cost in (float) birr of qty of an ingredient: piece -> pieces × price; kg/litre -> grams ÷ gramsPerUnit × price.
 * null when the price is missing. Ingredients with stockIngredientId are priced as that ingredient.
 */
export function lineCost(ing: Ingredient, qty: number, ingredients?: IngredientIndex): number | null {
  const priced = ing.stockIngredientId && ingredients ? getIngredient(ingredients, ing.stockIngredientId) : ing;
  if (priced.costPerUnitBirr == null) return null;
  if (priced.purchaseUnit === "piece") return qty * priced.costPerUnitBirr;
  return (qty / priced.gramsPerUnit) * priced.costPerUnitBirr;
}

export type CostLine = { ingredientId: string; name: string; qty: number; costBirr: number | null; bufferedBirr: number | null };
export type CostResult = {
  /** null when any price is missing */
  costBirr: number | null;
  bufferedBirr: number | null;
  lines: CostLine[];
  /** names of ingredients without a price (sorted, unique) */
  missing: string[];
};

/** Cost of stock-level uses (see ingredientUse). Buffers by the ingredient's food group when given. */
export function mealCost(
  uses: IngredientQty[],
  ingredients: IngredientIndex,
  buffers?: PricingSettings["buffers"],
): CostResult {
  const missing = new Set<string>();
  let cost = 0;
  let buffered = 0;
  const lines: CostLine[] = uses.map((u) => {
    const ing = getIngredient(ingredients, u.ingredientId);
    const c = lineCost(ing, u.qty, ingredients);
    if (c == null) {
      missing.add(ing.name);
      return { ingredientId: ing.id, name: ing.name, qty: u.qty, costBirr: null, bufferedBirr: null };
    }
    const b = c * (1 + (buffers?.[ing.foodGroup] ?? 0));
    cost += c;
    buffered += b;
    return { ingredientId: ing.id, name: ing.name, qty: u.qty, costBirr: c, bufferedBirr: b };
  });
  const ok = missing.size === 0;
  return { costBirr: ok ? cost : null, bufferedBirr: ok ? buffered : null, lines, missing: [...missing].sort() };
}

/** True when any ingredient in the items has a short shelf life (fish, injera). */
export function isShortShelfLife(items: Pick<ResolvedItem, "ingredients">[], ingredients: IngredientIndex): boolean {
  return items.some((it) => it.ingredients.some((pi) => getIngredient(ingredients, pi.ingredientId).shortShelfLife));
}

export function sortBySlot<T extends { slot: Slot }>(list: T[]): T[] {
  return [...list].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}
