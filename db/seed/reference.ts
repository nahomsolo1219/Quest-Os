// Reference data from SPEC documents 4-6 (src/domain/seed-data.ts) and settings defaults.
// Idempotent: inserts missing rows by natural key and never overwrites rows that exist (staff may have edited them).
import { inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import * as s from "../schema";
import { SEED_AREAS, SEED_INGREDIENTS, SEED_MEALS, SEED_PACKAGES, SEED_SWAP_RULES } from "../../src/domain/seed-data";
import { SETTINGS_DEFAULTS } from "../../src/domain/settings";

export type ReferenceIds = {
  ingredientBySlug: Map<string, string>;
  mealByCode: Map<string, string>;
  packageByCode: Map<string, string>;
  areaByName: Map<string, string>;
};

export async function seedReference(db: DbOrTx): Promise<ReferenceIds> {
  // areas
  await db
    .insert(s.areas)
    .values(SEED_AREAS.map((name, i) => ({ name, sort: i })))
    .onConflictDoNothing();
  const areaRows = await db.select({ id: s.areas.id, name: s.areas.name }).from(s.areas);
  const areaByName = new Map(areaRows.map((r) => [r.name, r.id]));

  // ingredients (prices NULL), then stock links
  await db
    .insert(s.ingredients)
    .values(
      SEED_INGREDIENTS.map((i) => ({
        slug: i.slug,
        name: i.name,
        foodGroup: i.foodGroup,
        purchaseUnit: i.purchaseUnit,
        gramsPerUnit: i.gramsPerUnit,
        nutritionBasis: i.nutritionBasis,
        kcal: i.kcal,
        proteinG: i.proteinG,
        carbG: i.carbG,
        fatG: i.fatG,
        costPerUnitBirr: null,
        trackedInStock: i.trackedInStock,
        shortShelfLife: i.shortShelfLife,
        isSeasoning: i.isSeasoning,
      })),
    )
    .onConflictDoNothing();
  const ingRows = await db.select({ id: s.ingredients.id, slug: s.ingredients.slug, stock: s.ingredients.stockIngredientId }).from(s.ingredients);
  const ingredientBySlug = new Map(ingRows.map((r) => [r.slug, r.id]));
  const need = (slug: string) => {
    const id = ingredientBySlug.get(slug);
    if (!id) throw new Error(`Unknown ingredient slug ${slug}`);
    return id;
  };
  for (const i of SEED_INGREDIENTS) {
    if (!i.stockSlug) continue;
    const row = ingRows.find((r) => r.slug === i.slug);
    if (row && row.stock === null) {
      await db
        .update(s.ingredients)
        .set({ stockIngredientId: need(i.stockSlug) })
        .where(inArray(s.ingredients.id, [row.id]));
    }
  }

  // meals, parts, part ingredients
  await db
    .insert(s.meals)
    .values(
      SEED_MEALS.map((m, i) => ({
        code: m.code,
        menu: m.menu,
        slot: m.slot,
        name: m.name,
        description: m.description,
        keepsDays: m.keepsDays,
        pantry: m.pantry,
        sort: i,
      })),
    )
    .onConflictDoNothing();
  const mealRows = await db.select({ id: s.meals.id, code: s.meals.code }).from(s.meals);
  const mealByCode = new Map(mealRows.map((r) => [r.code, r.id]));

  for (const m of SEED_MEALS) {
    const mealId = mealByCode.get(m.code)!;
    await db
      .insert(s.parts)
      .values(m.parts.map((p, i) => ({ mealId, name: p.name, category: p.category, unit: p.unit, baseQty: p.baseQty, sort: i })))
      .onConflictDoNothing();
    const partRows = await db
      .select({ id: s.parts.id, name: s.parts.name })
      .from(s.parts)
      .where(inArray(s.parts.mealId, [mealId]));
    const partByName = new Map(partRows.map((r) => [r.name, r.id]));
    const piValues = m.parts.flatMap((p) =>
      p.ingredients.map(([slug, qty]) => ({ partId: partByName.get(p.name)!, ingredientId: need(slug), qty })),
    );
    await db.insert(s.partIngredients).values(piValues).onConflictDoNothing();
  }

  // swap rules
  await db
    .insert(s.swapRules)
    .values(
      SEED_SWAP_RULES.map((r, i) => ({
        code: r.code,
        label: r.label,
        fromKind: r.fromKind,
        fromIngredientIds: r.fromIngredientSlugs.map(need),
        fromMealCodes: r.fromMealCodes,
        fromSlot: r.fromSlot,
        toIngredientId: r.toIngredientSlug ? need(r.toIngredientSlug) : null,
        toIngredientSplit: r.toIngredientSplit
          ? r.toIngredientSplit.map(([slug, fraction]) => ({ ingredientId: need(slug), fraction }))
          : null,
        toMealId: r.toMealCode ? mealByCode.get(r.toMealCode)! : null,
        qtyMode: r.qtyMode,
        qtyValue: r.qtyValue,
        costMode: r.costMode,
        sort: i,
      })),
    )
    .onConflictDoNothing();

  // packages
  await db
    .insert(s.packages)
    .values(SEED_PACKAGES.map((p, i) => ({ ...p, sort: i })))
    .onConflictDoNothing();
  const pkgRows = await db.select({ id: s.packages.id, code: s.packages.code }).from(s.packages);
  const packageByCode = new Map<string, string>(pkgRows.map((r) => [r.code, r.id]));

  // settings
  await db
    .insert(s.settings)
    .values(Object.entries(SETTINGS_DEFAULTS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();

  return { ingredientBySlug, mealByCode, packageByCode, areaByName };
}
