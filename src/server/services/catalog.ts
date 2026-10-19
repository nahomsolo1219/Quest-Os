// Owner settings catalog: packages, swap table, areas, ingredients (prices and nutrition values) and the change log.
// Settings groups themselves are saved through settings.ts updateSettings (lead-owned), which validates and audits.
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { areas, auditLog, ingredientPrices, ingredients, meals, packages, swapRules, user } from "@db/schema";
import { assertCan, can, ForbiddenError } from "@/server/authz";
import { DELIVERY_OPTIONS, type DeliveryOption } from "@/domain/types";
import { writeAudit } from "./audit";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { loadSettings } from "./settings";

// ---------- settings (read) ----------

export async function readSettings(ctx: Ctx) {
  assertCan(ctx.actor, "settings.read");
  return loadSettings(ctx.db);
}

// ---------- packages (PLN-09) ----------

export async function listPackages(ctx: Ctx) {
  assertCan(ctx.actor, "packages.read");
  return ctx.db.select().from(packages).orderBy(asc(packages.sort));
}

export type PackageInput = {
  id: string; name: string; swapLimit: number; checkinIntervalDays: number; coaching: string;
  deliveryOptions: DeliveryOption[]; serviceFeeMonthBirr: number; prioritySlot: boolean; active: boolean;
};

export async function updatePackage(ctx: Ctx, input: PackageInput) {
  assertCan(ctx.actor, "packages.write");
  const [row] = await ctx.db.select().from(packages).where(eq(packages.id, input.id));
  if (!row) throw new ServiceError("That package was not found.");
  if (!input.name.trim()) throw new ServiceError("Give the package a name.");
  if (!Number.isInteger(input.swapLimit) || input.swapLimit < 0 || input.swapLimit > 30) throw new ServiceError("Swap limit must be a whole number from 0 to 30.");
  if (!Number.isInteger(input.checkinIntervalDays) || input.checkinIntervalDays < 1 || input.checkinIntervalDays > 90) throw new ServiceError("Check-in interval must be 1 to 90 days.");
  if (!Number.isInteger(input.serviceFeeMonthBirr) || input.serviceFeeMonthBirr < 0) throw new ServiceError("Service fee must be whole birr, 0 or more.");
  const opts = [...new Set(input.deliveryOptions)].filter((o) => (DELIVERY_OPTIONS as readonly string[]).includes(o));
  if (opts.length === 0) throw new ServiceError("Pick at least one delivery option for the package.");
  const enabled = (await loadSettings(ctx.db)).pricing.enabledDeliveryOptions;
  const off = opts.filter((o) => !enabled.includes(o));
  if (off.length) throw new ServiceError(`Enable ${off.join(", ")} in pricing settings first.`);
  if (input.active === false && row.active) {
    const others = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(packages).where(and(eq(packages.active, true), ne(packages.id, row.id)));
    if ((others[0]?.n ?? 0) === 0) throw new ServiceError("At least one package must stay active.");
  }
  const next = {
    name: input.name.trim(), swapLimit: input.swapLimit, checkinIntervalDays: input.checkinIntervalDays, coaching: input.coaching.trim(),
    deliveryOptions: opts, serviceFeeMonthBirr: input.serviceFeeMonthBirr, prioritySlot: input.prioritySlot, active: input.active,
  };
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(packages).set({ ...next, updatedAt: ctx.now }).where(eq(packages.id, row.id)).returning();
    await writeAudit(tx, ctx.actor, { action: "package.update", entity: "packages", entityId: row.code,
      before: pickPackage(row), after: pickPackage(updated) });
    return updated;
  });
}

function pickPackage(p: typeof packages.$inferSelect) {
  return { name: p.name, swapLimit: p.swapLimit, checkinIntervalDays: p.checkinIntervalDays, coaching: p.coaching, deliveryOptions: p.deliveryOptions,
    serviceFeeMonthBirr: p.serviceFeeMonthBirr, prioritySlot: p.prioritySlot, active: p.active };
}

// ---------- swap table (SWP-10) ----------

