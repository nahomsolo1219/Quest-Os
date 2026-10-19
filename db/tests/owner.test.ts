// Owner services: settings change log (SET-02, PLN-03, SEC-06), ingredient prices with history (SET-03, DATA-03),
// packages (PLN-09), swap table (SWP-10), areas, dashboard numbers (DSH-01…06) and the partner log (DSH-07, DSH-08).
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "../schema";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import type { Ctx } from "../../src/server/services/context";
import { loadSettings, updateSettings } from "../../src/server/services/settings";
import {
  changeLog, createArea, createSwapRule, listIngredients, listPackages, listSwapRules, moveArea, setIngredientNutrition, setIngredientPrice, updatePackage, updateSwapRule,
} from "../../src/server/services/catalog";
import { ownerDashboard } from "../../src/server/services/dashboard";
import { addContribution, deleteContribution, listContributions } from "../../src/server/services/partners";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const NOW = new Date("2026-10-19T07:00:00Z");

async function staff(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}
const ctxOf = (tx: Tx, actor: Actor): Ctx => ({ db: tx, actor, now: NOW });

describe("pricing settings", () => {
  it("owner change is saved with a change-log row (who, before, after)", async () => {
    await inRollback(db, async (tx) => {
      const dagi = await staff(tx, "dagi@questmeals.demo");
      const before = (await loadSettings(tx)).pricing;
      const next = { ...before, buffers: { ...before.buffers, chicken: 0.2 }, dropCostBirr: 175 };
      await updateSettings(ctxOf(tx, dagi), "pricing", next, "Fuel went up");
      expect((await loadSettings(tx)).pricing.dropCostBirr).toBe(175);
      const log = await changeLog(ctxOf(tx, dagi), { entity: "settings" });
      const row = log.find((r) => r.a.entityId === "pricing")!;
      expect(row.a.actorUserId).toBe(dagi.userId);
      expect(row.actorName).toBe("Dagi Bekele");
      expect((row.a.before as { dropCostBirr: number }).dropCostBirr).toBe(150);
      expect((row.a.after as { buffers: { chicken: number } }).buffers.chicken).toBe(0.2);
      expect(row.a.reason).toBe("Fuel went up");
    });
  });

  it("invalid settings are rejected with a message; weekly delivery is blocked", async () => {
    await inRollback(db, async (tx) => {
      const dagi = await staff(tx, "dagi@questmeals.demo");
      const p = (await loadSettings(tx)).pricing;
      await expect(updateSettings(ctxOf(tx, dagi), "pricing", { ...p, marginFloor: 1.5 })).rejects.toThrow(/marginFloor/);
      await expect(updateSettings(ctxOf(tx, dagi), "pricing", { ...p, enabledDeliveryOptions: [] })).rejects.toThrow(/enabledDeliveryOptions/);
      await expect(updateSettings(ctxOf(tx, dagi), "pricing", { ...p, enabledDeliveryOptions: ["daily", "weekly"] })).rejects.toThrow(/Weekly delivery/);
      const sched = (await loadSettings(tx)).schedule;
      await expect(updateSettings(ctxOf(tx, dagi), "schedule", { ...sched, weeklyCutoffTime: "25:00" })).rejects.toThrow(/HH:mm/);
    });
  });

  it("operations and the nutritionist cannot change pricing (SEC-06)", async () => {
    await inRollback(db, async (tx) => {
      const p = (await loadSettings(tx)).pricing;
      for (const email of ["nebiyou@questmeals.demo", "nutritionist@questmeals.demo"]) {
        await expect(updateSettings(ctxOf(tx, await staff(tx, email)), "pricing", p)).rejects.toBeInstanceOf(ForbiddenError);
      }
    });
  });
});

