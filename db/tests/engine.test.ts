// Engine services against a real database, each test inside a rolled-back transaction:
// Thursday lock (+ idempotency), invoices, quick start (paid on time vs late), pauses, discounts.
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../schema";
import { runJob } from "../../src/server/jobs";
import { SYSTEM_ACTOR, type Ctx } from "../../src/server/services/context";
import { confirmPayment, rejectPayment, submitPayment } from "../../src/server/services/billing";
import { applyDiscount, createSubscription, pausePlan } from "../../src/server/services/subscriptions";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);
// Addis = UTC+3. Thursday 22 Oct 2026 18:00 Addis = 15:00 UTC.
const THU_LOCK = at("2026-10-22T15:00:05Z");

async function count(tx: Tx, table: string, where = "true") {
  const r = await tx.execute(sql.raw(`select count(*)::int as n from ${table} where ${where}`));
  return (r as unknown as { n: number }[])[0].n;
}

async function setAllPrices(tx: Tx) {
  await tx.update(s.ingredients).set({ costPerUnitBirr: sql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
}

async function staffActor(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}

async function newClient(tx: Tx, phone: string) {
  const [c] = await tx.insert(s.clients).values({ firstName: "Test", lastName: "Client", phone, status: "lead", sex: "male", age: 30,
    weightG: 80000, heightCm: 180, activity: "moderate", goal: "lean", allergies: [], dislikes: [] }).returning();
  await tx.insert(s.nutritionProfiles).values({ clientId: c.id, bmr: 1780, tdee: 2759, suggestedKcal: 2207, suggestedSize: "M", suggestedProteinG: 158,
    suggestedCarbG: 210, suggestedFatG: 70, kcalTarget: 2100, size: "M", goal: "lean", proteinG: 158, carbG: 210, fatG: 70, provisional: true, isCurrent: true });
  return c;
}

describe("Thursday lock", () => {
  it("locks next week for paid clients, skips unpaid, and is idempotent", async () => {
    await inRollback(db, async (tx) => {
      const first = await runJob(tx as never, "thursday-lock", THU_LOCK);
      expect(first.runKey).toBe("2026-10-26");
      const r = first.result as { locked: number; skippedUnpaid: number; paused: number; invoicesCreated: number };
      expect(r.locked + r.skippedUnpaid + r.paused).toBeGreaterThan(0);
      const orders = await count(tx, "weekly_orders");
      const days = await count(tx, "order_days");
      const meals = await count(tx, "order_meals");
      const inv = await count(tx, "invoices");
      const notes = await count(tx, "notifications");
      const drops = await count(tx, "delivery_drops");
      expect(days).toBe(r.locked * 7); // Mon–Sat + Sunday folded into Saturday
      expect(meals).toBe(days * 4);
      // weekly billers with an unpaid invoice for the week are skipped and get no order days
      expect(await count(tx, "weekly_orders", "status = 'skipped_unpaid'")).toBe(r.skippedUnpaid);
      expect(await count(tx, "order_days d join weekly_orders o on o.id = d.weekly_order_id", "o.status <> 'locked'")).toBe(0);
      // Sunday's meals ride with Saturday's drop
      expect(await count(tx, "order_days", "service_date = '2026-11-01' and drop_date <> '2026-10-31'")).toBe(0);

      const second = await runJob(tx as never, "thursday-lock", THU_LOCK);
      expect((second.result as { invoicesCreated: number }).invoicesCreated).toBe(0);
      expect(await count(tx, "weekly_orders")).toBe(orders);
      expect(await count(tx, "order_days")).toBe(days);
      expect(await count(tx, "order_meals")).toBe(meals);
      expect(await count(tx, "invoices")).toBe(inv);
      expect(await count(tx, "notifications")).toBe(notes);
      expect(await count(tx, "delivery_drops")).toBe(drops);
      expect(await count(tx, "job_runs", "job = 'thursday-lock'")).toBe(1);
    });
  });

  it("weekly invoice paid before the cutoff gets the client cooked", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.periodStart, "2026-10-26"), eq(s.invoices.status, "issued"))).limit(1);
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-21T08:00:00Z") };
      const p = await submitPayment(ctx, { invoiceId: inv.id, method: "cash" });
      await confirmPayment(ctx, p.id);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const [o] = await tx.select().from(s.weeklyOrders).where(and(eq(s.weeklyOrders.clientId, inv.clientId), eq(s.weeklyOrders.weekStart, "2026-10-26")));
      expect(o.status).toBe("locked");
      expect(await count(tx, "audit_log", `action = 'payment.confirm' and entity_id = '${p.id}'`)).toBe(1);
    });
  });
});

