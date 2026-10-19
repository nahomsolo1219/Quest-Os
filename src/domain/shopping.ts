// Purchasing: required ingredients from locked orders, stock on hand, shopping list (module 9).
import { ceilTo } from "./money";
import { ingredientUse, type IngredientIndex } from "./recipes";
import type { PurchaseUnit, ResolvedItem } from "./types";

/**
 * Stock-level ingredient needs of a set of order meals: egg whites count as eggs (one egg per white),
 * ingredients not tracked in stock are left out, seasonings tracked in stock (milk, stevia…) count.
 */
export function requiredIngredients(meals: { items: Pick<ResolvedItem, "ingredients">[] }[], ingredients: IngredientIndex): Record<string, number> {
  const uses = ingredientUse(meals.flatMap((m) => m.items), ingredients, { trackedOnly: true });
  return Object.fromEntries(uses.map((u) => [u.ingredientId, u.qty]));
}

/** last count + purchases since − waste since − usage since, never negative. */
export function stockOnHand(i: { lastCount: number; purchasesSince: number; wasteSince: number; usedSince: number }): number {
  return Math.max(0, i.lastCount + i.purchasesSince - i.wasteSince - i.usedSince);
}

export type ShoppingLine = {
  ingredientId: string;
  name: string;
  supplier?: string | null;
  /** grams or pieces */
  needQty: number;
  onHand: number;
  /** grams or pieces still to buy, never negative */
  buyQty: number;
  /** in purchase units, rounded up: kg / litre to 0.1, pieces whole */
  buyUnits: number;
  unit: PurchaseUnit;
  /** null = "price missing" */
  costBirr: number | null;
};

/** Purchase units for a grams / pieces quantity, rounded UP (0.1 kg or litre, whole pieces). */
export function toPurchaseUnits(qty: number, unit: PurchaseUnit, gramsPerUnit: number): number {
  if (qty <= 0) return 0;
  if (unit === "piece") return Math.ceil(qty - 1e-9);
  const units = unit === "kg" ? qty / 1000 : qty / gramsPerUnit;
  return Math.round(ceilTo(units, 0.1) * 10) / 10;
}

/** Need − on hand per ingredient (never negative), converted to purchase units with cost where priced. */
export function shoppingList(
  required: Record<string, number>,
  onHand: Record<string, number>,
  ingredients: IngredientIndex,
  opts: { includeCovered?: boolean; suppliers?: Record<string, string | null> } = {},
): { lines: ShoppingLine[]; totalBirr: number; missingPrices: string[] } {
  const lines: ShoppingLine[] = [];
  for (const [id, need] of Object.entries(required)) {
    const ing = ingredients[id];
    if (!ing) throw new Error(`Unknown ingredient ${id}`);
    const have = Math.max(0, onHand[id] ?? 0);
    const buyQty = Math.max(0, Math.round((need - have) * 10) / 10);
    if (buyQty === 0 && !opts.includeCovered) continue;
    const buyUnits = toPurchaseUnits(buyQty, ing.purchaseUnit, ing.gramsPerUnit);
    const cost = ing.costPerUnitBirr == null ? null : Math.round(buyUnits * ing.costPerUnitBirr);
    lines.push({
      ingredientId: id, name: ing.name, supplier: opts.suppliers?.[id] ?? null,
      needQty: need, onHand: have, buyQty, buyUnits, unit: ing.purchaseUnit, costBirr: buyQty === 0 ? 0 : cost,
    });
  }
  lines.sort((a, b) => a.name.localeCompare(b.name));
  return {
    lines,
    totalBirr: lines.reduce((s, l) => s + (l.costBirr ?? 0), 0),
    missingPrices: lines.filter((l) => l.costBirr == null).map((l) => l.name),
  };
}