describe("ingredients", () => {
  it("a price change writes a manual ingredient_prices history row and an audit row; missing count drops", async () => {
    await inRollback(db, async (tx) => {
      const dagi = await staff(tx, "dagi@questmeals.demo");
      const before = await listIngredients(ctxOf(tx, dagi));
      expect(before.missingCount).toBeGreaterThan(0);
      const [chicken] = await tx.select().from(s.ingredients).where(eq(s.ingredients.slug, "chicken-breast"));
      await setIngredientPrice(ctxOf(tx, dagi), { id: chicken.id, costPerUnitBirr: 650, supplier: "Shola market" });
      const hist = await tx.select().from(s.ingredientPrices).where(eq(s.ingredientPrices.ingredientId, chicken.id));
      expect(hist).toHaveLength(1);
      expect(hist[0]).toMatchObject({ costPerUnitBirr: 650, source: "manual", setByUserId: dagi.userId });
      const audit = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.action, "price.update"), eq(s.auditLog.entityId, "chicken-breast")));
      expect(audit[0].before).toMatchObject({ costPerUnitBirr: null });
      expect(audit[0].after).toMatchObject({ costPerUnitBirr: 650, supplier: "Shola market" });
      expect((await listIngredients(ctxOf(tx, dagi))).missingCount).toBe(before.missingCount - 1);
      await expect(setIngredientPrice(ctxOf(tx, dagi), { id: chicken.id, costPerUnitBirr: -5 })).rejects.toThrow(/whole birr/);
      // nutritionist edits nutrition values, but not prices
      const hana = await staff(tx, "nutritionist@questmeals.demo");
      await setIngredientNutrition(ctxOf(tx, hana), { id: chicken.id, kcal: 121, proteinG: 23.5, carbG: 0, fatG: 2.5 });
      await expect(setIngredientPrice(ctxOf(tx, hana), { id: chicken.id, costPerUnitBirr: 700 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setIngredientNutrition(ctxOf(tx, hana), { id: chicken.id, kcal: 121, proteinG: 60, carbG: 30, fatG: 20 })).rejects.toThrow(/100 g/);
    });
  });
});

