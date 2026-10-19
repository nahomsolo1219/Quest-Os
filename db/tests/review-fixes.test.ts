// Regression tests for the milestone 3–5 spec review: lead claim guard, late-lock state as of the cutoff,
// price-lock-safe repricing, duplicate receipts, backdated purchases, ratings after a failed drop.
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../schema";
import { loadActor, type Actor } from "../../src/server/authz";
import { runJob } from "../../src/server/jobs";
import type { Ctx } from "../../src/server/services/context";
import { confirmPayment, submitPayment } from "../../src/server/services/billing";
import { signUp, STAFF_LEAD_EXISTS } from "../../src/server/services/signup";
import { addExtraProtein } from "../../src/server/services/client-app";
import { logPurchase } from "../../src/server/services/inventory";
import { markFailed } from "../../src/server/services/delivery";
import { rateMeal } from "../../src/server/services/ratings";
import { updateSettings } from "../../src/server/services/settings";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);

async function actorByEmail(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return (await loadActor(tx, u.id))!;
}
async function setAllPrices(tx: Tx) {
  await tx.update(s.ingredients).set({ costPerUnitBirr: sql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
}
async function clientActor(tx: Tx, clientId: string): Promise<Actor> {
  const [c] = await tx.select().from(s.clients).where(eq(s.clients.id, clientId));
  return (await loadActor(tx, c.userId!))!;
}

describe("sign-up and staff-entered leads", () => {
  it("cannot claim a lead that staff already started a plan or consultation for; allergies are merged when claiming", async () => {
    await inRollback(db, async (tx) => {
      const nutritionist = await actorByEmail(tx, "nutritionist@questmeals.demo");
      const [area] = await tx.select().from(s.areas).limit(1);
      const base = { lastName: "Bekele", password: "Secret123!", sex: "male" as const, age: 30, weightKg: 80, heightCm: 178, activity: "moderate" as const,
        goal: "lean" as const, dislikes: [], address: "Bole", areaId: area.id, landmark: "", deliveryOption: "pickup" as const, plan: null };
      const [busy] = await tx.insert(s.clients).values({ firstName: "Abebe", lastName: "Bekele", phone: "+251944000001", status: "lead", allergies: ["peanut"] }).returning();
      await tx.insert(s.consultations).values({ clientId: busy.id, heldAt: at("2026-10-19T07:00:00Z"), mode: "in_person", byUserId: nutritionist.userId });
      await expect(signUp({ db: tx, actor: null, now: at("2026-10-19T08:00:00Z") }, { ...base, firstName: "X", phone: "0944000001", allergies: [] }))
        .rejects.toThrow(STAFF_LEAD_EXISTS);
      const [fresh] = await tx.insert(s.clients).values({ firstName: "Almaz", lastName: "Bekele", phone: "+251944000002", status: "lead", allergies: ["peanut"] }).returning();
      await signUp({ db: tx, actor: null, now: at("2026-10-19T08:00:00Z") }, { ...base, firstName: "Almaz", phone: "0944000002", allergies: ["fish"] });
      const [after] = await tx.select().from(s.clients).where(eq(s.clients.id, fresh.id));
      expect(after.allergies.sort()).toEqual(["fish", "peanut"]);
    });
  });
});

describe("late Thursday lock", () => {
  it("uses the portion profile in force at the cutoff, not one set afterwards", async () => {
    await inRollback(db, async (tx) => {
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.periodStart, "2026-10-26"), eq(s.invoices.status, "paid"))).limit(1)
        .then(async (rows) => rows.length ? rows : tx.select().from(s.invoices).where(eq(s.invoices.kind, "monthly")).limit(1));
      const clientId = inv.clientId;
      const [np] = await tx.select().from(s.nutritionProfiles).where(and(eq(s.nutritionProfiles.clientId, clientId), eq(s.nutritionProfiles.isCurrent, true)));
      await tx.update(s.nutritionProfiles).set({ setAt: at("2026-10-01T07:00:00Z") }).where(eq(s.nutritionProfiles.id, np.id));
      const newSize = np.size === "L" ? "S" : "L";
      // changed at 19:00 Thursday, after the cutoff
      await tx.update(s.nutritionProfiles).set({ isCurrent: false }).where(eq(s.nutritionProfiles.id, np.id));
      await tx.insert(s.nutritionProfiles).values({ ...np, id: undefined, size: newSize, setAt: at("2026-10-22T16:00:00Z"), isCurrent: true });
      await runJob(tx as never, "thursday-lock", at("2026-10-23T06:00:00Z")); // run late on Friday
      const [o] = await tx.select().from(s.weeklyOrders).where(and(eq(s.weeklyOrders.clientId, clientId), eq(s.weeklyOrders.weekStart, "2026-10-26")));
      expect(o.profile.startsWith(np.size)).toBe(true);
    });
  });
});