describe("Quick start", () => {
  it("paid by 18:00 starts the next service day; paid after 18:00 starts a day later with a credit", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const wed10 = at("2026-10-21T07:00:00Z"); // Wednesday 10:00 Addis
      const a = await newClient(tx, "+251922000001");
      const b = await newClient(tx, "+251922000002");
      const ctx: Ctx = { db: tx, actor: ops, now: wed10 };
      const qa = await createSubscription(ctx, { clientId: a.id, packageId: (await tx.select().from(s.packages).where(eq(s.packages.code, "essential")))[0].id,
        deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" });
      const qb = await createSubscription(ctx, { clientId: b.id, packageId: qa.subscription.packageId, deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" });
      expect(qa.subscription.startDate).toBe("2026-10-22");
      expect(qa.invoice.periodEnd).toBe("2026-10-25");
      expect(qa.invoice.serviceDays).toBe(3); // Thu, Fri, Sat
      expect(qa.invoice.amountBirr % 10).toBe(0);

      // A pays and is confirmed at 17:30; B uploads at 17:50 but is confirmed at 18:30
      const pa = await submitPayment({ ...ctx, now: at("2026-10-21T14:30:00Z") }, { invoiceId: qa.invoice.id, method: "cash" });
      await confirmPayment({ ...ctx, now: at("2026-10-21T14:30:00Z") }, pa.id);
      const pb = await submitPayment({ ...ctx, now: at("2026-10-21T14:50:00Z") }, { invoiceId: qb.invoice.id, method: "cash" });

      const wedLock = await runJob(tx as never, "daily-quick-start", at("2026-10-21T15:00:05Z"));
      expect((wedLock.result as { added: number }).added).toBe(1);
      expect(await count(tx, "order_days", `client_id = '${a.id}'`)).toBe(4); // Thu, Fri, Sat + Sun folded into Sat
      expect(await count(tx, "order_days", `client_id = '${a.id}' and is_quick_start`)).toBe(4);
      expect(await count(tx, "order_days", `client_id = '${b.id}'`)).toBe(0);
      // running the lock again adds nothing
      await runJob(tx as never, "daily-quick-start", at("2026-10-21T15:00:30Z"));
      expect(await count(tx, "order_days", `client_id = '${a.id}'`)).toBe(4);

      await confirmPayment({ ...ctx, now: at("2026-10-21T15:30:00Z") }, pb.id);
      const thu = await runJob(tx as never, "daily-quick-start", at("2026-10-22T15:00:05Z"));
      expect((thu.result as { added: number; shifted: number }).shifted).toBe(1);
      const [subB] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, qb.subscription.id));
      expect(subB.startDate).toBe("2026-10-23");
      expect(subB.quickStartPeriodEnd).toBe("2026-11-01"); // next week was locked at the same 18:00
      expect(await count(tx, "order_days", `client_id = '${b.id}'`)).toBe(10); // Fri, Sat, Sun + next Mon–Sun
      expect(await count(tx, "account_credits", `client_id = '${b.id}'`)).toBe(1);
      // the Thursday weekly lock at the same instant does not duplicate B's days
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      expect(await count(tx, "order_days", `client_id = '${b.id}'`)).toBe(10);
    });
  });

  it("Thursday: weekly lock running before the quick-start lock still gives the quick start its days", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const c = await newClient(tx, "+251922000009");
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-22T10:00:00Z") }; // Thursday 13:00 Addis
      const [pkg] = await tx.select().from(s.packages).where(eq(s.packages.code, "essential"));
      const q = await createSubscription(ctx, { clientId: c.id, packageId: pkg.id, deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" });
      expect(q.subscription.startDate).toBe("2026-10-23");
      expect(q.invoice.periodEnd).toBe("2026-11-01");
      const p = await submitPayment(ctx, { invoiceId: q.invoice.id, method: "cash" });
      await confirmPayment(ctx, p.id);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      await runJob(tx as never, "daily-quick-start", THU_LOCK);
      expect(await count(tx, "order_days", `client_id = '${c.id}'`)).toBe(10); // Fri, Sat, Sun + next week
      expect(await count(tx, "invoices", `client_id = '${c.id}' and period_start = '2026-10-26'`)).toBe(0); // covered by the quick-start invoice
    });
  });

  it("missing prices block a quote", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const c = await newClient(tx, "+251922000003");
      const [pkg] = await tx.select().from(s.packages).where(eq(s.packages.code, "essential"));
      await expect(createSubscription({ db: tx, actor: ops, now: at("2026-10-21T07:00:00Z") },
        { clientId: c.id, packageId: pkg.id, deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" }))
        .rejects.toThrow(/price missing/);
    });
  });
});

