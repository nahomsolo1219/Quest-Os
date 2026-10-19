// Regression tests for the final spec review: repricing counts each change once and refunds withdrawn ones,
// skipped weeks are not charged, receipts for cancelled or reduced invoices become credit, custom swaps reach the
// kitchen, the Telegram opt-out is respected, quick starts honour pauses, renewal after the lock re-prices.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../schema";
import { loadActor, type Actor } from "../../src/server/authz";
import { runJob } from "../../src/server/jobs";
import type { Ctx } from "../../src/server/services/context";
import { confirmPayment, submitPayment } from "../../src/server/services/billing";
import { addExtraProtein, endSwap, removeExtraProtein, requestSwap } from "../../src/server/services/client-app";
import { decideSwap } from "../../src/server/services/nutrition";
import { notify } from "../../src/server/services/notifications";
import { createSubscription, pausePlan, renewPlan } from "../../src/server/services/subscriptions";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
afterEach(() => { vi.unstubAllGlobals(); delete process.env.TELEGRAM_BOT_TOKEN; });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);
const THU_LOCK = at("2026-10-22T15:00:05Z");

async function actorByEmail(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return (await loadActor(tx, u.id))!;
}
async function clientActor(tx: Tx, clientId: string): Promise<Actor> {
  const [c] = await tx.select().from(s.clients).where(eq(s.clients.id, clientId));
  return (await loadActor(tx, c.userId!))!;
}
async function setAllPrices(tx: Tx) {
  await tx.update(s.ingredients).set({ costPerUnitBirr: sql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
}
async function credits(tx: Tx, clientId: string) {
  const r = await tx.select({ n: sql<number>`coalesce(sum(${s.accountCredits.amountBirr}), 0)::int` }).from(s.accountCredits)
    .where(and(eq(s.accountCredits.clientId, clientId), sql`${s.accountCredits.appliedInvoiceId} is null`));
  return r[0].n;
}
async function activeWeekly(tx: Tx) {
  const [sub] = await tx.select().from(s.subscriptions).where(and(eq(s.subscriptions.status, "active"), eq(s.subscriptions.billingPeriod, "weekly"))).limit(1);
  return sub;
}

describe("repricing after plan changes", () => {
  it("two changes in one week are each counted once, and withdrawing one takes its cost back", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      await tx.update(s.ingredients).set({ costPerUnitBirr: 900 }).where(sql`${s.ingredients.slug} in ('lean-beef-diced', 'lean-minced-beef')`);
      const sub = await activeWeekly(tx);
      const me = await clientActor(tx, sub.clientId);
      const now = at("2026-10-20T07:00:00Z");
      const base = sub.planPriceBirr;
      const beefRule = (await tx.select().from(s.swapRules).where(eq(s.swapRules.code, "CHICKEN_TO_BEEF")))[0];
      await requestSwap({ db: tx, actor: me, now }, { swapRuleId: beefRule.id });
      const p1 = (await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)))[0].planPriceBirr;
      const addon = await addExtraProtein({ db: tx, actor: me, now }, "lunch");
      const p2 = (await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)))[0].planPriceBirr;
      expect(p1).toBeGreaterThan(base);
      expect(p2).toBeGreaterThan(p1);
      // withdrawing each change takes exactly its cost back: no double counting, nothing kept
      await removeExtraProtein({ db: tx, actor: me, now }, addon.id);
      const p3 = (await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)))[0].planPriceBirr;
      expect(p3).toBe(p1);
      const [swap] = await tx.select().from(s.clientSwaps).where(and(eq(s.clientSwaps.clientId, sub.clientId), eq(s.clientSwaps.swapRuleId, beefRule.id)));
      await endSwap({ db: tx, actor: me, now }, swap.id);
      const p4 = (await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)))[0].planPriceBirr;
      expect(p4).toBe(base);
    });
  });
});

