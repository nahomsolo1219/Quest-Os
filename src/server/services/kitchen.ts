// Kitchen production (module 8): production sheet, recipe cards, packing list and labels for a cook date.
// Reads locked orders only. Kitchen staff never see phone numbers or prices: nothing here returns them.
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { areas, clients, meals as mealsTable, orderDays, orderMeals, weeklyOrders } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertCan } from "@/server/authz";
import { labels, packingList, productionSheet, type OrderMealRow, type ProductionRow } from "@/domain/production";
import { SLOT_ORDER } from "@/domain/recipes";
import { toPurchaseUnits } from "@/domain/shopping";
import { addDays, addisDate } from "@/domain/time";
import { PROFILES, type DateStr, type DeliveryOption, type Profile, type PurchaseUnit, type ResolvedItem, type Slot } from "@/domain/types";
import type { Ctx } from "./context";
import { loadIngredients, loadMeals, loadPortions } from "./menu-data";

export type KitchenMealRow = OrderMealRow & { isQuickStart: boolean; deliveryOption: DeliveryOption };

/** Locked order meals cooked on `cookDate` (weekly and quick start), with the meal name. Server-internal. */
export async function lockedMealsForCookDate(db: DbOrTx, cookDate: DateStr): Promise<KitchenMealRow[]> {
  const rows = await db
    .select({ m: orderMeals, serviceDate: orderDays.serviceDate, isQuickStart: orderDays.isQuickStart, deliveryOption: sql<DeliveryOption>`coalesce(${orderDays.deliveryOption}, ${weeklyOrders.deliveryOption})`, mealName: mealsTable.name })
    .from(orderMeals)
    .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
    .innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
    .innerJoin(mealsTable, eq(mealsTable.id, orderMeals.mealId))
    .where(and(eq(orderMeals.cookDate, cookDate), eq(weeklyOrders.status, "locked")));
  return rows.map(toRow);
}

/** Locked order meals with cook dates in [from, to]. Server-internal (inventory uses it for usage and needs). */
export async function lockedMealsBetween(db: DbOrTx, from: DateStr, to: DateStr): Promise<KitchenMealRow[]> {
  if (from > to) return [];
  const rows = await db
    .select({ m: orderMeals, serviceDate: orderDays.serviceDate, isQuickStart: orderDays.isQuickStart, deliveryOption: sql<DeliveryOption>`coalesce(${orderDays.deliveryOption}, ${weeklyOrders.deliveryOption})`, mealName: mealsTable.name })
    .from(orderMeals)
    .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
    .innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
    .innerJoin(mealsTable, eq(mealsTable.id, orderMeals.mealId))
    .where(and(gte(orderMeals.cookDate, from), lte(orderMeals.cookDate, to), eq(weeklyOrders.status, "locked")));
  return rows.map(toRow);
}

function toRow(r: { m: typeof orderMeals.$inferSelect; serviceDate: string; isQuickStart: boolean; deliveryOption: DeliveryOption; mealName: string }): KitchenMealRow {
  return {
    id: r.m.id, clientId: r.m.clientId, serviceDate: r.serviceDate, mealId: r.m.mealId, mealName: r.mealName, slot: r.m.slot, profile: r.m.profile,
    items: r.m.items as unknown as ResolvedItem[], kcal: r.m.kcal, proteinG: r.m.proteinG, carbG: r.m.carbG, fatG: r.m.fatG,
    conflicts: r.m.conflicts, cookDate: r.m.cookDate, eatBy: r.m.eatBy, isQuickStart: r.isQuickStart, deliveryOption: r.deliveryOption,
  };
}

/** Name, allergies, dislikes and area of clients (no phone, no address). */
async function kitchenClients(db: DbOrTx, clientIds: string[]) {
  if (clientIds.length === 0) return [];
  return db
    .select({ clientId: clients.id, firstName: clients.firstName, lastName: clients.lastName, allergies: clients.allergies, dislikes: clients.dislikes, areaName: areas.name })
    .from(clients).leftJoin(areas, eq(areas.id, clients.areaId))
    .where(inArray(clients.id, clientIds));
}

// ---------------------------------------------------------------------------------------------------------------
// Cook-day picker

export type CookDay = { date: DateStr; meals: number; clients: number; quickStartMeals: number };