export async function listSwapRules(ctx: Ctx) {
  assertCan(ctx.actor, "swapRules.read");
  const [rules, ings, mealRows] = await Promise.all([
    ctx.db.select().from(swapRules).orderBy(asc(swapRules.sort)),
    ctx.db.select({ id: ingredients.id, name: ingredients.name, isSeasoning: ingredients.isSeasoning }).from(ingredients).orderBy(asc(ingredients.name)),
    ctx.db.select({ id: meals.id, code: meals.code, name: meals.name }).from(meals).orderBy(asc(meals.sort)),
  ]);
  const ingName = (id: string | null) => (id ? ings.find((i) => i.id === id)?.name ?? "?" : null);
  return {
    canEdit: can(ctx.actor, "swapRules.write"),
    ingredients: ings,
    meals: mealRows,
    rules: rules.map((r) => ({
      ...r,
      fromText: r.fromKind === "slot" ? `Whole ${r.fromSlot ?? ""} meal` : r.fromIngredientIds.map(ingName).join(" or "),
      toText: r.toMealId ? mealRows.find((m) => m.id === r.toMealId)?.name ?? "?"
        : r.toIngredientSplit?.length ? r.toIngredientSplit.map((s) => `${ingName(s.ingredientId)} ${Math.round(s.fraction * 100)}%`).join(" + ")
        : ingName(r.toIngredientId) ?? "",
    })),
  };
}

export const QTY_MODES = ["same", "fixed", "multiply", "add"] as const;
export const COST_MODES = ["zero", "price_difference"] as const;
export type QtyMode = (typeof QTY_MODES)[number];
export type CostMode = (typeof COST_MODES)[number];

function checkQty(qtyMode: QtyMode, qtyValue: number | null) {
  if (qtyMode === "same") return null;
  if (qtyValue == null || !(qtyValue > 0) || qtyValue > 1000) {
    throw new ServiceError(qtyMode === "multiply" ? "Enter a multiplier above 0 (for example 2 for double grams)." : "Enter the grams or pieces for this swap (above 0).");
  }
  return Math.round(qtyValue * 10) / 10;
}

export async function updateSwapRule(ctx: Ctx, input: { id: string; label: string; active: boolean; qtyMode: QtyMode; qtyValue: number | null; costMode: CostMode }) {
  assertCan(ctx.actor, "swapRules.write");
  const [row] = await ctx.db.select().from(swapRules).where(eq(swapRules.id, input.id));
  if (!row) throw new ServiceError("That swap rule was not found.");
  if (!input.label.trim()) throw new ServiceError("Give the swap a label clients will understand.");
  if (row.fromKind === "slot" && input.qtyMode !== row.qtyMode) throw new ServiceError("A replacement-meal swap always uses the same quantity mode.");
  const next = { label: input.label.trim(), active: input.active, qtyMode: input.qtyMode, qtyValue: checkQty(input.qtyMode, input.qtyValue), costMode: input.costMode };
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(swapRules).set({ ...next, updatedAt: ctx.now }).where(eq(swapRules.id, row.id)).returning();
    await writeAudit(tx, ctx.actor, { action: "swap_rule.update", entity: "swap_rules", entityId: row.code,
      before: { label: row.label, active: row.active, qtyMode: row.qtyMode, qtyValue: row.qtyValue, costMode: row.costMode }, after: next });
    return updated;
  });
}

export async function createSwapRule(ctx: Ctx, input: {
  label: string; fromIngredientIds: string[]; fromMealCodes?: string[] | null; toIngredientId: string; qtyMode: QtyMode; qtyValue: number | null; costMode: CostMode;
}) {
  assertCan(ctx.actor, "swapRules.write");
  if (!input.label.trim()) throw new ServiceError("Give the swap a label clients will understand.");
  const from = [...new Set(input.fromIngredientIds)];
  if (from.length === 0) throw new ServiceError("Pick the ingredient the client swaps away from.");
  if (from.includes(input.toIngredientId) && input.qtyMode !== "add") throw new ServiceError("Swap to a different ingredient (or use 'add' for extra of the same).");
  const found = await ctx.db.select({ id: ingredients.id }).from(ingredients).where(inArray(ingredients.id, [...from, input.toIngredientId]));
  if (found.length !== new Set([...from, input.toIngredientId]).size) throw new ServiceError("One of the ingredients was not found.");
  let mealCodes: string[] | null = null;
  if (input.fromMealCodes?.length) {
    const ms = await ctx.db.select({ code: meals.code }).from(meals).where(inArray(meals.code, input.fromMealCodes));
    if (ms.length !== input.fromMealCodes.length) throw new ServiceError("One of the meals was not found.");
    mealCodes = input.fromMealCodes;
  }
  const qtyValue = checkQty(input.qtyMode, input.qtyValue);
  const [maxSort] = await ctx.db.select({ n: sql<number>`coalesce(max(${swapRules.sort}), 0)::int` }).from(swapRules);
  const code = `CUSTOM_${input.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}_${ctx.now.getTime().toString(36).toUpperCase()}`;
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(swapRules).values({
      code, label: input.label.trim(), fromKind: "ingredient", fromIngredientIds: from, fromMealCodes: mealCodes, toIngredientId: input.toIngredientId,
      qtyMode: input.qtyMode, qtyValue, costMode: input.costMode, active: true, sort: (maxSort?.n ?? 0) + 10,
    }).returning();
    await writeAudit(tx, ctx.actor, { action: "swap_rule.create", entity: "swap_rules", entityId: code, after: {
      label: row.label, fromIngredientIds: from, fromMealCodes: mealCodes, toIngredientId: input.toIngredientId, qtyMode: row.qtyMode, qtyValue, costMode: row.costMode } });
    return row;
  });
}