describe("weeks not cooked are not charged", () => {
  it("a week skipped for non-payment voids its invoice; paying it late becomes credit", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.periodStart, "2026-10-26"), eq(s.invoices.status, "issued"), eq(s.invoices.kind, "weekly"))).limit(1);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const [after] = await tx.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
      expect(after.status).toBe("void");
      const late: Ctx = { db: tx, actor: ops, now: at("2026-10-23T06:00:00Z") };
      // a receipt sent just before the cutoff but confirmed later is kept as credit
      const [p] = await tx.insert(s.payments).values({ invoiceId: inv.id, clientId: inv.clientId, amountBirr: inv.amountBirr, method: "cash", status: "submitted" }).returning();
      const r = await confirmPayment(late, p.id);
      expect(r.creditBirr).toBe(inv.amountBirr);
      expect(await credits(tx, inv.clientId)).toBe(inv.amountBirr);
    });
  });

  it("pausing after a receipt was sent keeps the money as credit (receipt confirmed on the voided invoice)", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.periodStart, "2026-10-26"), eq(s.invoices.status, "issued"), eq(s.invoices.kind, "weekly"))).limit(1);
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") };
      const p = await submitPayment(ctx, { invoiceId: inv.id, method: "cash" });
      await pausePlan(ctx, { clientId: inv.clientId, startWeek: "2026-10-26", weeks: 1 });
      await confirmPayment(ctx, p.id);
      expect(await credits(tx, inv.clientId)).toBe(inv.amountBirr);
    });
  });

  it("a pause taking off more than a credit-reduced invoice asks marks it paid and keeps the surplus as credit", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const sub = await activeWeekly(tx);
      // a monthly-style partial: make the 26 Oct invoice cover two weeks but be reduced by a credit to 1,000 ETB
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.periodStart, "2026-10-26"))).limit(1);
      await tx.update(s.invoices).set({ periodEnd: "2026-11-08", serviceDays: 12, amountBirr: 1000, creditAppliedBirr: 26000 - 1000 }).where(eq(s.invoices.id, inv.id));
      await tx.update(s.subscriptions).set({ endDate: "2026-11-30" }).where(eq(s.subscriptions.id, sub.id));
      await pausePlan({ db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") }, { clientId: sub.clientId, startWeek: "2026-10-26", weeks: 1 });
      const [after] = await tx.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
      expect(after.status).toBe("paid");
      expect(after.amountBirr).toBe(0);
      expect(await credits(tx, sub.clientId)).toBeGreaterThan(0);
    });
  });
});

describe("custom swaps reach the kitchen", () => {
  it("an approved custom request is on every locked meal as a kitchen note, not counted as an allergy", async () => {
    await inRollback(db, async (tx) => {
      const nutritionist = await actorByEmail(tx, "nutritionist@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.kind, "monthly"), eq(s.invoices.status, "paid"))).limit(1);
      const me = await clientActor(tx, inv.clientId);
      const req = await requestSwap({ db: tx, actor: me, now: at("2026-10-19T07:00:00Z") }, { customRequest: "No garlic, please" });
      await decideSwap({ db: tx, actor: nutritionist, now: at("2026-10-19T08:00:00Z") }, { id: req.id, approve: true, note: "OK" });
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const meals = await tx.select().from(s.orderMeals).innerJoin(s.orderDays, eq(s.orderDays.id, s.orderMeals.orderDayId))
        .where(and(eq(s.orderMeals.clientId, inv.clientId), sql`${s.orderDays.serviceDate} >= '2026-10-26'`));
      expect(meals.length).toBeGreaterThan(0);
      expect(meals.every((m) => m.order_meals.conflicts.some((c) => c.startsWith("Kitchen note: No garlic")))).toBe(true);
    });
  });
});

describe("Telegram opt-out", () => {
  it("a linked client with the switch off gets in-app only; linking switches it on", async () => {
    await inRollback(db, async (tx) => {
      process.env.TELEGRAM_BOT_TOKEN = "123:abc";
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const [c] = await tx.select().from(s.clients).where(sql`${s.clients.userId} is not null`).limit(1);
      await tx.insert(s.telegramLinks).values({ userId: c.userId!, chatId: "555", linkedAt: new Date() });
      await tx.update(s.clients).set({ telegramOptIn: false }).where(eq(s.clients.id, c.id));
      await notify(tx, { userIds: [c.userId!], kind: "t", title: "x", dedupeKey: "optout-1" });
      expect(fetchMock).not.toHaveBeenCalled();
      await tx.update(s.clients).set({ telegramOptIn: true }).where(eq(s.clients.id, c.id));
      await notify(tx, { userIds: [c.userId!], kind: "t", title: "x", dedupeKey: "optout-2" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe("quick start and pauses", () => {
  it("the quick-start lock does not cook a week the client paused, even when it runs before the weekly lock", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const [c] = await tx.insert(s.clients).values({ firstName: "Q", lastName: "S", phone: "+251955000001", status: "lead", sex: "male", age: 30, weightG: 80000,
        heightCm: 180, activity: "moderate", goal: "lean" }).returning();
      await tx.insert(s.nutritionProfiles).values({ clientId: c.id, bmr: 1780, tdee: 2759, suggestedKcal: 2207, suggestedSize: "M", suggestedProteinG: 158,
        suggestedCarbG: 210, suggestedFatG: 70, kcalTarget: 2100, size: "M", goal: "lean", proteinG: 158, carbG: 210, fatG: 70, provisional: true, isCurrent: true });
      const [pkg] = await tx.select().from(s.packages).where(eq(s.packages.code, "essential"));
      const thu10 = at("2026-10-22T07:00:00Z");
      const q = await createSubscription({ db: tx, actor: ops, now: thu10 }, { clientId: c.id, packageId: pkg.id, deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" });
      const p = await submitPayment({ db: tx, actor: ops, now: thu10 }, { invoiceId: q.invoice.id, method: "cash" });
      await confirmPayment({ db: tx, actor: ops, now: thu10 }, p.id);
      await pausePlan({ db: tx, actor: ops, now: at("2026-10-22T14:00:00Z") }, { clientId: c.id, startWeek: "2026-10-26", weeks: 1 });
      await runJob(tx as never, "daily-quick-start", THU_LOCK);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const days = await tx.select().from(s.orderDays).where(eq(s.orderDays.clientId, c.id));
      expect(days.map((d) => d.serviceDate).sort()).toEqual(["2026-10-23", "2026-10-24", "2026-10-25"]);
    });
  });
});

describe("renewal after the price lock", () => {
  it("renewing once the 4-month lock is over prices the new term from the current formula and locks it again", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const sub = await activeWeekly(tx);
      await tx.update(s.subscriptions).set({ priceLockedUntil: "2026-10-01", endDate: "2026-10-31" }).where(eq(s.subscriptions.id, sub.id));
      const r = await renewPlan({ db: tx, actor: ops, now: at("2026-10-25T07:00:00Z") }, sub.clientId);
      const [after] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id));
      expect(r.planPriceBirr).toBe(after.planPriceBirr);
      expect(after.planPriceBirr).not.toBe(sub.planPriceBirr);
      expect(after.priceLockedUntil).toBe("2027-02-25"); // locked again for 4 months from the day it is re-priced
      const [audit] = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.action, "price.renewal"), eq(s.auditLog.entityId, sub.id)));
      expect(audit).toBeTruthy();
    });
  });
});

