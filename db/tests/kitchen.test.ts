// Kitchen services against a real database (rolled back): production totals, labels' eat-by, packing,
// quick-start marker, and kitchen permissions.
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as s from "../schema";
import { runJob } from "../../src/server/jobs";
import type { Ctx } from "../../src/server/services/context";
import { confirmPayment, paymentQueue, submitPayment } from "../../src/server/services/billing";
import { createSubscription } from "../../src/server/services/subscriptions";
import { cookDays, labelsForDate, packingForDate, productionForDate, recipeCards } from "../../src/server/services/kitchen";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import { addDays } from "../../src/domain/time";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);
const THU_LOCK = at("2026-10-22T15:00:05Z"); // Thursday 22 Oct 18:00 Addis: locks the week of 26 Oct
const WEEK = "2026-10-26";

async function staffActor(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}

describe("kitchen sheets after the Thursday lock", () => {
  it("production totals equal the sum over locked order meals, per profile × count", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: kitchen, now: at("2026-10-25T05:00:00Z") };
      const sheet = await productionForDate(ctx, WEEK);
      const meals = await tx.select().from(s.orderMeals).where(eq(s.orderMeals.cookDate, WEEK));
      expect(meals.length).toBeGreaterThan(0);
      expect(sheet.mealsCount).toBe(meals.length);
      const expected = meals.flatMap((m) => m.items).reduce((acc, it) => acc + it.qty, 0);
      const total = sheet.rows.reduce((acc, r) => acc + r.total, 0);
      expect(Math.round(total * 10) / 10).toBe(Math.round(expected * 10) / 10);
      for (const r of sheet.rows) {
        expect(r.perProfile.reduce((a, c) => a + c.total, 0)).toBeCloseTo(r.total, 5);
        for (const c of r.perProfile) expect(c.total).toBeCloseTo(c.qty * c.count, 5);
      }
      expect(sheet.quickStartMeals).toBe(0);
      expect(sheet.ingredients.length).toBeGreaterThan(0);
      // picker lists the locked week's cook days with meal counts
      const picker = await cookDays(ctx);
      expect(picker.days.find((d) => d.date === WEEK)?.meals).toBe(meals.length);
    });
  });

  it("labels carry eat-by +3 days, +2 for fish and injera meals, and the label fields", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: kitchen, now: at("2026-10-25T05:00:00Z") };
      const shortIds = new Set((await tx.select().from(s.ingredients).where(eq(s.ingredients.shortShelfLife, true))).map((i) => i.id));
      let short = 0;
      let normal = 0;
      for (let i = 0; i < 6; i++) {
        const cookDate = addDays(WEEK, i);
        const ls = await labelsForDate(ctx, cookDate);
        const rows = await tx.select({ m: s.orderMeals, name: s.meals.name }).from(s.orderMeals).innerJoin(s.meals, eq(s.meals.id, s.orderMeals.mealId))
          .where(eq(s.orderMeals.cookDate, cookDate));
        expect(ls.length).toBe(rows.length);
        for (const r of rows) {
          const isShort = r.m.items.some((it) => it.ingredients.some((x) => shortIds.has(x.ingredientId)));
          expect(r.m.eatBy).toBe(addDays(cookDate, isShort ? 2 : 3));
          if (isShort) short++; else normal++;
        }
        for (const l of ls) {
          expect(l.name).toMatch(/^\S+ \S\.$/);
          expect(l.cookDate).toBe(cookDate);
          expect(l.reheat).toBe("Reheat until steaming hot");
          expect(l.profileLabel).toMatch(/^[SML]-(Lean|Build)$/);
        }
      }
      expect(short).toBeGreaterThan(0);
      expect(normal).toBeGreaterThan(0);
    });
  });

  it("packing list and recipe cards never expose phone numbers or prices", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: kitchen, now: at("2026-10-25T05:00:00Z") };
      const packing = await packingForDate(ctx, WEEK);
      expect(packing.length).toBeGreaterThan(0);
      const json = JSON.stringify(packing) + JSON.stringify(await recipeCards(ctx, WEEK));
      expect(json).not.toMatch(/\+251/);
      expect(json).not.toMatch(/phone|price|cost/i);
      const cards = await recipeCards(ctx, WEEK);
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.some((c) => c.pantry.length > 0)).toBe(true);
      expect(cards.reduce((a, c) => a + c.portions, 0)).toBe(packing.reduce((a, p) => a + p.meals.length, 0));
    });
  });

  it("kitchen cannot read payments; clients and riders cannot read kitchen sheets", async () => {
    await inRollback(db, async (tx) => {
      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const rider = await staffActor(tx, "rider@questmeals.demo");
      await expect(paymentQueue({ db: tx, actor: kitchen, now: new Date() })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(productionForDate({ db: tx, actor: rider, now: new Date() }, WEEK)).rejects.toBeInstanceOf(ForbiddenError);
      const client: Actor = { userId: rider.userId, roles: ["client"], clientId: null, name: "x" };
      await expect(labelsForDate({ db: tx, actor: client, now: new Date() }, WEEK)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

describe("quick start on the production sheet (KIT-07)", () => {
  it("a quick start locked at 18:00 appears on the next day's sheet with a quick-start count", async () => {
    await inRollback(db, async (tx) => {
      await tx.update(s.ingredients).set({ costPerUnitBirr: sql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const [c] = await tx.insert(s.clients).values({ firstName: "Quick", lastName: "Starter", phone: "+251922100001", status: "lead", sex: "male", age: 30,
        weightG: 80000, heightCm: 180, activity: "moderate", goal: "lean", allergies: [], dislikes: [] }).returning();
      await tx.insert(s.nutritionProfiles).values({ clientId: c.id, bmr: 1780, tdee: 2759, suggestedKcal: 2207, suggestedSize: "M", suggestedProteinG: 158,
        suggestedCarbG: 210, suggestedFatG: 70, kcalTarget: 2100, size: "M", goal: "lean", proteinG: 158, carbG: 210, fatG: 70, provisional: true, isCurrent: true });
      const [pkg] = await tx.select().from(s.packages).where(eq(s.packages.code, "essential"));
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-21T07:00:00Z") };
      const q = await createSubscription(ctx, { clientId: c.id, packageId: pkg.id, deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" });
      const p = await submitPayment(ctx, { invoiceId: q.invoice.id, method: "cash" });
      await confirmPayment(ctx, p.id);
      await runJob(tx as never, "daily-quick-start", at("2026-10-21T15:00:05Z"));

      const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
      const sheet = await productionForDate({ db: tx, actor: kitchen, now: at("2026-10-22T03:00:00Z") }, "2026-10-22");
      expect(sheet.quickStartClients).toBe(1);
      expect(sheet.quickStartMeals).toBe(4);
      expect(sheet.rows.some((r) => r.quickStartCount > 0)).toBe(true);
      const packing = await packingForDate({ db: tx, actor: kitchen, now: at("2026-10-22T03:00:00Z") }, "2026-10-22");
      const mine = packing.find((x) => x.clientId === c.id)!;
      expect(mine.isQuickStart).toBe(true);
      expect(mine.delivery).toBe("pickup");
      expect(mine.name).toBe("Quick S.");
    });
  });
});
