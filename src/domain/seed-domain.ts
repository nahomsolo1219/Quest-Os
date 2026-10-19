// Converts the seed reference data (seed-data.ts) into domain types, with ids = slugs / meal codes.
// Used by domain tests and by anything that needs the standard menu without a database (e.g. demo maths).
import { SEED_INGREDIENTS, SEED_MEALS, SEED_SWAP_RULES } from "./seed-data";
import type { Ingredient, Meal, MenuCode } from "./types";
import type { SwapRule } from "./swaps";

/** Ingredients with id = slug. prices: slug -> birr per purchase unit (missing = null). */
export function seedIngredients(prices: Record<string, number | null> = {}): Ingredient[] {
  return SEED_INGREDIENTS.map((s) => ({
    id: s.slug,
    name: s.name,
    foodGroup: s.foodGroup,
    purchaseUnit: s.purchaseUnit,
    gramsPerUnit: s.gramsPerUnit,
    nutritionBasis: s.nutritionBasis,
    kcal: s.kcal,
    proteinG: s.proteinG,
    carbG: s.carbG,
    fatG: s.fatG,
    costPerUnitBirr: prices[s.slug] ?? null,
    stockIngredientId: s.stockSlug ?? null,
    trackedInStock: s.trackedInStock,
    shortShelfLife: s.shortShelfLife,
    isSeasoning: s.isSeasoning,
  }));
}

/** Meals with id = code and part ids `${code}:${index}`. */
export function seedMeals(): Meal[] {
  return SEED_MEALS.map((m) => ({
    id: m.code,
    code: m.code,
    menu: m.menu,
    slot: m.slot,
    name: m.name,
    description: m.description,
    keepsDays: m.keepsDays,
    parts: m.parts.map((p, i) => ({
      id: `${m.code}:${i}`,
      mealId: m.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      baseQty: p.baseQty,
      sort: i,
      ingredients: p.ingredients.map(([slug, qty]) => ({ ingredientId: slug, qty })),
    })),
  }));
}

export function seedMenuDay(menu: MenuCode, meals: Meal[] = seedMeals()): Meal[] {
  return meals.filter((m) => m.menu === menu);
}

export function seedSwapRules(): SwapRule[] {
  return SEED_SWAP_RULES.map((r, i) => ({
    id: r.code,
    code: r.code,
    label: r.label,
    fromKind: r.fromKind,
    fromIngredientIds: r.fromIngredientSlugs,
    fromMealCodes: r.fromMealCodes,
    fromSlot: r.fromSlot,
    toIngredientId: r.toIngredientSlug,
    toIngredientSplit: r.toIngredientSplit ?? null,
    toMealId: r.toMealCode,
    qtyMode: r.qtyMode,
    qtyValue: r.qtyValue,
    costMode: r.costMode,
    active: true,
    sort: i,
  }));
}