describe("final review, second pass", () => {
  it("a week only partly paid at a billing boundary: the uncooked days come off the unpaid invoice", async () => {
    await inRollback(db, async (tx) => {
      const sub = await activeWeekly(tx);
      await tx.delete(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), sql`${s.invoices.periodStart} >= '2026-10-26'`));
      const [paidInv] = await tx.insert(s.invoices).values({ clientId: sub.clientId, subscriptionId: sub.id, kind: "monthly", periodStart: "2026-10-26", periodEnd: "2026-10-28",
        serviceDays: 3, amountBirr: 6000, status: "paid", dueAt: at("2026-10-22T15:00:00Z") }).returning();
      await tx.insert(s.payments).values({ invoiceId: paidInv.id, clientId: sub.clientId, amountBirr: 6000, method: "cash", status: "confirmed", confirmedAt: at("2026-10-21T08:00:00Z") });
      const [unpaid] = await tx.insert(s.invoices).values({ clientId: sub.clientId, subscriptionId: sub.id, kind: "monthly", periodStart: "2026-10-29", periodEnd: "2026-11-28",
        serviceDays: 26, amountBirr: 52000, status: "issued", dueAt: at("2026-10-22T15:00:00Z") }).returning();
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const [o] = await tx.select().from(s.weeklyOrders).where(and(eq(s.weeklyOrders.clientId, sub.clientId), eq(s.weeklyOrders.weekStart, "2026-10-26")));
      expect(o.status).toBe("locked");
      const cooked = await tx.select().from(s.orderDays).where(eq(s.orderDays.weeklyOrderId, o.id));
      expect(cooked.map((d) => d.serviceDate).sort()).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
      const [after] = await tx.select().from(s.invoices).where(eq(s.invoices.id, unpaid.id));
      expect(after.serviceDays).toBe(23); // Thu, Fri, Sat not cooked
      expect(after.amountBirr).toBe(52000 - 6000); // 3 of 26 days at the invoice's own rate (D064)
      await runJob(tx as never, "thursday-lock", THU_LOCK); // re-run: no second reduction
      expect((await tx.select().from(s.invoices).where(eq(s.invoices.id, unpaid.id)))[0].amountBirr).toBe(after.amountBirr);
    });
  });

  it("a receipt waiting for an invoice that a pause brought to 0 becomes credit when confirmed", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const sub = await activeWeekly(tx);
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.periodStart, "2026-10-26"))).limit(1);
      // 26,000 for 12 days, of which 25,000 paid by credit: the client still owes 1,000 and sends a receipt
      await tx.update(s.invoices).set({ periodEnd: "2026-11-08", serviceDays: 12, amountBirr: 1000, creditAppliedBirr: 25000, status: "issued" }).where(eq(s.invoices.id, inv.id));
      await tx.update(s.subscriptions).set({ endDate: "2026-11-30" }).where(eq(s.subscriptions.id, sub.id));
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") };
      const p = await submitPayment(ctx, { invoiceId: inv.id, method: "cash" });
      await pausePlan(ctx, { clientId: sub.clientId, startWeek: "2026-10-26", weeks: 1 });
      const creditBefore = await credits(tx, sub.clientId);
      const r = await confirmPayment(ctx, p.id);
      expect(r.creditBirr).toBe(1000);
      expect(await credits(tx, sub.clientId)).toBe(creditBefore + 1000);
    });
  });

  it("renewing inside the price lock keeps the price; the daily job re-prices once the lock ends", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const sub = await activeWeekly(tx);
      await tx.update(s.subscriptions).set({ priceLockedUntil: "2026-11-01" }).where(eq(s.subscriptions.id, sub.id));
      await renewPlan({ db: tx, actor: ops, now: at("2026-10-25T07:00:00Z") }, sub.clientId);
      expect((await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)))[0].planPriceBirr).toBe(sub.planPriceBirr);
      await runJob(tx as never, "daily-renewals", at("2026-10-31T06:00:00Z")); // still locked
      expect((await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)))[0].planPriceBirr).toBe(sub.planPriceBirr);
      const r = await runJob(tx as never, "daily-renewals", at("2026-11-01T06:00:00Z"));
      expect((r.result as { repriced: number }).repriced).toBe(1);
      const [after] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id));
      expect(after.planPriceBirr).not.toBe(sub.planPriceBirr);
      expect(after.priceLockedUntil).toBe("2027-03-01");
    });
  });

  it("a coach who is also a subscriber keeps staff Telegram alerts with the client switch off", async () => {
    await inRollback(db, async (tx) => {
      process.env.TELEGRAM_BOT_TOKEN = "123:abc";
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const dagi = await actorByEmail(tx, "dagi@questmeals.demo");
      await tx.insert(s.clients).values({ userId: dagi.userId, firstName: "Dagi", lastName: "Bekele", phone: "+251966000001", status: "active", telegramOptIn: false });
      await tx.insert(s.telegramLinks).values({ userId: dagi.userId, chatId: "777", linkedAt: new Date() });
      await notify(tx, { userIds: [dagi.userId], kind: "community.report", title: "Report", link: "/staff/community", dedupeKey: "coach-1" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await notify(tx, { userIds: [dagi.userId], kind: "reminder.weekly", title: "Reminder", link: "/app/plan", dedupeKey: "coach-2" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe("final review, third pass", () => {
  it("renewing a weekly plan before the lock bills the renewed week before its cutoff, so it is cooked once paid", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const sub = await activeWeekly(tx);
      await tx.update(s.subscriptions).set({ endDate: "2026-11-01" }).where(eq(s.subscriptions.id, sub.id));
      await tx.delete(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), sql`${s.invoices.periodStart} >= '2026-11-02'`));
      await renewPlan({ db: tx, actor: ops, now: at("2026-10-27T06:00:00Z") }, sub.clientId);
      const [next] = await tx.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.periodStart, "2026-11-02")));
      expect(next?.dueAt.toISOString()).toBe("2026-10-29T15:00:00.000Z");
    });
  });

  it("a renewal after the week was already locked as unpaid never bills those days", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const sub = await activeWeekly(tx);
      await tx.update(s.subscriptions).set({ endDate: "2026-11-01" }).where(eq(s.subscriptions.id, sub.id));
      await tx.delete(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), sql`${s.invoices.periodStart} >= '2026-11-02'`));
      // the Thursday 29 Oct lock: the plan ended on 1 Nov, so nothing for the week of 2 Nov yet
      await runJob(tx as never, "thursday-lock", at("2026-10-29T15:00:05Z"));
      // renewed on Friday, after that cutoff
      await renewPlan({ db: tx, actor: ops, now: at("2026-10-30T06:00:00Z") }, sub.clientId);
      const inv = await tx.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), sql`${s.invoices.periodStart} >= '2026-11-02'`, sql`${s.invoices.status} <> 'void'`));
      // the week of 2 Nov was locked without this plan, so it is never billed; billing resumes with the next lockable week
      expect(inv.find((i) => i.periodStart === "2026-11-02")).toBeUndefined();
      expect(inv.map((i) => i.periodStart)).toContain("2026-11-09");
    });
  });

  it("days come off at the invoice's own rate after the plan price changed", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const sub = await activeWeekly(tx);
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.periodStart, "2026-10-26"))).limit(1);
      await tx.update(s.invoices).set({ periodEnd: "2026-11-08", serviceDays: 12, amountBirr: 24000, creditAppliedBirr: 0, status: "issued" }).where(eq(s.invoices.id, inv.id));
      await tx.update(s.subscriptions).set({ endDate: "2026-11-30", planPriceBirr: 99000 }).where(eq(s.subscriptions.id, sub.id)); // re-priced meanwhile
      await pausePlan({ db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") }, { clientId: sub.clientId, startWeek: "2026-10-26", weeks: 1 });
      const [after] = await tx.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
      expect(after.amountBirr).toBe(12000); // 6 of 12 days at 2,000 a day, not at the new plan price
      expect(after.serviceDays).toBe(6);
    });
  });

  it("operations get their own renewal alert with a staff link", async () => {
    await inRollback(db, async (tx) => {
      const sub = await activeWeekly(tx);
      await tx.update(s.subscriptions).set({ endDate: "2026-10-25" }).where(eq(s.subscriptions.id, sub.id));
      await runJob(tx as never, "daily-renewals", at("2026-10-20T06:00:00Z"));
      const ops = await tx.select().from(s.notifications).where(eq(s.notifications.kind, "ops.renewal_due"));
      expect(ops.length).toBeGreaterThan(0);
      expect(ops.every((n) => n.link === `/staff/clients/${sub.clientId}`)).toBe(true);
      const client = await tx.select().from(s.notifications).where(eq(s.notifications.kind, "reminder.renewal"));
      expect(client.every((n) => n.link === "/app/plan")).toBe(true);
    });
  });
});