describe("price lock and plan changes", () => {
  it("an add-on adds only its own cost difference; a later margin change does not reach the locked price", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const owner = await actorByEmail(tx, "fahim@questmeals.demo");
      const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.status, "active")).limit(1);
      const before = sub.planPriceBirr;
      const now = at("2026-10-20T07:00:00Z");
      const pricing = (await tx.select().from(s.settings).where(eq(s.settings.key, "pricing")))[0].value as Record<string, unknown>;
      await updateSettings({ db: tx, actor: owner, now }, "pricing", { ...pricing, marginFloor: 0.3 }, "test");
      await addExtraProtein({ db: tx, actor: await clientActor(tx, sub.clientId), now }, "lunch");
      const [after] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id));
      expect(after.planPriceBirr).toBeGreaterThan(before);
      // the add-on is one meal's extra protein per day: far less than re-quoting the whole plan at a 30% margin would add
      expect(after.planPriceBirr - before).toBeLessThan(8000);
      const [audit] = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.action, "price.plan_change"), eq(s.auditLog.entityId, sub.id)));
      expect(audit).toBeTruthy();
    });
  });
});

describe("payments", () => {
  it("a second receipt for the same invoice is refused, and an already-paid invoice cannot be confirmed again", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") };
      const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.status, "issued")).limit(1);
      const p1 = await submitPayment(ctx, { invoiceId: inv.id, method: "cash" });
      await expect(submitPayment(ctx, { invoiceId: inv.id, method: "cash" })).rejects.toThrow(/already waiting/);
      await confirmPayment(ctx, p1.id);
      // a stray second receipt inserted directly (e.g. before the index existed) cannot be confirmed onto a paid invoice
      const [p2] = await tx.insert(s.payments).values({ invoiceId: inv.id, clientId: inv.clientId, amountBirr: inv.amountBirr, method: "cash", status: "submitted" }).returning();
      await expect(confirmPayment(ctx, p2.id)).rejects.toThrow(/already paid/);
    });
  });
});

describe("purchases", () => {
  it("a backdated purchase does not overwrite a newer price", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-24T09:00:00Z") };
      const [chicken] = await tx.select().from(s.ingredients).where(eq(s.ingredients.slug, "chicken-breast"));
      await logPurchase(ctx, { ingredientId: chicken.id, qty: 10, totalPriceBirr: 6500, supplier: "Shola", purchasedOn: "2026-10-24" });
      const r = await logPurchase(ctx, { ingredientId: chicken.id, qty: 10, totalPriceBirr: 5500, supplier: "Shola", purchasedOn: "2026-10-20" });
      expect(r.priceUpdated).toBe(false);
      const [after] = await tx.select().from(s.ingredients).where(eq(s.ingredients.id, chicken.id));
      expect(after.costPerUnitBirr).toBe(650);
    });
  });
});

describe("ratings", () => {
  it("meals from a failed drop cannot be rated", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", at("2026-10-15T15:00:05Z")); // lock the week of 19 Oct
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const [drop] = await tx.select().from(s.deliveryDrops).where(and(eq(s.deliveryDrops.dropDate, "2026-10-20"), eq(s.deliveryDrops.kind, "delivery"))).limit(1);
      const now = at("2026-10-20T12:00:00Z");
      await markFailed({ db: tx, actor: ops, now }, drop.id, "Not home");
      const [meal] = await tx.select().from(s.orderMeals).innerJoin(s.orderDays, eq(s.orderDays.id, s.orderMeals.orderDayId))
        .where(and(eq(s.orderMeals.clientId, drop.clientId), eq(s.orderDays.serviceDate, "2026-10-20"))).limit(1);
      await expect(rateMeal({ db: tx, actor: await clientActor(tx, drop.clientId), now }, { mealId: meal.order_meals.mealId, serviceDate: "2026-10-20", rating: 5 }))
        .rejects.toThrow(/did not reach you/);
    });
  });
});
