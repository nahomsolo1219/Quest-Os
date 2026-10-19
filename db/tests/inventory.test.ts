// Inventory services against a real database (rolled back): shopping list minus stock, never negative,
// egg whites as eggs, purchases update cost + history + audit, waste reduces on hand, stock counts, top-up list.
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "../schema";
import { runJob } from "../../src/server/jobs";
import type { Ctx } from "../../src/server/services/context";
import {
  logPurchase, logWaste, onHandAt, priceHistory, purchaseLog, recordStockCount, shoppingListForWeek, stockSheet, topUpList, FRESH_GROUPS,
} from "../../src/server/services/inventory";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);
const THU_LOCK = at("2026-10-22T15:00:05Z");
const FRI = at("2026-10-23T05:00:00Z"); // Friday 08:00 Addis
const WEEK = "2026-10-26";

async function staffActor(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}
const ing = async (tx: Tx, slug: string) => (await tx.select().from(s.ingredients).where(eq(s.ingredients.slug, slug)))[0];

describe("shopping list", () => {
  it("is required minus stock on hand, never negative, with purchase units and price missing", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: ops, now: FRI };
      const before = await shoppingListForWeek(ctx, WEEK);
      expect(before.mealsCount).toBeGreaterThan(0);
      const chicken = await ing(tx, "chicken-breast");
      const line = before.lines.find((l) => l.ingredientId === chicken.id)!;
      expect(line.needQty).toBeGreaterThan(0);
      expect(line.onHand).toBe(0);
      expect(line.unit).toBe("kg");
      expect(line.buyUnits).toBe(Math.ceil(line.needQty / 100 - 1e-9) / 10);
      expect(line.costBirr).toBeNull(); // seed has no prices
      expect(before.missingPrices).toContain("Chicken breast");

      // Sunday-before-the-week count of 2 kg reduces the need by 2 kg
      await recordStockCount({ ...ctx, now: at("2026-10-25T14:00:00Z") }, { ingredientId: chicken.id, countDate: "2026-10-25", qty: 2 });
      const after = await shoppingListForWeek({ ...ctx, now: at("2026-10-25T14:00:00Z") }, WEEK);
      const l2 = after.lines.find((l) => l.ingredientId === chicken.id)!;
      expect(l2.onHand).toBe(2000);
      expect(l2.buyQty).toBe(Math.max(0, line.needQty - 2000));

      // a huge count never makes the list negative
      await recordStockCount({ ...ctx, now: at("2026-10-25T14:00:00Z") }, { ingredientId: chicken.id, countDate: "2026-10-25", qty: 9999 });
      const l3 = (await shoppingListForWeek({ ...ctx, now: at("2026-10-25T14:00:00Z") }, WEEK)).lines.find((l) => l.ingredientId === chicken.id)!;
      expect(l3.buyQty).toBe(0);
      expect(l3.buyUnits).toBe(0);
      for (const l of after.lines) expect(l.buyQty).toBeGreaterThanOrEqual(0);
    });
  });

  it("counts egg whites as eggs", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const list = await shoppingListForWeek({ db: tx, actor: ops, now: FRI }, WEEK);
      const eggs = await ing(tx, "eggs");
      const white = await ing(tx, "egg-white");
      expect(list.lines.some((l) => l.ingredientId === white.id)).toBe(false);
      const meals = await tx.select().from(s.orderMeals);
      const ids = new Set([eggs.id, white.id]);
      const pieces = meals.filter((m) => m.cookDate >= WEEK && m.cookDate <= "2026-11-01")
        .flatMap((m) => m.items).flatMap((i) => i.ingredients).filter((x) => ids.has(x.ingredientId)).reduce((a, x) => a + x.qty, 0);
      expect(pieces).toBeGreaterThan(0);
      expect(list.lines.find((l) => l.ingredientId === eggs.id)!.needQty).toBeCloseTo(pieces, 5);
    });
  });

  it("kitchen cannot see the priced shopping list", async () => {
    await inRollback(db, async (tx) => {
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      await expect(shoppingListForWeek({ db: tx, actor: kitchen, now: FRI }, WEEK)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

describe("purchases", () => {
  it("logging a purchase updates the ingredient cost, price history and audit log", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-24T08:00:00Z") };
      const chicken = await ing(tx, "chicken-breast");
      const r = await logPurchase(ctx, { ingredientId: chicken.id, qty: 4.5, totalPriceBirr: 2925, supplier: "Shola market", purchasedOn: "2026-10-24" });
      expect(r.unitCostBirr).toBe(650);
      expect(r.purchase.qty).toBe(4500);
      const [after] = await tx.select().from(s.ingredients).where(eq(s.ingredients.id, chicken.id));
      expect(after.costPerUnitBirr).toBe(650);
      expect(after.supplier).toBe("Shola market");
      const hist = await priceHistory(ctx, chicken.id);
      expect(hist.history[0]).toMatchObject({ costPerUnitBirr: 650, source: "purchase" });
      const audits = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.entity, "ingredient"), eq(s.auditLog.entityId, chicken.id)));
      expect(audits).toHaveLength(1);
      expect(audits[0].actorUserId).toBe(ops.userId);
      const log = await purchaseLog(ctx);
      expect(log[0]).toMatchObject({ ingredientName: "Chicken breast", qtyUnits: 4.5, unitCostBirr: 650 });

      // the purchase adds to on hand; egg whites cannot be bought directly
      const stock = await onHandAt(tx, "2026-10-24");
      expect(stock[chicken.id].onHand).toBe(4500);
      const white = await ing(tx, "egg-white");
      await expect(logPurchase(ctx, { ingredientId: white.id, qty: 10, totalPriceBirr: 100, purchasedOn: "2026-10-24" })).rejects.toThrow(/Eggs/);
    });
  });

  it("only operations log purchases", async () => {
    await inRollback(db, async (tx) => {
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const chicken = await ing(tx, "chicken-breast");
      await expect(logPurchase({ db: tx, actor: kitchen, now: FRI }, { ingredientId: chicken.id, qty: 1, totalPriceBirr: 600, purchasedOn: "2026-10-23" }))
        .rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

describe("stock and waste", () => {
  it("waste reduces on hand; counts are one row per ingredient and date; matches-expected stores the expected amount", async () => {
    await inRollback(db, async (tx) => {
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: kitchen, now: at("2026-10-25T14:00:00Z") };
      const rice = await ing(tx, "rice");
      await recordStockCount(ctx, { ingredientId: rice.id, countDate: "2026-10-24", qty: 5 });
      await logWaste(ctx, { ingredientId: rice.id, qty: 0.5, reason: "Spilled", date: "2026-10-25" });
      expect((await onHandAt(tx, "2026-10-25"))[rice.id].onHand).toBe(4500);
      const sheet = await stockSheet(ctx, "2026-10-25");
      const line = sheet.lines.find((l) => l.ingredientId === rice.id)!;
      expect(line.expectedQty).toBe(4500);
      expect(line.countedQty).toBeNull();
      await recordStockCount(ctx, { ingredientId: rice.id, countDate: "2026-10-25", matchesExpected: true });
      await recordStockCount(ctx, { ingredientId: rice.id, countDate: "2026-10-25", matchesExpected: true });
      const rows = await tx.select().from(s.stockCounts).where(and(eq(s.stockCounts.ingredientId, rice.id), eq(s.stockCounts.countDate, "2026-10-25")));
      expect(rows).toHaveLength(1);
      expect(rows[0].qty).toBe(4500);
      const sheet2 = await stockSheet(ctx, "2026-10-25");
      expect(sheet2.counted).toBe(1);
      expect(sheet2.lines.find((l) => l.ingredientId === rice.id)!.expectedQty).toBe(4500);
      await expect(recordStockCount(ctx, { ingredientId: rice.id, countDate: "2026-10-30", qty: 1 })).rejects.toThrow(/future/);
      await expect(logWaste(ctx, { ingredientId: rice.id, qty: 1, reason: " ", date: "2026-10-25" })).rejects.toThrow(/why/);
    });
  });

  it("usage of locked meals after the count reduces on hand", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: kitchen, now: at("2026-10-27T14:00:00Z") };
      const oats = await ing(tx, "oats");
      await recordStockCount(ctx, { ingredientId: oats.id, countDate: "2026-10-25", qty: 100 });
      const used = (await tx.select().from(s.orderMeals).where(eq(s.orderMeals.cookDate, WEEK)))
        .flatMap((m) => m.items).flatMap((i) => i.ingredients).filter((x) => x.ingredientId === oats.id).reduce((a, x) => a + x.qty, 0);
      expect(used).toBeGreaterThan(0);
      expect((await onHandAt(tx, WEEK))[oats.id].onHand).toBe(Math.round(100000 - used));
    });
  });
});

describe("top-up list", () => {
  it("lists only fresh items needed by quick starts of the cook date", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      // weekly orders only: nothing to top up
      const none = await topUpList({ db: tx, actor: ops, now: FRI }, WEEK);
      expect(none.lines).toHaveLength(0);
      // mark one client's Monday as a quick start day
      const [day] = await tx.select().from(s.orderDays).where(eq(s.orderDays.cookDate, WEEK)).limit(1);
      await tx.update(s.orderDays).set({ isQuickStart: true }).where(eq(s.orderDays.id, day.id));
      const list = await topUpList({ db: tx, actor: ops, now: FRI }, WEEK);
      expect(list.quickStartClients).toBe(1);
      expect(list.lines.length).toBeGreaterThan(0);
      const groups = new Map((await tx.select().from(s.ingredients)).map((i) => [i.id, i.foodGroup]));
      for (const l of list.lines) expect(FRESH_GROUPS).toContain(groups.get(l.ingredientId));
    });
  });
});