/** Today, tomorrow and every cook date with locked meals from today to 13 days ahead. */
export async function cookDays(ctx: Ctx): Promise<{ today: DateStr; days: CookDay[] }> {
  assertCan(ctx.actor, "kitchen.read");
  const today = addisDate(ctx.now);
  const to = addDays(today, 13);
  const rows = await ctx.db
    .select({
      date: orderMeals.cookDate,
      meals: sql<number>`count(*)::int`,
      clients: sql<number>`count(distinct ${orderMeals.clientId})::int`,
      quickStartMeals: sql<number>`count(*) filter (where ${orderDays.isQuickStart})::int`,
    })
    .from(orderMeals)
    .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
    .innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
    .where(and(gte(orderMeals.cookDate, today), lte(orderMeals.cookDate, to), eq(weeklyOrders.status, "locked")))
    .groupBy(orderMeals.cookDate)
    .orderBy(asc(orderMeals.cookDate));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const dates = [...new Set([today, addDays(today, 1), ...rows.map((r) => r.date)])].sort();
  return { today, days: dates.map((d) => byDate.get(d) ?? { date: d, meals: 0, clients: 0, quickStartMeals: 0 }) };
}

// ---------------------------------------------------------------------------------------------------------------
// Production sheet

export type ProductionView = {
  cookDate: DateStr;
  mealsCount: number;
  clientsCount: number;
  quickStartMeals: number;
  quickStartClients: number;
  rows: (ProductionRow & { quickStartCount: number })[];
  /** per meal: portions per profile (for the column headers) */
  profiles: Profile[];
  ingredients: { ingredientId: string; name: string; qty: number; unit: "g" | "piece"; purchaseQty: number; purchaseUnit: PurchaseUnit }[];
};

const rowKey = (r: { mealId: string; partName: string; unit: string }) => `${r.mealId}|${r.partName}|${r.unit}`;