describe("Plans", () => {
  it("pause in whole weeks after the cutoff week extends the end date; locked weeks refuse", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.status, "active")).limit(1);
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") }; // Tuesday
      await expect(pausePlan(ctx, { clientId: sub.clientId, startWeek: "2026-10-19", weeks: 1 })).rejects.toThrow(/locked/);
      const res = await pausePlan(ctx, { clientId: sub.clientId, startWeek: "2026-10-26", weeks: 2 });
      const [after] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id));
      expect(after.endDate).toBe(res.endDate);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const [o] = await tx.select().from(s.weeklyOrders).where(and(eq(s.weeklyOrders.clientId, sub.clientId), eq(s.weeklyOrders.weekStart, "2026-10-26")));
      expect(o.status).toBe("paused");
    });
  });

  it("only owners apply discounts, with an audit row", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const owner = await staffActor(tx, "fahim@questmeals.demo");
      const [sub] = await tx.select().from(s.subscriptions).limit(1);
      await expect(applyDiscount({ db: tx, actor: ops, now: new Date() }, { subscriptionId: sub.id, discountMonthBirr: 1000, reason: "friend" }))
        .rejects.toBeInstanceOf(ForbiddenError);
      await applyDiscount({ db: tx, actor: owner, now: new Date() }, { subscriptionId: sub.id, discountMonthBirr: 1000, reason: "Launch offer" });
      expect(await count(tx, "audit_log", `action = 'discount.apply' and entity_id = '${sub.id}'`)).toBe(1);
      expect(SYSTEM_ACTOR.roles).not.toContain("client");
    });
  });
});

describe("Spec review fixes", () => {
  it("a Wednesday quick start is billed for its first regular week before Thursday's cutoff (D035)", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const c = await newClient(tx, "+251922000011");
      const [pkg] = await tx.select().from(s.packages).where(eq(s.packages.code, "essential"));
      const q = await createSubscription({ db: tx, actor: ops, now: at("2026-10-21T07:00:00Z") },
        { clientId: c.id, packageId: pkg.id, deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" });
      const inv = await tx.select().from(s.invoices).where(eq(s.invoices.subscriptionId, q.subscription.id));
      const next = inv.find((i) => i.periodStart === "2026-10-26");
      expect(next?.kind).toBe("weekly");
      expect(next?.dueAt.toISOString()).toBe("2026-10-22T15:00:00.000Z");
    });
  });

  it("a receipt confirmed after the cutoff does not get the client cooked, even if the lock is re-run (D033)", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.periodStart, "2026-10-26"), eq(s.invoices.status, "issued"))).limit(1);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const late: Ctx = { db: tx, actor: ops, now: at("2026-10-23T05:00:00Z") }; // Friday 08:00
      const p = await submitPayment(late, { invoiceId: inv.id, method: "cash" });
      await confirmPayment(late, p.id);
      await runJob(tx as never, "thursday-lock", at("2026-10-23T06:00:00Z"));
      const [o] = await tx.select().from(s.weeklyOrders).where(and(eq(s.weeklyOrders.clientId, inv.clientId), eq(s.weeklyOrders.weekStart, "2026-10-26")));
      expect(o.status).toBe("skipped_unpaid");
      expect(await count(tx, "order_days", `client_id = '${inv.clientId}' and service_date >= '2026-10-26'`)).toBe(0);
    });
  });

  it("pausing a paid week voids it into credit and later locks never bill paused weeks (D034)", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.periodStart, "2026-10-26"), eq(s.invoices.status, "issued"), eq(s.invoices.kind, "weekly"))).limit(1);
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") };
      const p = await submitPayment(ctx, { invoiceId: inv.id, method: "cash" });
      await confirmPayment(ctx, p.id);
      await pausePlan(ctx, { clientId: inv.clientId, startWeek: "2026-10-26", weeks: 1 });
      const [after] = await tx.select().from(s.invoices).where(eq(s.invoices.id, inv.id));
      expect(after.status).toBe("void");
      expect(await count(tx, "account_credits", `client_id = '${inv.clientId}' and amount_birr = ${inv.amountBirr}`)).toBe(1);
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      // the next invoice uses the credit
      const [nextInv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, inv.subscriptionId), eq(s.invoices.periodStart, "2026-11-02")));
      expect(nextInv.creditAppliedBirr).toBeGreaterThan(0);
      expect(await count(tx, "invoices", `subscription_id = '${inv.subscriptionId}' and period_start = '2026-10-26' and status <> 'void'`)).toBe(0);
    });
  });

  it("a receipt cannot be confirmed after it was rejected", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.status, "issued")).limit(1);
      const ctx: Ctx = { db: tx, actor: ops, now: at("2026-10-20T07:00:00Z") };
      const p = await submitPayment(ctx, { invoiceId: inv.id, method: "cash" });
      await rejectPayment(ctx, p.id, "Amount does not match");
      await expect(confirmPayment(ctx, p.id)).rejects.toThrow(/already handled/);
      await expect(rejectPayment(ctx, p.id, "again")).rejects.toThrow(/already handled/);
    });
  });
});
