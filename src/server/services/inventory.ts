// Inventory and purchasing (module 9): shopping list from locked orders minus stock, quick-start top-up list,
// purchase log with price history, stock counts and waste log.
//
// Stock model (DECISIONS D361): a stock count is the quantity at the end of its count date (that day's
// purchases, waste and cooking are already in it). On hand at the end of day E =
//   last count on or before E + purchases after the count up to E − waste after the count up to E
//   − usage of locked meals cooked after the count up to E (never negative).
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { ingredientPrices, ingredients as ingredientsTable, purchases, stockCounts, user, wasteLog } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertCan, ForbiddenError, hasRole, type Actor } from "@/server/authz";
import { indexIngredients, type IngredientIndex } from "@/domain/recipes";
import { requiredIngredients, shoppingList, stockOnHand, type ShoppingLine } from "@/domain/shopping";
import { addDays, addisDate, isDateStr, weekStartOf } from "@/domain/time";
import type { DateStr, FoodGroup, Ingredient, PurchaseUnit } from "@/domain/types";
import { writeAudit } from "./audit";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { lockedMealsBetween, lockedMealsForCookDate } from "./kitchen";
import { loadIngredients } from "./menu-data";

/** Food groups bought fresh each morning for quick starts (INV-07). */
export const FRESH_GROUPS: FoodGroup[] = ["chicken", "beef", "fish", "dairy", "vegetables", "fruit", "eggs"];

/** Prices and suppliers are for owners and operations only (kitchen never sees prices). */
function assertPriceAccess(actor: Actor | null): asserts actor is Actor {
  assertCan(actor, "stock.read");
  if (!hasRole(actor, "owner", "operations")) throw new ForbiddenError("Only operations and owners can see prices.");
}

/** grams / pieces for a quantity in purchase units (kg -> g, litre -> g via grams per litre, piece -> whole pieces). */
export function fromPurchaseUnits(qtyUnits: number, ing: Pick<Ingredient, "purchaseUnit" | "gramsPerUnit">): number {
  if (ing.purchaseUnit === "piece") return Math.round(qtyUnits);
  if (ing.purchaseUnit === "kg") return Math.round(qtyUnits * 1000);
  return Math.round(qtyUnits * ing.gramsPerUnit);
}

const toUnits = (qty: number, ing: Pick<Ingredient, "purchaseUnit" | "gramsPerUnit">) =>
  ing.purchaseUnit === "piece" ? qty : Math.round((qty / (ing.purchaseUnit === "kg" ? 1000 : ing.gramsPerUnit)) * 100) / 100;

function stockIngredient(idx: IngredientIndex, id: string): Ingredient {
  const ing = idx[id];
  if (!ing) throw new ServiceError("That ingredient does not exist.", "not_found");
  if (ing.stockIngredientId || !ing.trackedInStock) {
    const target = ing.stockIngredientId ? idx[ing.stockIngredientId] : null;
    throw new ServiceError(target ? `${ing.name} is counted as ${target.name}. Use ${target.name} instead.` : `${ing.name} is not tracked in stock.`);
  }
  return ing;
}