// ---------- areas ----------

export async function listAreas(ctx: Ctx) {
  assertCan(ctx.actor, "areas.read");
  return ctx.db.select().from(areas).orderBy(asc(areas.sort), asc(areas.name));
}

async function assertUniqueAreaName(ctx: Ctx, name: string, exceptId?: string) {
  const [dup] = await ctx.db.select({ id: areas.id }).from(areas).where(sql`lower(${areas.name}) = lower(${name})`);
  if (dup && dup.id !== exceptId) throw new ServiceError(`There is already an area called ${name}.`);
}

export async function createArea(ctx: Ctx, input: { name: string }) {
  assertCan(ctx.actor, "areas.write");
  const name = input.name.trim();
  if (name.length < 2) throw new ServiceError("Area name must be at least 2 letters.");
  await assertUniqueAreaName(ctx, name);
  const [maxSort] = await ctx.db.select({ n: sql<number>`coalesce(max(${areas.sort}), 0)::int` }).from(areas);
  const [row] = await ctx.db.insert(areas).values({ name, sort: (maxSort?.n ?? 0) + 1, active: true }).returning();
  await writeAudit(ctx.db, ctx.actor, { action: "area.create", entity: "areas", entityId: row.id, after: { name } });
  return row;
}

export async function updateArea(ctx: Ctx, input: { id: string; name: string; active: boolean }) {
  assertCan(ctx.actor, "areas.write");
  const [row] = await ctx.db.select().from(areas).where(eq(areas.id, input.id));
  if (!row) throw new ServiceError("That area was not found.");
  const name = input.name.trim();
  if (name.length < 2) throw new ServiceError("Area name must be at least 2 letters.");
  await assertUniqueAreaName(ctx, name, row.id);
  const [updated] = await ctx.db.update(areas).set({ name, active: input.active, updatedAt: ctx.now }).where(eq(areas.id, row.id)).returning();
  await writeAudit(ctx.db, ctx.actor, { action: "area.update", entity: "areas", entityId: row.id, before: { name: row.name, active: row.active }, after: { name, active: input.active } });
  return updated;
}

/** Moves an area one place up or down in the delivery order (sorts renumbered 1..n). */
export async function moveArea(ctx: Ctx, input: { id: string; direction: "up" | "down" }) {
  assertCan(ctx.actor, "areas.write");
  const list = await ctx.db.select().from(areas).orderBy(asc(areas.sort), asc(areas.name));
  const i = list.findIndex((a) => a.id === input.id);
  if (i < 0) throw new ServiceError("That area was not found.");
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  await ctx.db.transaction(async (tx) => {
    for (const [k, a] of list.entries()) if (a.sort !== k + 1) await tx.update(areas).set({ sort: k + 1, updatedAt: ctx.now }).where(eq(areas.id, a.id));
  });
  return list;
}

// ---------- ingredients, prices, nutrition values (SET-03) ----------

export async function listIngredients(ctx: Ctx) {
  assertCan(ctx.actor, "ingredients.read");
  const [rows, history] = await Promise.all([
    ctx.db.select().from(ingredients).orderBy(asc(ingredients.foodGroup), asc(ingredients.name)),
    ctx.db.select({ h: ingredientPrices, byName: user.name }).from(ingredientPrices).leftJoin(user, eq(user.id, ingredientPrices.setByUserId))
      .orderBy(desc(ingredientPrices.setAt)).limit(500),
  ]);
  // egg white is costed as eggs (stockIngredientId): it never needs its own price
  const needsPrice = (r: typeof rows[number]) => r.stockIngredientId === null;
  return {
    canPrice: can(ctx.actor, "prices.write"),
    canSupplier: can(ctx.actor, "ingredients.write"),
    canNutrition: can(ctx.actor, "ingredients.nutrition.write"),
    missingCount: rows.filter((r) => needsPrice(r) && r.costPerUnitBirr === null).length,
    ingredients: rows.map((r) => ({
      ...r,
      needsPrice: needsPrice(r),
      history: history.filter((h) => h.h.ingredientId === r.id).slice(0, 5).map((h) => ({ cost: h.h.costPerUnitBirr, source: h.h.source, at: h.h.setAt, by: h.byName })),
    })),
  };
}

