// Loads reference data (ingredients, meals with parts, swap rules, profile portions) from the
// database into the plain domain types. Server-internal: callers authorize.
import { asc } from "drizzle-orm";
import { ingredients, meals, partIngredients, parts, profilePortions, swapRules } from "@db/schema";
import type { DbOrTx } from "@db/client";
import type { MenuData } from "@/domain/orders";
import { indexIngredients } from "@/domain/recipes";
import type { SwapRule } from "@/domain/swaps";
import type { Ingredient, Meal, Profile } from "@/domain/types";

export async function loadIngredients(db: DbOrTx): Promise<Ingredient[]> {
  const rows = await db.select().from(ingredients).orderBy(asc(ingredients.name));
  return rows.map((r) => ({
    id: r.id, name: r.name, foodGroup: r.foodGroup, purchaseUnit: r.purchaseUnit, gramsPerUnit: r.gramsPerUnit,
    nutritionBasis: r.nutritionBasis as Ingredient["nutritionBasis"], kcal: r.kcal, proteinG: r.proteinG, carbG: r.carbG, fatG: r.fatG,
    costPerUnitBirr: r.costPerUnitBirr, stockIngredientId: r.stockIngredientId, trackedInStock: r.trackedInStock,
    shortShelfLife: r.shortShelfLife, isSeasoning: r.isSeasoning,
  }));
}

export type MealWithPantry = Meal & { pantry: string[] };

export async function loadMeals(db: DbOrTx): Promise<MealWithPantry[]> {
  const [mealRows, partRows, piRows] = await Promise.all([
    db.select().from(meals).orderBy(asc(meals.sort)),
    db.select().from(parts).orderBy(asc(parts.sort)),
    db.select().from(partIngredients),
  ]);
  return mealRows.map((m) => ({
    id: m.id, code: m.code, menu: m.menu, slot: m.slot, name: m.name, description: m.description, keepsDays: m.keepsDays,
    pantry: m.pantry,
    parts: partRows.filter((p) => p.mealId === m.id).map((p) => ({
      id: p.id, mealId: p.mealId, name: p.name, category: p.category, unit: p.unit as "g" | "piece", baseQty: p.baseQty, sort: p.sort,
      ingredients: piRows.filter((pi) => pi.partId === p.id).map((pi) => ({ ingredientId: pi.ingredientId, qty: pi.qty })),
    })),
  }));
}

export async function loadSwapRules(db: DbOrTx): Promise<SwapRule[]> {
  const rows = await db.select().from(swapRules).orderBy(asc(swapRules.sort));
  return rows.map((r) => ({
    id: r.id, code: r.code, label: r.label, fromKind: r.fromKind as SwapRule["fromKind"], fromIngredientIds: r.fromIngredientIds,
    fromMealCodes: r.fromMealCodes, fromSlot: r.fromSlot, toIngredientId: r.toIngredientId,
    toIngredientSplit: r.toIngredientSplit ? r.toIngredientSplit.map((s) => [s.ingredientId, s.fraction] as [string, number]) : null,
    toMealId: r.toMealId, qtyMode: r.qtyMode as SwapRule["qtyMode"], qtyValue: r.qtyValue,
    costMode: r.costMode as SwapRule["costMode"], active: r.active, sort: r.sort,
  }));
}

export async function loadPortions(db: DbOrTx): Promise<Partial<Record<Profile, Record<string, number>>>> {
  const rows = await db.select().from(profilePortions);
  const out: Partial<Record<Profile, Record<string, number>>> = {};
  for (const r of rows) (out[r.profile] ??= {})[r.partId] = r.qty;
  return out;
}

export async function loadMenuData(db: DbOrTx): Promise<MenuData & { mealList: MealWithPantry[]; ingredientList: Ingredient[] }> {
  const [ingredientList, mealList, rules, portions] = await Promise.all([loadIngredients(db), loadMeals(db), loadSwapRules(db), loadPortions(db)]);
  return { meals: mealList, mealList, ingredientList, ingredients: indexIngredients(ingredientList), swapRules: rules, portions };
}