describe("final review, fourth pass", () => {
  it("repeated reductions of a credit-paid invoice never credit more than was put in", async () => {
    await inRollback(db, async (tx) => {
      const { takeDaysOffInvoice } = await import("../../src/server/services/billing");
      const sub = await activeWeekly(tx);
      const [inv] = await tx.insert(s.invoices).values({ clientId: sub.clientId, subscriptionId: sub.id, kind: "monthly", periodStart: "2027-01-04", periodEnd: "2027-02-03",
        serviceDays: 24, amountBirr: 2000, creditAppliedBirr: 10000, status: "issued", dueAt: at("2026-12-31T15:00:00Z") }).returning();
      const fresh = async () => (await tx.select().from(s.invoices).where(eq(s.invoices.id, inv.id)))[0];
      const before = await credits(tx, sub.clientId);
      await takeDaysOffInvoice(tx, await fresh(), 6, "week paused"); // 3,000 off: 2,000 from the amount, 1,000 of credit back
      let now = await fresh();
      expect([now.amountBirr, now.creditAppliedBirr, now.serviceDays, now.status]).toEqual([0, 9000, 18, "paid"]);
      expect(await credits(tx, sub.clientId)).toBe(before + 1000);
      await takeDaysOffInvoice(tx, now, 6, "week paused"); // another 3,000 (500 a day), all of it credit
      now = await fresh();
      expect([now.amountBirr, now.creditAppliedBirr, now.serviceDays]).toEqual([0, 6000, 12]);
      expect(await credits(tx, sub.clientId)).toBe(before + 4000);
      await takeDaysOffInvoice(tx, now, 12, "rest paused"); // void: the remaining 6,000 of credit comes back
      expect((await fresh()).status).toBe("void");
      expect(await credits(tx, sub.clientId)).toBe(before + 10000); // exactly the 10,000 put in
    });
  });
});

