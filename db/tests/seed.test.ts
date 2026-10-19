import { count, eq, sql as dsql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import * as s from "../schema";
import { DEMO_STAFF, removeDemo, seedPortions, seedReference } from "../seed";
import { SEED_INGREDIENTS, SEED_MEALS, SEED_PACKAGES, SEED_SWAP_RULES } from "../../src/domain/seed-data";
import { SETTINGS_DEFAULTS } from "../../src/domain/settings";
import { inRollback, testDb } from "./helpers";

const { db, sql } = testDb();
afterAll(() => sql.end({ timeout: 5 }));

const total = async (table: PgTable, where?: SQL) => {
  const [r] = await (where ? db.select({ n: count() }).from(table).where(where) : db.select({ n: count() }).from(table));
  return Number(r.n);
};

const partCount = SEED_MEALS.reduce((n, m) => n + m.parts.length, 0);
const partIngredientCount = SEED_MEALS.reduce((n, m) => n + m.parts.reduce((k, p) => k + p.ingredients.length, 0), 0);

describe("reference seed", () => {
  it("seeds every ingredient with no price", async () => {
    expect(await total(s.ingredients)).toBe(SEED_INGREDIENTS.length);
    expect(await total(s.ingredients, dsql`${s.ingredients.costPerUnitBirr} is not null`)).toBe(0);
    const [white] = await db.select().from(s.ingredients).where(eq(s.ingredients.slug, "egg-white"));
    const [eggs] = await db.select().from(s.ingredients).where(eq(s.ingredients.slug, "eggs"));
    expect(white.stockIngredientId).toBe(eggs.id);
    expect(eggs.kcal).toBe(72);
    const [oil] = await db.select().from(s.ingredients).where(eq(s.ingredients.slug, "cooking-oil"));
    expect(oil).toMatchObject({ purchaseUnit: "litre", gramsPerUnit: 920, foodGroup: "oil" });
  });

  it("seeds 17 meals with their parts and part ingredients", async () => {
    expect(SEED_MEALS).toHaveLength(17);
    expect(await total(s.meals)).toBe(17);
    expect(await total(s.parts)).toBe(partCount);
    expect(await total(s.partIngredients)).toBe(partIngredientCount);
    const [dinner] = await db.select().from(s.meals).where(eq(s.meals.code, "A_DINNER"));
    expect(dinner.pantry).toEqual(["Rosemary", "Garlic", "Salt", "Black pepper"]);
    const parts = await db.select().from(s.parts).where(eq(s.parts.mealId, dinner.id));
    expect(parts).toHaveLength(5);
    expect(parts.find((p) => p.name === "Oil")?.baseQty).toBe(13.5);
  });

  it("seeds portions for six profiles per part", async () => {
    expect(await total(s.profilePortions)).toBe(partCount * 6);
  });

  it("seeds 10 swap rules with resolved ids", async () => {
    expect(await total(s.swapRules)).toBe(SEED_SWAP_RULES.length);
    expect(SEED_SWAP_RULES).toHaveLength(10);
    const [savory] = await db.select().from(s.swapRules).where(eq(s.swapRules.code, "SWEET_TO_SAVORY_SNACK"));
    const [savoryMeal] = await db.select().from(s.meals).where(eq(s.meals.code, "SAVORY_SNACK"));
    expect(savory).toMatchObject({ fromKind: "slot", fromSlot: "snack", toMealId: savoryMeal.id });
    const [gomen] = await db.select().from(s.swapRules).where(eq(s.swapRules.code, "GOMEN_TO_MIXED_VEG"));
    expect(gomen.toIngredientSplit).toHaveLength(2);
    expect(gomen.toIngredientSplit!.map((x) => x.fraction)).toEqual([0.6, 0.4]);
    const [beef] = await db.select().from(s.swapRules).where(eq(s.swapRules.code, "BEEF_TO_CHICKEN"));
    expect(beef.fromIngredientIds).toHaveLength(2);
  });

  it("seeds 3 packages, 8 areas and the settings defaults", async () => {
    expect(await total(s.packages)).toBe(SEED_PACKAGES.length);
    const pkgs = await db.select().from(s.packages);
    expect(pkgs.find((p) => p.code === "essential")?.deliveryOptions.sort()).toEqual(["daily", "pickup"]);
    expect(pkgs.find((p) => p.code === "premium")?.swapLimit).toBe(10);
    expect(await total(s.areas)).toBe(8);
    const rows = await db.select().from(s.settings);
    expect(rows.map((r) => r.key).sort()).toEqual(Object.keys(SETTINGS_DEFAULTS).sort());
    expect(rows.find((r) => r.key === "pricing")?.value).toEqual(SETTINGS_DEFAULTS.pricing);
  });

  it("is idempotent", async () => {
    await inRollback(db, async (tx) => {
      await seedReference(tx);
      const again = await seedPortions(tx);
      expect(again.inserted).toBe(0);
      const [r] = await tx.select({ n: count() }).from(s.ingredients);
      expect(Number(r.n)).toBe(SEED_INGREDIENTS.length);
      const [m] = await tx.select({ n: count() }).from(s.partIngredients);
      expect(Number(m.n)).toBe(partIngredientCount);
    });
  });
});

describe("demo seed", () => {
  it("creates the demo staff with their roles", async () => {
    const users = await db.select().from(s.user).where(eq(s.user.isDemo, true));
    for (const st of DEMO_STAFF) {
      const u = users.find((x) => x.email === st.email);
      expect(u?.roles.slice().sort(), st.email).toEqual([...st.roles].sort());
    }
    const withRole = (r: string) => users.filter((u) => (u.roles as string[]).includes(r)).length;
    expect(withRole("owner")).toBe(3);
    expect(withRole("coach")).toBe(2);
    expect(withRole("operations")).toBe(1);
    expect(withRole("nutritionist")).toBe(1);
    expect(withRole("kitchen")).toBe(1);
    expect(withRole("delivery")).toBe(2);
    expect(withRole("client")).toBe(9);
  });

  it("creates 10 demo clients: 8 active, 1 paused, 1 lead", async () => {
    const rows = await db.select().from(s.clients).where(eq(s.clients.isDemo, true));
    expect(rows).toHaveLength(10);
    const by = (st: string) => rows.filter((r) => r.status === st);
    expect(by("active")).toHaveLength(8);
    expect(by("paused")).toHaveLength(1);
    expect(by("lead")).toHaveLength(1);
    expect(by("lead")[0].userId).toBeNull();
    expect(rows.filter((r) => r.allergies.includes("peanut"))).toHaveLength(1);
    const user = await db.select().from(s.user).where(eq(s.user.phoneNumber, "+251911000001"));
    expect(user[0].email).toBe("251911000001@clients.questmeals.invalid");
  });

  it("creates subscriptions, the pause, invoices and payments for 2026-10-19", async () => {
    const subs = await db.select().from(s.subscriptions);
    expect(subs).toHaveLength(9);
    for (const sub of subs) {
      expect(sub.startDate).toBe("2026-10-12");
      expect(sub.priceLockedUntil).toBe("2027-02-12");
      expect(sub.planPriceBirr).toBe(sub.deliveryOption === "pickup" ? 54100 : 58400);
    }
    const paused = subs.filter((x) => x.status === "paused");
    expect(paused).toHaveLength(1);
    expect(paused[0].endDate).toBe("2026-11-18");
    const pauses = await db.select().from(s.pauses);
    expect(pauses).toEqual([expect.objectContaining({ startWeek: "2026-10-19", weeks: 1 })]);

    const invoices = await db.select().from(s.invoices);
    const issued = invoices.filter((i) => i.status === "issued");
    expect(issued.length).toBeGreaterThan(0);
    for (const i of issued) {
      expect(i.periodStart).toBe("2026-10-26");
      expect(i.dueAt.toISOString()).toBe("2026-10-22T15:00:00.000Z");
    }
    const weekly = invoices.find((i) => i.kind === "weekly" && i.status === "paid")!;
    expect([13480, 12480]).toContain(weekly.amountBirr);
    const payments = await db.select().from(s.payments);
    expect(payments).toHaveLength(invoices.filter((i) => i.status === "paid").length);
    expect(payments.every((p) => p.status === "confirmed" && p.confirmedByUserId)).toBe(true);
    expect(new Set(payments.map((p) => p.method))).toEqual(new Set(["telebirr", "cbe", "cash"]));
    expect(await total(s.weeklyOrders)).toBe(0);
    expect(await total(s.orderDays)).toBe(0);
  });

  it("removes all demo data and keeps reference data", async () => {
    await inRollback(db, async (tx) => {
      const counts = await removeDemo(tx);
      expect(counts.users).toBe(16);
      expect(counts.clients).toBe(10);
      const left = async (t: PgTable) => Number((await tx.select({ n: count() }).from(t))[0].n);
      for (const t of [s.user, s.session, s.account, s.clients, s.subscriptions, s.invoices, s.payments, s.checkins,
        s.communityPosts, s.challenges, s.partnerContributions, s.nutritionProfiles, s.pauses, s.consultations]) {
        expect(await left(t)).toBe(0);
      }
      expect(await left(s.ingredients)).toBe(SEED_INGREDIENTS.length);
      expect(await left(s.meals)).toBe(17);
      expect(await left(s.parts)).toBe(partCount);
      expect(await left(s.profilePortions)).toBe(partCount * 6);
      expect(await left(s.swapRules)).toBe(10);
      expect(await left(s.packages)).toBe(3);
      expect(await left(s.settings)).toBe(4);
      expect(await left(s.areas)).toBe(8);
    });
    // rolled back: demo data is still there for the other tests
    expect(await total(s.clients)).toBe(10);
  });
});