describe("packages, swap table, areas", () => {
  it("package edits are validated and audited; only owners", async () => {
    await inRollback(db, async (tx) => {
      const dagi = await staff(tx, "dagi@questmeals.demo");
      const [pkg] = (await listPackages(ctxOf(tx, dagi))).filter((p) => p.code === "essential");
      const input = { id: pkg.id, name: pkg.name, swapLimit: 4, checkinIntervalDays: pkg.checkinIntervalDays, coaching: pkg.coaching,
        deliveryOptions: pkg.deliveryOptions, serviceFeeMonthBirr: 500, prioritySlot: pkg.prioritySlot, active: true };
      const u = await updatePackage(ctxOf(tx, dagi), input);
      expect(u.swapLimit).toBe(4);
      expect(u.serviceFeeMonthBirr).toBe(500);
      const log = await changeLog(ctxOf(tx, dagi), { entity: "packages" });
      expect(log[0].a).toMatchObject({ action: "package.update", entityId: "essential" });
      await expect(updatePackage(ctxOf(tx, dagi), { ...input, deliveryOptions: ["three_drops"] })).rejects.toThrow(/Enable three_drops/);
      await expect(updatePackage(ctxOf(tx, await staff(tx, "nebiyou@questmeals.demo")), input)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("swap rules can be edited and added, with audit", async () => {
    await inRollback(db, async (tx) => {
      const hana = await staff(tx, "nutritionist@questmeals.demo");
      const t = await listSwapRules(ctxOf(tx, hana));
      const tilapia = t.rules.find((r) => r.fromText.includes("Tilapia"))!;
      await updateSwapRule(ctxOf(tx, hana), { id: tilapia.id, label: "Fish → chicken", active: false, qtyMode: "same", qtyValue: null, costMode: "zero" });
      const [r] = await tx.select().from(s.swapRules).where(eq(s.swapRules.id, tilapia.id));
      expect(r).toMatchObject({ label: "Fish → chicken", active: false });
      const rice = t.ingredients.find((i) => i.name === "Rice")!;
      const sweet = t.ingredients.find((i) => i.name === "Sweet potatoes")!;
      await expect(createSwapRule(ctxOf(tx, hana), { label: "Rice → sweet potato", fromIngredientIds: [rice.id], toIngredientId: sweet.id, qtyMode: "fixed", qtyValue: null, costMode: "zero" }))
        .rejects.toThrow(/grams/);
      const created = await createSwapRule(ctxOf(tx, hana), { label: "Rice → sweet potato", fromIngredientIds: [rice.id], toIngredientId: sweet.id, qtyMode: "fixed", qtyValue: 150, costMode: "zero" });
      expect(created.fromKind).toBe("ingredient");
      const log = await changeLog(ctxOf(tx, await staff(tx, "dagi@questmeals.demo")), { entity: "swap_rules" });
      expect(log.map((l) => l.a.action)).toEqual(expect.arrayContaining(["swap_rule.update", "swap_rule.create"]));
      await expect(updateSwapRule(ctxOf(tx, await staff(tx, "kitchen@questmeals.demo")), { id: tilapia.id, label: "x", active: true, qtyMode: "same", qtyValue: null, costMode: "zero" }))
        .rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("areas can be added (unique) and reordered", async () => {
    await inRollback(db, async (tx) => {
      const dagi = await staff(tx, "dagi@questmeals.demo");
      const a = await createArea(ctxOf(tx, dagi), { name: "Summit" });
      await expect(createArea(ctxOf(tx, dagi), { name: "summit" })).rejects.toThrow(/already/);
      const list = await moveArea(ctxOf(tx, dagi), { id: a.id, direction: "up" });
      expect(list[list.length - 2].id).toBe(a.id);
    });
  });
});

describe("dashboard", () => {
  it("returns numbers for the demo data", async () => {
    await inRollback(db, async (tx) => {
      const d = await ownerDashboard(ctxOf(tx, await staff(tx, "fahim@questmeals.demo")));
      expect(d.today).toBe("2026-10-19");
      expect(d.kpis.activeClients).toBe(8);
      expect(d.kpis.mrr).toBeGreaterThan(400_000);
      expect(d.kpis.newThisMonth).toBe(9);
      expect(d.kpis.collected).toBeGreaterThan(0);
      expect(d.kpis.invoiced).toBeGreaterThan(0);
      expect(d.kpis.foodCostPct).toBe(0);
      expect(typeof d.kpis.marginEstimate).toBe("number");
      expect(Array.isArray(d.attention)).toBe(true);
      expect(Array.isArray(d.ratings)).toBe(true);
    });
  });

  it("is owner only (DSH-08)", async () => {
    await inRollback(db, async (tx) => {
      for (const email of ["nebiyou@questmeals.demo", "nutritionist@questmeals.demo", "kitchen@questmeals.demo"]) {
        await expect(ownerDashboard(ctxOf(tx, await staff(tx, email)))).rejects.toBeInstanceOf(ForbiddenError);
        await expect(listContributions(ctxOf(tx, await staff(tx, email)))).rejects.toBeInstanceOf(ForbiddenError);
      }
    });
  });
});

describe("partner log", () => {
  it("adds entries and totals per partner (cash birr, hours, count by type)", async () => {
    await inRollback(db, async (tx) => {
      const dagi = await staff(tx, "dagi@questmeals.demo");
      const kidus = await staff(tx, "kidus@questmeals.demo");
      const before = await listContributions(ctxOf(tx, dagi));
      expect(before.partners).toHaveLength(3);
      const k0 = before.totals.find((t) => t.partnerUserId === kidus.userId)!;
      await addContribution(ctxOf(tx, dagi), { partnerUserId: kidus.userId, contributedOn: "2026-10-18", type: "cash", amountBirr: 20000, note: "Packaging" });
      const e = await addContribution(ctxOf(tx, dagi), { partnerUserId: kidus.userId, contributedOn: "2026-10-19", type: "time", hours: 3.5 });
      await expect(addContribution(ctxOf(tx, dagi), { partnerUserId: kidus.userId, contributedOn: "2026-10-19", type: "cash" })).rejects.toThrow(/cash amount/);
      await expect(addContribution(ctxOf(tx, dagi), { partnerUserId: (await staff(tx, "nebiyou@questmeals.demo")).userId, contributedOn: "2026-10-19", type: "time", hours: 1 }))
        .rejects.toThrow(/partners/);
      const after = await listContributions(ctxOf(tx, dagi));
      const k = after.totals.find((t) => t.partnerUserId === kidus.userId)!;
      expect(k.cashBirr).toBe(k0.cashBirr + 20000);
      expect(k.hours).toBe(k0.hours + 3.5);
      expect(k.byType.cash).toBe(k0.byType.cash + 1);
      expect(k.count).toBe(k0.count + 2);
      expect(after.entries[0].c.id).toBe(e.id); // newest first
      await deleteContribution(ctxOf(tx, dagi), { id: e.id });
      expect((await listContributions(ctxOf(tx, dagi))).totals.find((t) => t.partnerUserId === kidus.userId)!.hours).toBe(k0.hours);
    });
  });
});