describe("final review, fifth pass", () => {
  it("a negative credit applied (the client owes money) survives reductions and is returned by a void", async () => {
    await inRollback(db, async (tx) => {
      const { takeDaysOffInvoice } = await import("../../src/server/services/billing");
      const sub = await activeWeekly(tx);
      // 24 days worth 6,000 plus 500 the client owes
      const [inv] = await tx.insert(s.invoices).values({ clientId: sub.clientId, subscriptionId: sub.id, kind: "monthly", periodStart: "2027-01-04", periodEnd: "2027-02-03",
        serviceDays: 24, amountBirr: 6500, creditAppliedBirr: -500, status: "issued", dueAt: at("2026-12-31T15:00:00Z") }).returning();
      const fresh = async () => (await tx.select().from(s.invoices).where(eq(s.invoices.id, inv.id)))[0];
      const before = await credits(tx, sub.clientId);
      await takeDaysOffInvoice(tx, await fresh(), 6, "week paused"); // 1,500 off the 6,000 of food
      const now = await fresh();
      expect([now.amountBirr, now.creditAppliedBirr, now.serviceDays]).toEqual([5000, -500, 18]);
      await takeDaysOffInvoice(tx, now, 18, "rest paused");
      expect((await fresh()).status).toBe("void");
      expect(await credits(tx, sub.clientId)).toBe(before - 500); // the 500 owed is still owed
    });
  });

  it("two pause requests at once: only one is applied", async () => {
    const { db: db2, sql: conn2 } = testDb();
    const ops = await actorByEmail(db as never, "nebiyou@questmeals.demo");
    const [sub] = await db.select().from(s.subscriptions).where(and(eq(s.subscriptions.status, "active"), eq(s.subscriptions.billingPeriod, "monthly"))).limit(1);
    const invBefore = await db.select().from(s.invoices).where(eq(s.invoices.subscriptionId, sub.id));
    const creditIds = new Set((await db.select({ id: s.accountCredits.id }).from(s.accountCredits).where(eq(s.accountCredits.clientId, sub.clientId))).map((r) => r.id));
    const auditCut = new Date();
    const ctx1: Ctx = { db, actor: ops, now: at("2026-10-20T07:00:00Z") };
    const ctx2: Ctx = { db: db2, actor: ops, now: at("2026-10-20T07:00:00Z") };
    const results = await Promise.allSettled([
      pausePlan(ctx1, { clientId: sub.clientId, startWeek: "2026-11-02", weeks: 1 }),
      pausePlan(ctx2, { clientId: sub.clientId, startWeek: "2026-11-02", weeks: 1 }),
    ]);
    try {
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rows = await db.select().from(s.pauses).where(and(eq(s.pauses.subscriptionId, sub.id), eq(s.pauses.startWeek, "2026-11-02")));
      expect(rows).toHaveLength(1);
    } finally {
      // undo (this test runs outside a rollback because it needs two connections)
      const [p] = await db.select().from(s.pauses).where(and(eq(s.pauses.subscriptionId, sub.id), eq(s.pauses.startWeek, "2026-11-02")));
      if (p) {
        await db.delete(s.pauses).where(eq(s.pauses.id, p.id));
        await db.update(s.subscriptions).set({ endDate: sub.endDate }).where(eq(s.subscriptions.id, sub.id));
      }
      for (const i of invBefore) {
        await db.update(s.invoices).set({ amountBirr: i.amountBirr, creditAppliedBirr: i.creditAppliedBirr, serviceDays: i.serviceDays, status: i.status }).where(eq(s.invoices.id, i.id));
      }
      for (const c of await db.select().from(s.accountCredits).where(eq(s.accountCredits.clientId, sub.clientId))) {
        if (!creditIds.has(c.id)) await db.delete(s.accountCredits).where(eq(s.accountCredits.id, c.id));
      }
      await db.delete(s.auditLog).where(and(eq(s.auditLog.action, "subscription.pause"), eq(s.auditLog.entityId, sub.id), sql`${s.auditLog.createdAt} >= ${auditCut.toISOString()}`));
      await conn2.end({ timeout: 5 });
    }
  });
});

describe("final review, sixth pass", () => {
  it("a pause for a week the Thursday lock has just locked is refused, even if the request started before 18:00", async () => {
    await inRollback(db, async (tx) => {
      const ops = await actorByEmail(tx, "nebiyou@questmeals.demo");
      const [sub] = await tx.select().from(s.subscriptions).where(and(eq(s.subscriptions.status, "active"), eq(s.subscriptions.billingPeriod, "monthly"))).limit(1);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      // the request's clock says 17:59:59 — the lock committed first
      await expect(pausePlan({ db: tx, actor: ops, now: at("2026-10-22T14:59:59Z") }, { clientId: sub.clientId, startWeek: "2026-10-26", weeks: 1 }))
        .rejects.toThrow(/already locked/);
    });
  });
});