/** Manual price change (per purchase unit): writes an ingredient_prices history row (source manual) and an audit row. */
export async function setIngredientPrice(ctx: Ctx, input: { id: string; costPerUnitBirr: number | null; supplier?: string | null }) {
  assertCan(ctx.actor, "prices.write");
  const [row] = await ctx.db.select().from(ingredients).where(eq(ingredients.id, input.id));
  if (!row) throw new ServiceError("That ingredient was not found.");
  if (input.costPerUnitBirr !== null && (!Number.isInteger(input.costPerUnitBirr) || input.costPerUnitBirr <= 0 || input.costPerUnitBirr > 1_000_000)) {
    throw new ServiceError("Price must be whole birr above 0.");
  }
  const supplier = input.supplier === undefined ? row.supplier : input.supplier?.trim() || null;
  if (supplier !== row.supplier && !can(ctx.actor, "ingredients.write")) throw new ForbiddenError("Only owners and operations can change suppliers.");
  const priceChanged = input.costPerUnitBirr !== row.costPerUnitBirr;
  if (!priceChanged && supplier === row.supplier) return row;
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(ingredients).set({ costPerUnitBirr: input.costPerUnitBirr, supplier, updatedAt: ctx.now }).where(eq(ingredients.id, row.id)).returning();
    if (priceChanged && input.costPerUnitBirr !== null) {
      await tx.insert(ingredientPrices).values({ ingredientId: row.id, costPerUnitBirr: input.costPerUnitBirr, source: "manual", setByUserId: actorUserId(ctx.actor), setAt: ctx.now });
    }
    await writeAudit(tx, ctx.actor, { action: priceChanged ? "price.update" : "ingredient.supplier", entity: "ingredients", entityId: row.slug,
      before: { costPerUnitBirr: row.costPerUnitBirr, supplier: row.supplier, unit: row.purchaseUnit },
      after: { costPerUnitBirr: input.costPerUnitBirr, supplier, unit: row.purchaseUnit } });
    return updated;
  });
}

/** Nutrition values per 100 g (or per piece). Run "Recompute" on the profile table afterwards. */
export async function setIngredientNutrition(ctx: Ctx, input: { id: string; kcal: number; proteinG: number; carbG: number; fatG: number }) {
  assertCan(ctx.actor, "ingredients.nutrition.write");
  const [row] = await ctx.db.select().from(ingredients).where(eq(ingredients.id, input.id));
  if (!row) throw new ServiceError("That ingredient was not found.");
  for (const [k, v] of [["kcal", input.kcal], ["protein", input.proteinG], ["carbs", input.carbG], ["fat", input.fatG]] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 1000) throw new ServiceError(`${k} must be between 0 and 1000.`);
  }
  if (row.nutritionBasis === "per_100g" && input.proteinG + input.carbG + input.fatG > 100) throw new ServiceError("Protein + carbs + fat cannot exceed 100 g per 100 g.");
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const next = { kcal: r2(input.kcal), proteinG: r2(input.proteinG), carbG: r2(input.carbG), fatG: r2(input.fatG) };
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(ingredients).set({ ...next, updatedAt: ctx.now }).where(eq(ingredients.id, row.id)).returning();
    await writeAudit(tx, ctx.actor, { action: "ingredient.nutrition", entity: "ingredients", entityId: row.slug,
      before: { kcal: row.kcal, proteinG: row.proteinG, carbG: row.carbG, fatG: row.fatG, basis: row.nutritionBasis }, after: next });
    return updated;
  });
}

// ---------- change log ----------

export const CHANGE_LOG_ENTITIES = ["settings", "ingredients", "packages", "swap_rules", "areas", "nutrition_profiles", "profile_portions", "subscriptions"] as const;
export type ChangeLogEntity = (typeof CHANGE_LOG_ENTITIES)[number];

/** Audit rows for settings, prices, packages, swap rules etc., newest first. */
export async function changeLog(ctx: Ctx, input: { entity?: ChangeLogEntity; limit?: number } = {}) {
  assertCan(ctx.actor, "audit.read");
  const entities = input.entity ? [input.entity] : ["settings", "ingredients", "packages", "swap_rules", "areas"];
  return ctx.db.select({ a: auditLog, actorName: user.name }).from(auditLog).leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(inArray(auditLog.entity, entities)).orderBy(desc(auditLog.createdAt)).limit(input.limit ?? 200);
}