/** On hand per tracked ingredient at the end of `endOf`, with the count it starts from. Server-internal. */
export async function onHandAt(db: DbOrTx, endOf: DateStr, idx?: IngredientIndex) {
  const ingIdx = idx ?? indexIngredients(await loadIngredients(db));
  const tracked = Object.values(ingIdx).filter((i) => i.trackedInStock && !i.stockIngredientId);
  const counts = await db.select().from(stockCounts).where(lte(stockCounts.countDate, endOf)).orderBy(desc(stockCounts.countDate));
  const lastCount = new Map<string, { date: DateStr; qty: number }>();
  for (const c of counts) if (!lastCount.has(c.ingredientId)) lastCount.set(c.ingredientId, { date: c.countDate, qty: c.qty });
  const earliest = [...lastCount.values()].reduce<DateStr | null>((m, c) => (m == null || c.date < m ? c.date : m), null);
  // movements after the oldest relevant count (ingredients never counted start from nothing: whole history)
  const since = tracked.some((i) => !lastCount.has(i.id)) ? "1900-01-01" : earliest ?? endOf;
  const [buys, waste, used] = await Promise.all([
    db.select({ ingredientId: purchases.ingredientId, qty: purchases.qty, date: purchases.purchasedOn }).from(purchases)
      .where(and(gt(purchases.purchasedOn, since), lte(purchases.purchasedOn, endOf))),
    db.select({ ingredientId: wasteLog.ingredientId, qty: wasteLog.qty, date: wasteLog.loggedOn }).from(wasteLog)
      .where(and(gt(wasteLog.loggedOn, since), lte(wasteLog.loggedOn, endOf))),
    lockedMealsBetween(db, addDays(since, 1), endOf),
  ]);
  // usage per cook date (egg whites as eggs), computed once
  const byCookDate = new Map<DateStr, typeof used>();
  for (const m of used) byCookDate.set(m.cookDate, [...(byCookDate.get(m.cookDate) ?? []), m]);
  const usageByDate = [...byCookDate.entries()].map(([date, list]) => ({ date, req: requiredIngredients(list, ingIdx) }));
  const out: Record<string, { onHand: number; countDate: DateStr | null; countQty: number | null }> = {};
  for (const ing of tracked) {
    const c = lastCount.get(ing.id) ?? null;
    const after = (d: DateStr) => (c ? d > c.date : true);
    const usedSince = usageByDate.filter((u) => after(u.date)).reduce((s, u) => s + (u.req[ing.id] ?? 0), 0);
    out[ing.id] = {
      onHand: Math.round(stockOnHand({
        lastCount: c?.qty ?? 0,
        purchasesSince: buys.filter((b) => b.ingredientId === ing.id && after(b.date)).reduce((s, b) => s + b.qty, 0),
        wasteSince: waste.filter((w) => w.ingredientId === ing.id && after(w.date)).reduce((s, w) => s + w.qty, 0),
        usedSince,
      })),
      countDate: c?.date ?? null,
      countQty: c?.qty ?? null,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Shopping list (Friday, for next week) and the daily top-up list

export type ShoppingView = {
  weekStart: DateStr;
  mealsCount: number;
  stockAsOf: DateStr;
  lines: (ShoppingLine & { purchaseUnitLabel: string; needUnits: number; onHandUnits: number })[];
  totalBirr: number;
  missingPrices: string[];
};

const UNIT_LABEL: Record<PurchaseUnit, string> = { kg: "kg", litre: "litre", piece: "pieces" };

export async function shoppingListForWeek(ctx: Ctx, weekStart: DateStr): Promise<ShoppingView> {
  assertPriceAccess(ctx.actor);
  if (!isDateStr(weekStart)) throw new ServiceError("Pick a valid week.");
  const ws = weekStartOf(weekStart);
  const ingList = await loadIngredients(ctx.db);
  const idx = indexIngredients(ingList);
  const meals = await lockedMealsBetween(ctx.db, ws, addDays(ws, 6));
  const required = requiredIngredients(meals, idx);
  const stockAsOf = addDays(ws, -1);
  const stock = await onHandAt(ctx.db, stockAsOf, idx);
  const onHand = Object.fromEntries(Object.entries(stock).map(([id, s]) => [id, s.onHand]));
  const suppliers = await supplierMap(ctx.db);
  const list = shoppingList(required, onHand, idx, { includeCovered: true, suppliers });
  return { weekStart: ws, mealsCount: meals.length, stockAsOf, ...list, lines: list.lines.map((l) => withUnits(l, idx)) };
}

function withUnits(l: ShoppingLine, idx: IngredientIndex) {
  const ing = idx[l.ingredientId];
  return { ...l, purchaseUnitLabel: UNIT_LABEL[l.unit], needUnits: toUnits(l.needQty, ing), onHandUnits: toUnits(l.onHand, ing) };
}

async function supplierMap(db: DbOrTx) {
  const rows = await db.select({ id: ingredientsTable.id, supplier: ingredientsTable.supplier }).from(ingredientsTable);
  return Object.fromEntries(rows.map((r) => [r.id, r.supplier]));
}

/**
 * Next morning's top-up purchase list (INV-07): fresh items (chicken, beef, fish, dairy, vegetables, fruit, eggs)
 * needed by quick-start meals cooked on `cookDate`. The weekly list was sized before these clients were locked,
 * so the whole quick-start need is bought (D362).
 */
export async function topUpList(ctx: Ctx, cookDate: DateStr) {
  assertPriceAccess(ctx.actor);
  if (!isDateStr(cookDate)) throw new ServiceError("Pick a valid date.");
  const idx = indexIngredients(await loadIngredients(ctx.db));
  const meals = (await lockedMealsForCookDate(ctx.db, cookDate)).filter((m) => m.isQuickStart);
  const required = Object.fromEntries(Object.entries(requiredIngredients(meals, idx)).filter(([id]) => FRESH_GROUPS.includes(idx[id].foodGroup)));
  const list = shoppingList(required, {}, idx, { suppliers: await supplierMap(ctx.db) });
  return {
    cookDate,
    quickStartClients: new Set(meals.map((m) => m.clientId)).size,
    mealsCount: meals.length,
    ...list,
    lines: list.lines.map((l) => withUnits(l, idx)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Purchases and prices

export type LogPurchaseInput = { ingredientId: string; qty: number; totalPriceBirr: number; supplier?: string | null; purchasedOn: DateStr };

/** Logs a purchase (qty in purchase units), updates the ingredient's cost per unit and price history, audited (INV-04). */
export async function logPurchase(ctx: Ctx, input: LogPurchaseInput) {
  assertCan(ctx.actor, "purchases.write");
  const idx = indexIngredients(await loadIngredients(ctx.db));
  const ing = stockIngredient(idx, input.ingredientId);
  if (!(input.qty > 0)) throw new ServiceError("Enter a quantity above zero.");
  if (ing.purchaseUnit === "piece" && !Number.isInteger(input.qty)) throw new ServiceError(`${ing.name} is bought in whole pieces.`);
  if (!Number.isInteger(input.totalPriceBirr) || input.totalPriceBirr <= 0) throw new ServiceError("Enter the total price in whole birr.");
  if (!isDateStr(input.purchasedOn)) throw new ServiceError("Enter the purchase date.");
  if (input.purchasedOn > addisDate(ctx.now)) throw new ServiceError("The purchase date cannot be in the future.");
  const qty = fromPurchaseUnits(input.qty, ing);
  if (qty <= 0) throw new ServiceError("Enter a quantity above zero.");
  const unitCost = Math.round(input.totalPriceBirr / input.qty);
  const supplier = input.supplier?.trim() || null;
  const by = actorUserId(ctx.actor);

  const [purchase] = await ctx.db.insert(purchases).values({
    ingredientId: ing.id, qty, totalPriceBirr: input.totalPriceBirr, supplier, purchasedOn: input.purchasedOn, byUserId: by,
  }).returning();
  await ctx.db.update(ingredientsTable).set({ costPerUnitBirr: unitCost, ...(supplier ? { supplier } : {}), updatedAt: ctx.now })
    .where(eq(ingredientsTable.id, ing.id));
  await ctx.db.insert(ingredientPrices).values({ ingredientId: ing.id, costPerUnitBirr: unitCost, source: "purchase", purchaseId: purchase.id, setByUserId: by, setAt: ctx.now });
  await writeAudit(ctx.db, ctx.actor, {
    action: "ingredient.price.purchase", entity: "ingredient", entityId: ing.id,
    before: { costPerUnitBirr: ing.costPerUnitBirr }, after: { costPerUnitBirr: unitCost, purchaseId: purchase.id, qty, totalPriceBirr: input.totalPriceBirr, supplier },
  });
  return { purchase, ingredientName: ing.name, unitCostBirr: unitCost, unit: ing.purchaseUnit };
}

/** Recent purchases (newest first). */
export async function purchaseLog(ctx: Ctx, opts: { limit?: number } = {}) {
  assertPriceAccess(ctx.actor);
  const ingList = await loadIngredients(ctx.db);
  const byId = new Map(ingList.map((i) => [i.id, i]));
  const rows = await ctx.db.select({ p: purchases, byName: user.name }).from(purchases).leftJoin(user, eq(user.id, purchases.byUserId))
    .orderBy(desc(purchases.purchasedOn), desc(purchases.createdAt)).limit(opts.limit ?? 50);
  return rows.map(({ p, byName }) => {
    const ing = byId.get(p.ingredientId)!;
    const units = toUnits(p.qty, ing);
    return {
      id: p.id, ingredientId: p.ingredientId, ingredientName: ing.name, unit: ing.purchaseUnit, qtyUnits: units,
      totalPriceBirr: p.totalPriceBirr, unitCostBirr: units > 0 ? Math.round(p.totalPriceBirr / units) : null,
      supplier: p.supplier, purchasedOn: p.purchasedOn, byName: byName ?? null,
    };
  });
}

export async function priceHistory(ctx: Ctx, ingredientId: string) {
  assertPriceAccess(ctx.actor);
  const [ing] = await ctx.db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ingredientId));
  if (!ing) throw new ServiceError("That ingredient does not exist.", "not_found");
  const rows = await ctx.db.select({ p: ingredientPrices, byName: user.name }).from(ingredientPrices).leftJoin(user, eq(user.id, ingredientPrices.setByUserId))
    .where(eq(ingredientPrices.ingredientId, ingredientId)).orderBy(desc(ingredientPrices.setAt)).limit(50);
  return {
    ingredient: { id: ing.id, name: ing.name, unit: ing.purchaseUnit, costPerUnitBirr: ing.costPerUnitBirr, supplier: ing.supplier },
    history: rows.map(({ p, byName }) => ({ id: p.id, costPerUnitBirr: p.costPerUnitBirr, source: p.source, setAt: p.setAt, byName: byName ?? null })),
  };
}

/** Ingredients that can be bought and counted (tracked, not derived like egg whites), with price for ops/owners. */
export async function stockIngredients(ctx: Ctx) {
  assertCan(ctx.actor, "stock.read");
  const showPrice = hasRole(ctx.actor, "owner", "operations");
  const list = (await loadIngredients(ctx.db)).filter((i) => i.trackedInStock && !i.stockIngredientId);
  return list.map((i) => ({ id: i.id, name: i.name, foodGroup: i.foodGroup, unit: i.purchaseUnit, costPerUnitBirr: showPrice ? i.costPerUnitBirr : null }));
}

// ---------------------------------------------------------------------------------------------------------------
// Stock counts

export type StockCountInput = { ingredientId: string; countDate: DateStr; qty?: number; matchesExpected?: boolean };

/**
 * Saves one count line (unique per ingredient and date; saving again replaces it). qty is in purchase units;
 * `matchesExpected` stores the expected on hand exactly (one tap).
 */
export async function recordStockCount(ctx: Ctx, input: StockCountInput) {
  assertCan(ctx.actor, "stock.write");
  if (!isDateStr(input.countDate)) throw new ServiceError("Pick a valid count date.");
  if (input.countDate > addisDate(ctx.now)) throw new ServiceError("You cannot count stock for a future date.");
  const idx = indexIngredients(await loadIngredients(ctx.db));
  const ing = stockIngredient(idx, input.ingredientId);
  let qty: number;
  if (input.matchesExpected) {
    qty = (await expectedFor(ctx.db, input.countDate, idx))[ing.id] ?? 0;
  } else {
    if (input.qty == null || !Number.isFinite(input.qty) || input.qty < 0) throw new ServiceError("Enter the amount counted (0 or more).");
    if (ing.purchaseUnit === "piece" && !Number.isInteger(input.qty)) throw new ServiceError(`Count ${ing.name} in whole pieces.`);
    qty = fromPurchaseUnits(input.qty, ing);
  }
  const by = actorUserId(ctx.actor);
  const [row] = await ctx.db.insert(stockCounts).values({ ingredientId: ing.id, countDate: input.countDate, qty, byUserId: by })
    .onConflictDoUpdate({ target: [stockCounts.ingredientId, stockCounts.countDate], set: { qty, byUserId: by, updatedAt: ctx.now } })
    .returning();
  return { ...row, qtyUnits: toUnits(qty, ing), unit: ing.purchaseUnit };
}

/** Expected on hand at the end of `date`, ignoring a count already entered for that date. */
async function expectedFor(db: DbOrTx, date: DateStr, idx: IngredientIndex): Promise<Record<string, number>> {
  const before = await onHandAt(db, addDays(date, -1), idx);
  const [buys, waste, used] = await Promise.all([
    db.select().from(purchases).where(eq(purchases.purchasedOn, date)),
    db.select().from(wasteLog).where(eq(wasteLog.loggedOn, date)),
    lockedMealsForCookDate(db, date),
  ]);
  const usedToday = requiredIngredients(used, idx);
  return Object.fromEntries(Object.entries(before).map(([id, s]) => [id, Math.max(0, Math.round(
    s.onHand + buys.filter((b) => b.ingredientId === id).reduce((a, b) => a + b.qty, 0)
      - waste.filter((w) => w.ingredientId === id).reduce((a, w) => a + w.qty, 0) - (usedToday[id] ?? 0),
  ))]));
}

/** Stock sheet for a count date: every tracked ingredient, its expected on hand and the count entered (if any). */
export async function stockSheet(ctx: Ctx, date: DateStr) {
  assertCan(ctx.actor, "stock.read");
  if (!isDateStr(date)) throw new ServiceError("Pick a valid date.");
  const ingList = await loadIngredients(ctx.db);
  const idx = indexIngredients(ingList);
  const expected = await expectedFor(ctx.db, date, idx);
  const counts = await ctx.db.select().from(stockCounts).where(eq(stockCounts.countDate, date));
  const lines = ingList.filter((i) => i.trackedInStock && !i.stockIngredientId).map((i) => {
    const c = counts.find((x) => x.ingredientId === i.id);
    return {
      ingredientId: i.id, name: i.name, foodGroup: i.foodGroup, unit: i.purchaseUnit,
      expectedQty: expected[i.id] ?? 0, expectedUnits: toUnits(expected[i.id] ?? 0, i),
      countedQty: c?.qty ?? null, countedUnits: c ? toUnits(c.qty, i) : null,
    };
  });
  const groupOrder: FoodGroup[] = ["chicken", "beef", "fish", "eggs", "dairy", "vegetables", "fruit", "grains", "legumes", "oil", "other"];
  lines.sort((a, b) => groupOrder.indexOf(a.foodGroup) - groupOrder.indexOf(b.foodGroup) || a.name.localeCompare(b.name));
  return { date, lines, counted: lines.filter((l) => l.countedQty != null).length, total: lines.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Waste

export type WasteInput = { ingredientId: string; qty: number; reason: string; date: DateStr };

/** Logs waste (qty in purchase units); waste reduces on hand (INV-06). */
export async function logWaste(ctx: Ctx, input: WasteInput) {
  assertCan(ctx.actor, "stock.write");
  const idx = indexIngredients(await loadIngredients(ctx.db));
  const ing = stockIngredient(idx, input.ingredientId);
  if (!(input.qty > 0)) throw new ServiceError("Enter the amount wasted (above zero).");
  if (ing.purchaseUnit === "piece" && !Number.isInteger(input.qty)) throw new ServiceError(`Log ${ing.name} in whole pieces.`);
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("Say why it was wasted.");
  if (!isDateStr(input.date) || input.date > addisDate(ctx.now)) throw new ServiceError("Pick today or an earlier date.");
  const qty = fromPurchaseUnits(input.qty, ing);
  const [row] = await ctx.db.insert(wasteLog).values({ ingredientId: ing.id, qty, reason, loggedOn: input.date, byUserId: actorUserId(ctx.actor) }).returning();
  return { ...row, ingredientName: ing.name, qtyUnits: toUnits(qty, ing), unit: ing.purchaseUnit };
}

export async function wasteEntries(ctx: Ctx, opts: { limit?: number } = {}) {
  assertCan(ctx.actor, "stock.read");
  const ingList = await loadIngredients(ctx.db);
  const byId = new Map(ingList.map((i) => [i.id, i]));
  const rows = await ctx.db.select({ w: wasteLog, byName: user.name }).from(wasteLog).leftJoin(user, eq(user.id, wasteLog.byUserId))
    .orderBy(desc(wasteLog.loggedOn), desc(wasteLog.createdAt)).limit(opts.limit ?? 50);
  return rows.map(({ w, byName }) => {
    const ing = byId.get(w.ingredientId)!;
    return { id: w.id, ingredientName: ing.name, unit: ing.purchaseUnit, qtyUnits: toUnits(w.qty, ing), reason: w.reason, date: w.loggedOn, byName: byName ?? null };
  });
}