export async function productionForDate(ctx: Ctx, cookDate: DateStr): Promise<ProductionView> {
  assertCan(ctx.actor, "kitchen.read");
  const [rows, ingList] = await Promise.all([lockedMealsForCookDate(ctx.db, cookDate), loadIngredients(ctx.db)]);
  const sheet = productionSheet(rows, cookDate);
  const qs = productionSheet(rows.filter((r) => r.isQuickStart), cookDate);
  const qsCount = new Map(qs.rows.map((r) => [rowKey(r), r.perProfile.reduce((s, c) => s + c.count, 0)]));
  const ingById = new Map(ingList.map((i) => [i.id, i]));
  const profiles = PROFILES.filter((p) => rows.some((r) => r.profile === p));
  return {
    cookDate,
    mealsCount: sheet.mealsCount,
    clientsCount: new Set(rows.map((r) => r.clientId)).size,
    quickStartMeals: rows.filter((r) => r.isQuickStart).length,
    quickStartClients: new Set(rows.filter((r) => r.isQuickStart).map((r) => r.clientId)).size,
    rows: sheet.rows.map((r) => ({ ...r, quickStartCount: qsCount.get(rowKey(r)) ?? 0 })),
    profiles,
    ingredients: sheet.ingredients
      .map((x) => {
        const ing = ingById.get(x.ingredientId);
        const unit: "g" | "piece" = ing?.purchaseUnit === "piece" ? "piece" : "g";
        return {
          ingredientId: x.ingredientId, name: ing?.name ?? "Unknown", qty: x.qty, unit,
          purchaseQty: ing ? toPurchaseUnits(x.qty, ing.purchaseUnit, ing.gramsPerUnit) : x.qty,
          purchaseUnit: ing?.purchaseUnit ?? "kg",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Recipe cards

export type RecipeCard = {
  mealId: string;
  mealName: string;
  description: string;
  slot: Slot;
  portions: number;
  countByProfile: { profile: Profile; count: number }[];
  parts: {
    partId: string;
    name: string;
    category: string;
    unit: "g" | "piece";
    baseQty: number;
    ingredients: { name: string; qty: number }[];
    /** grams (or pieces) per profile actually ordered today */
    perProfile: { profile: Profile; qty: number | null }[];
  }[];
  seasonings: string[];
  pantry: string[];
  /** swapped or added items ordered today, with portion counts */
  swaps: { partName: string; unit: "g" | "piece"; qty: number; profile: Profile; count: number }[];
};

export async function recipeCards(ctx: Ctx, cookDate: DateStr): Promise<RecipeCard[]> {
  assertCan(ctx.actor, "kitchen.read");
  const [rows, mealList, ingList, portions] = await Promise.all([
    lockedMealsForCookDate(ctx.db, cookDate), loadMeals(ctx.db), loadIngredients(ctx.db), loadPortions(ctx.db),
  ]);
  const ingById = new Map(ingList.map((i) => [i.id, i]));
  const mealIds = [...new Set(rows.map((r) => r.mealId))];
  const cards: RecipeCard[] = [];
  for (const mealId of mealIds) {
    const meal = mealList.find((m) => m.id === mealId);
    if (!meal) continue;
    const mine = rows.filter((r) => r.mealId === mealId);
    const countByProfile = PROFILES.map((p) => ({ profile: p, count: mine.filter((r) => r.profile === p).length })).filter((c) => c.count > 0);
    const seasonings = new Set<string>();
    const parts = meal.parts.filter((p) => {
      if (p.category === "seasoning") {
        for (const pi of p.ingredients) seasonings.add(ingById.get(pi.ingredientId)?.name ?? "");
        return false;
      }
      return true;
    }).map((p) => ({
      partId: p.id, name: p.name, category: p.category, unit: p.unit, baseQty: p.baseQty,
      ingredients: p.ingredients.map((pi) => ({ name: ingById.get(pi.ingredientId)?.name ?? "Unknown", qty: pi.qty })),
      perProfile: countByProfile.map((c) => ({ profile: c.profile, qty: portions[c.profile]?.[p.id] ?? null })),
    }));
    const swapMap = new Map<string, { partName: string; unit: "g" | "piece"; qty: number; profile: Profile; count: number }>();
    for (const r of mine) {
      for (const it of r.items) {
        if (!it.source) continue;
        const key = `${it.partName}|${it.unit}|${it.qty}|${r.profile}`;
        const cur = swapMap.get(key) ?? { partName: it.partName, unit: it.unit, qty: it.qty, profile: r.profile, count: 0 };
        cur.count += 1;
        swapMap.set(key, cur);
      }
    }
    cards.push({
      mealId, mealName: meal.name, description: meal.description, slot: meal.slot, portions: mine.length, countByProfile, parts,
      seasonings: [...seasonings].filter(Boolean).sort(), pantry: meal.pantry,
      swaps: [...swapMap.values()].sort((a, b) => a.partName.localeCompare(b.partName) || PROFILES.indexOf(a.profile) - PROFILES.indexOf(b.profile)),
    });
  }
  return cards.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.mealName.localeCompare(b.mealName));
}

// ---------------------------------------------------------------------------------------------------------------
// Packing list

export type PackingView = {
  clientId: string;
  name: string;
  allergies: string[];
  areaName: string | null;
  delivery: "delivery" | "pickup";
  isQuickStart: boolean;
  injeraSeparate: boolean;
  conflicts: string[];
  hasConflicts: boolean;
  meals: { serviceDate: DateStr; mealName: string; slot: Slot; profile: Profile; items: { partName: string; qty: number; unit: "g" | "piece"; swapped: boolean }[]; conflicts: string[]; eatBy: DateStr }[];
};

export async function packingForDate(ctx: Ctx, cookDate: DateStr): Promise<PackingView[]> {
  assertCan(ctx.actor, "kitchen.read");
  const [rows, ingList] = await Promise.all([lockedMealsForCookDate(ctx.db, cookDate), loadIngredients(ctx.db)]);
  const cs = await kitchenClients(ctx.db, [...new Set(rows.map((r) => r.clientId))]);
  const injeraIds = new Set(ingList.filter((i) => i.name.toLowerCase() === "injera").map((i) => i.id));
  const list = packingList(rows, cs);
  return list.map((e) => {
    const mine = rows.filter((r) => r.clientId === e.clientId);
    const c = cs.find((x) => x.clientId === e.clientId);
    return {
      ...e,
      areaName: c?.areaName ?? null,
      delivery: mine.some((r) => r.deliveryOption !== "pickup") ? "delivery" : "pickup",
      isQuickStart: mine.some((r) => r.isQuickStart),
      injeraSeparate: mine.some((r) => r.items.some((it) => it.ingredients.some((pi) => injeraIds.has(pi.ingredientId)))),
      meals: e.meals.map((m) => ({
        ...m,
        eatBy: mine.find((r) => r.serviceDate === m.serviceDate && r.slot === m.slot)?.eatBy ?? cookDate,
      })),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Labels

export async function labelsForDate(ctx: Ctx, cookDate: DateStr) {
  assertCan(ctx.actor, "kitchen.read");
  const rows = await lockedMealsForCookDate(ctx.db, cookDate);
  const cs = await kitchenClients(ctx.db, [...new Set(rows.map((r) => r.clientId))]);
  return labels(rows, cs);
}
