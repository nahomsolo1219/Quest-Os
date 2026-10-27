// Operations services (clients, onboarding, payments, quick starts) against a real database.
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as s from "../schema";
import { createAuth } from "../../src/server/auth";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import { runJob } from "../../src/server/jobs";
import type { Ctx } from "../../src/server/services/context";
import { confirmPayment, paymentQueue, submitPayment } from "../../src/server/services/billing";
import {
  clientConflicts, createClientAccount, createLead, ensureProvisionalProfile, getClientDetail, listClients, paymentStateOf,
  resetClientPassword, updateClient,
} from "../../src/server/services/clients";
import { lockWeekNow, previewWeek, quickStartQueue, recordCashPayment, todaySummary, todayTasks, weekReview } from "../../src/server/services/ops";
import { createSubscription } from "../../src/server/services/subscriptions";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
const cleanupClients: string[] = [];
const cleanupUsers: string[] = [];
afterAll(async () => {
  if (cleanupClients.length) await db.delete(s.clients).where(inArray(s.clients.id, cleanupClients));
  if (cleanupUsers.length) await db.delete(s.user).where(inArray(s.user.id, cleanupUsers));
  await conn.end({ timeout: 5 });
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);
const MON = at("2026-10-19T07:00:00Z"); // Monday 10:00 Addis
const WED10 = at("2026-10-21T07:00:00Z");
const THU_LOCK = at("2026-10-22T15:00:05Z");

async function staffActor(d: Tx | typeof db, email: string): Promise<Actor> {
  const [u] = await d.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}
async function clientActor(d: Tx | typeof db, phone: string): Promise<Actor> {
  const [c] = await d.select().from(s.clients).where(eq(s.clients.phone, phone));
  const [u] = await d.select().from(s.user).where(eq(s.user.id, c.userId!));
  return { userId: u.id, roles: u.roles, clientId: c.id, name: u.name };
}
async function count(tx: Tx, table: string, where = "true") {
  const r = await tx.execute(sql.raw(`select count(*)::int as n from ${table} where ${where}`));
  return (r as unknown as { n: number }[])[0].n;
}

describe("Lead capture", () => {
  it("normalises the phone, creates a lead and rejects a duplicate phone", async () => {
    await inRollback(db, async (tx) => {
      const ctx: Ctx = { db: tx, actor: await staffActor(tx, "nebiyou@questmeals.demo"), now: MON };
      const lead = await createLead(ctx, { firstName: " Meron ", lastName: "Alemu", phone: "0922 33 44 55", source: "instagram", notes: "Saw the reel" });
      expect(lead.phone).toBe("+251922334455");
      expect(lead.status).toBe("lead");
      expect(lead.firstName).toBe("Meron");
      expect(lead.leadSource).toBe("instagram");
      await expect(createLead(ctx, { firstName: "X", lastName: "Y", phone: "+251 922 334 455", source: "walk_in" })).rejects.toThrow(/already has this phone/);
      await expect(createLead(ctx, { firstName: "X", lastName: "Y", phone: "12345", source: "walk_in" })).rejects.toThrow(/Ethiopian mobile/);
      expect(await count(tx, "audit_log", `action = 'client.create_lead' and entity_id = '${lead.id}'`)).toBe(1);
    });
  });
});

describe("Client list", () => {
  it("returns payment status paid / due / overdue / none from invoices", async () => {
    await inRollback(db, async (tx) => {
      const ctx: Ctx = { db: tx, actor: await staffActor(tx, "nebiyou@questmeals.demo"), now: MON };
      const rows = await listClients(ctx);
      expect(rows.length).toBeGreaterThanOrEqual(10);
      const values = new Set(rows.map((r) => r.payment));
      for (const v of values) expect(["paid", "due", "overdue", "none"]).toContain(v);
      expect(rows.find((r) => r.phone === "+251911000010")?.payment).toBe("none"); // the lead has no invoices
      expect(values.has("due")).toBe(true); // next week's issued invoices are due Thursday
      // after the cutoff passes, those issued invoices are overdue
      const later = await listClients({ ...ctx, now: at("2026-10-22T16:00:00Z") });
      expect(later.some((r) => r.payment === "overdue")).toBe(true);
      expect(rows.some((r) => r.packageName && r.areaName)).toBe(true);
    });
  });

  it("paymentStateOf ignores void invoices", () => {
    const now = at("2026-10-20T00:00:00Z");
    expect(paymentStateOf([], now)).toBe("none");
    expect(paymentStateOf([{ status: "void", dueAt: now }], now)).toBe("none");
    expect(paymentStateOf([{ status: "paid", dueAt: now }], now)).toBe("paid");
    expect(paymentStateOf([{ status: "paid", dueAt: now }, { status: "issued", dueAt: at("2026-10-21T00:00:00Z") }], now)).toBe("due");
    expect(paymentStateOf([{ status: "issued", dueAt: at("2026-10-19T00:00:00Z") }], now)).toBe("overdue");
  });
});

describe("Authorization", () => {
  it("a client cannot call staff services", async () => {
    await inRollback(db, async (tx) => {
      const client = await clientActor(tx, "+251911000001");
      const ctx: Ctx = { db: tx, actor: client, now: MON };
      const other = (await tx.select().from(s.clients).where(eq(s.clients.phone, "+251911000002")))[0];
      await expect(listClients(ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getClientDetail(ctx, client.clientId!)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createLead(ctx, { firstName: "A", lastName: "B", phone: "0933000000", source: "other" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateClient(ctx, other.id, { address: "Somewhere" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(resetClientPassword(ctx, other.id, "Hacked123!")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(todaySummary(ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(previewWeek(ctx, "2026-10-26")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(quickStartQueue(ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(paymentQueue(ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(lockWeekNow(ctx, "2026-10-19")).rejects.toBeInstanceOf(ForbiddenError);
      // signed out
      await expect(createLead({ db: tx, actor: null, now: MON }, { firstName: "A", lastName: "B", phone: "0933000000", source: "other" })).rejects.toBeInstanceOf(ForbiddenError);
      // the nutritionist reads clients but cannot reset passwords or lock orders
      const nut = await staffActor(tx, "nutritionist@questmeals.demo");
      await expect(resetClientPassword({ db: tx, actor: nut, now: MON }, other.id, "Whatever123")).rejects.toBeInstanceOf(ForbiddenError);
      const detail = await getClientDetail({ db: tx, actor: nut, now: MON }, other.id);
      expect(detail.invoices).toEqual([]); // no money access
      expect(detail.audit).toEqual([]);
    });
  });
});

describe("Accounts (AUTH-03)", () => {
  it("operations create a walk-in account and reset the password; the client signs in with the new one", async () => {
    const ops = await staffActor(db, "nebiyou@questmeals.demo");
    const ctx: Ctx = { db, actor: ops, now: MON };
    const auth = createAuth(db);
    const lead = await createLead(ctx, { firstName: "Walk", lastName: "In", phone: "0944556677", source: "walk_in" });
    cleanupClients.push(lead.id);
    const { userId } = await createClientAccount(ctx, lead.id, "FirstPass1");
    cleanupUsers.push(userId);
    await expect(createClientAccount(ctx, lead.id, "FirstPass1")).rejects.toThrow(/already has an account/);
    const first = await auth.api.signInPhoneNumber({ body: { phoneNumber: "+251944556677", password: "FirstPass1" } });
    expect(first.user.id).toBe(userId);

    await resetClientPassword(ctx, lead.id, "SecondPass2");
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: "+251944556677", password: "FirstPass1" } })).rejects.toThrow();
    const second = await auth.api.signInPhoneNumber({ body: { phoneNumber: "+251944556677", password: "SecondPass2" } });
    expect(second.user.id).toBe(userId);
    const audits = await db.select().from(s.auditLog).where(and(eq(s.auditLog.entityId, lead.id), eq(s.auditLog.action, "client.reset_password")));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain("SecondPass2");
    await db.delete(s.session).where(eq(s.session.userId, userId));
    await db.delete(s.auditLog).where(eq(s.auditLog.entityId, lead.id));
  });
});

describe("Client edits", () => {
  it("updateClient writes an audit row with before and after, and reports the week an address change applies", async () => {
    await inRollback(db, async (tx) => {
      const ctx: Ctx = { db: tx, actor: await staffActor(tx, "nebiyou@questmeals.demo"), now: MON };
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.phone, "+251911000001"));
      const res = await updateClient(ctx, c.id, { address: "New house, Bole Atlas", allergies: ["peanut", " peanut "], notes: "Gate code 12" });
      expect(res.changed.sort()).toEqual(["address", "allergies", "notes"]);
      expect(res.effectiveWeek).toBe("2026-10-26"); // Monday: next lockable week
      const [row] = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.entityId, c.id), eq(s.auditLog.action, "client.update")));
      expect((row.before as Record<string, unknown>).address).toBe(c.address);
      expect((row.after as Record<string, unknown>).address).toBe("New house, Bole Atlas");
      expect((row.after as Record<string, unknown>).allergies).toEqual(["peanut"]);
      // after Thursday's cutoff an address change applies from the week after next
      const late = await updateClient({ ...ctx, now: at("2026-10-22T16:00:00Z") }, c.id, { address: "Another place" });
      expect(late.effectiveWeek).toBe("2026-11-02");
      // nothing changed -> no audit row
      const before = await count(tx, "audit_log", `entity_id = '${c.id}'`);
      await updateClient(ctx, c.id, { address: "Another place" });
      expect(await count(tx, "audit_log", `entity_id = '${c.id}'`)).toBe(before);
      await expect(updateClient(ctx, c.id, { age: 5 })).rejects.toThrow(/Age/);
    });
  });

  it("an address change after the lock keeps the drop snapshot of the locked week (RULE-05)", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      await runJob(tx as never, "thursday-lock", THU_LOCK);
      const [o] = await tx.select().from(s.weeklyOrders).where(and(eq(s.weeklyOrders.weekStart, "2026-10-26"), eq(s.weeklyOrders.status, "locked"), eq(s.weeklyOrders.deliveryOption, "daily"))).limit(1);
      const [drop] = await tx.select().from(s.deliveryDrops).where(eq(s.deliveryDrops.clientId, o.clientId)).limit(1);
      const oldSnap = drop.addressSnapshot;
      const res = await updateClient({ db: tx, actor: ops, now: at("2026-10-22T17:00:00Z") }, o.clientId, { address: "Moved to CMC" });
      expect(res.effectiveWeek).toBe("2026-11-02");
      const [after] = await tx.select().from(s.deliveryDrops).where(eq(s.deliveryDrops.id, drop.id));
      expect(after.addressSnapshot).toBe(oldSnap);
      expect(after.addressSnapshot).not.toContain("Moved to CMC");
    });
  });

  it("lists conflicts left after swaps on the client page (CLI-08)", async () => {
    await inRollback(db, async (tx) => {
      const ctx: Ctx = { db: tx, actor: await staffActor(tx, "nebiyou@questmeals.demo"), now: MON };
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.phone, "+251911000003"));
      await tx.update(s.clients).set({ allergies: ["fish"], dislikes: [] }).where(eq(s.clients.id, c.id));
      await tx.delete(s.clientSwaps).where(eq(s.clientSwaps.clientId, c.id));
      const conflicts = await clientConflicts(ctx, c.id);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.flatMap((x) => x.conflicts).join(" ")).toMatch(/Allergy: fish/);
    });
  });
});

describe("Quick start onboarding (ORD-11)", () => {
  it("a quick-start client starts on the standard menu with no swaps and a provisional profile", async () => {
    await inRollback(db, async (tx) => {
      await tx.update(s.ingredients).set({ costPerUnitBirr: sql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: ops, now: WED10 };
      const lead = await createLead(ctx, { firstName: "Quick", lastName: "Starter", phone: "0955000111", source: "referral" });
      await expect(ensureProvisionalProfile(ctx, lead.id)).rejects.toThrow(/Fill in/);
      await updateClient(ctx, lead.id, { sex: "female", age: 28, weightG: 65000, heightCm: 165, activity: "light", goal: "lean", dislikes: ["fish"] });
      const { profile, created } = await ensureProvisionalProfile(ctx, lead.id);
      expect(created).toBe(true);
      expect(profile.provisional).toBe(true);
      expect(profile.setByUserId).toBeNull();
      expect((await ensureProvisionalProfile(ctx, lead.id)).created).toBe(false);

      const [pkg] = await tx.select().from(s.packages).where(eq(s.packages.code, "essential"));
      // a swap requested before the start does not apply to the quick-start period
      const [rule] = await tx.select().from(s.swapRules).limit(1);
      await tx.insert(s.clientSwaps).values({ clientId: lead.id, swapRuleId: rule.id, status: "approved", effectiveWeekStart: "2026-10-19" });
      const { subscription, invoice } = await createSubscription(ctx, { clientId: lead.id, packageId: pkg.id, deliveryOption: "pickup", billingPeriod: "weekly", termMonths: 1, start: "quick_start" });
      expect(subscription.isQuickStart).toBe(true);

      const q1 = await quickStartQueue(ctx);
      const item = q1.items.find((i) => i.clientId === lead.id)!;
      expect(item.stage).toBe("pending_payment");
      expect(item.provisional).toBe(true);
      expect(q1.capacity.find((x) => x.date === subscription.startDate)?.taken).toBeGreaterThanOrEqual(1);

      await recordCashPayment({ ...ctx, now: at("2026-10-21T12:00:00Z") }, { invoiceId: invoice.id });
      const [paid] = await tx.select().from(s.invoices).where(eq(s.invoices.id, invoice.id));
      expect(paid.status).toBe("paid");
      expect(await count(tx, "audit_log", `action = 'payment.confirm'`)).toBeGreaterThan(0);
      const [cl] = await tx.select().from(s.clients).where(eq(s.clients.id, lead.id));
      expect(cl.status).toBe("active"); // lead -> active on first confirmed payment (CLI-03)

      await runJob(tx as never, "daily-quick-start", at("2026-10-21T15:00:05Z"));
      const meals = await tx.select({ items: s.orderMeals.items }).from(s.orderMeals).where(eq(s.orderMeals.clientId, lead.id));
      expect(meals.length).toBeGreaterThan(0);
      for (const m of meals) for (const it of m.items as { source?: unknown }[]) expect(it.source).toBeUndefined(); // no swaps, no add-ons
      const [np] = await tx.select().from(s.nutritionProfiles).where(and(eq(s.nutritionProfiles.clientId, lead.id), eq(s.nutritionProfiles.isCurrent, true)));
      expect(np.provisional).toBe(true);
      const q2 = await quickStartQueue(ctx);
      expect(q2.items.find((i) => i.clientId === lead.id)?.stage).toBe("added");
    });
  });
});

describe("Payments and orders", () => {
  it("confirming a payment writes an audit row and marks the invoice paid when fully covered (PAY-04)", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.status, "issued")).limit(1);
      expect(inv).toBeTruthy();
      const p = await submitPayment({ db: tx, actor: ops, now: MON }, { invoiceId: inv.id, method: "cash" });
      const queue = await paymentQueue({ db: tx, actor: ops, now: MON });
      expect(queue.some((q) => q.payment.id === p.id)).toBe(true);
      const r = await confirmPayment({ db: tx, actor: ops, now: MON }, p.id);
      expect(r.invoicePaid).toBe(true);
      expect(await count(tx, "audit_log", `action = 'payment.confirm' and entity_id = '${p.id}'`)).toBe(1);
      await expect(confirmPayment({ db: tx, actor: ops, now: MON }, p.id)).rejects.toThrow(/already handled/);
    });
  });

  it("previews the lock without saving, then shows locked rows after it runs; lock now only after the cutoff", async () => {
    await inRollback(db, async (tx) => {
      const ops = await staffActor(tx, "nebiyou@questmeals.demo");
      const ctx: Ctx = { db: tx, actor: ops, now: WED10 };
      const before = await count(tx, "weekly_orders");
      const pre = await weekReview(ctx, "2026-10-26");
      expect(pre.locked).toBe(false);
      expect(pre.canLock).toBe(false);
      expect(pre.rows.length).toBeGreaterThan(0);
      expect(pre.rows.some((r) => r.status === "skipped_unpaid")).toBe(true);
      expect(await count(tx, "weekly_orders")).toBe(before);
      await expect(lockWeekNow(ctx, "2026-10-26")).rejects.toThrow(/cutoff has not passed|Only the week/);

      const after = { ...ctx, now: at("2026-10-22T15:30:00Z") };
      const review = await weekReview(after, "2026-10-26");
      expect(review.canLock).toBe(true);
      const res = await lockWeekNow(after, "2026-10-26");
      expect(res.locked + res.skippedUnpaid + res.paused).toBe(pre.rows.length);
      const post = await weekReview(after, "2026-10-26");
      expect(post.locked).toBe(true);
      expect(post.canLock).toBe(false);
      expect(post.rows.map((r) => r.status).sort()).toEqual(pre.rows.map((r) => r.status).sort());
      await expect(lockWeekNow(after, "2026-10-26")).rejects.toThrow(/already locked/);
      const today = await todaySummary(after);
      expect(today.lockedWeekDone).toBe(true);
    });
  });
});

describe("Staff Today to-do rows (read-only, per role)", () => {
  it("returns only the rows each role can act on, with counts that match the data", async () => {
    await inRollback(db, async (tx) => {
      const keys = async (email: string) => (await todayTasks({ db: tx, actor: await staffActor(tx, email), now: MON })).map((t) => t.key).sort();
      expect(await keys("fahim@questmeals.demo")).toEqual(["leads", "overdue", "quickStarts", "receipts", "swaps", "unpaidNext"]);
      expect(await keys("nebiyou@questmeals.demo")).toEqual(["drops", "leads", "overdue", "quickStarts", "receipts", "unpaidNext"]);
      expect(await keys("nutritionist@questmeals.demo")).toEqual(["checkins", "sizes", "swaps"]);
      const ops = await todayTasks({ db: tx, actor: await staffActor(tx, "nebiyou@questmeals.demo"), now: MON });
      expect(ops.find((t) => t.key === "receipts")?.count).toBe(await count(tx, "payments", "status = 'submitted'"));
      expect(ops.find((t) => t.key === "leads")?.count).toBe(await count(tx, "clients", "status = 'lead'"));
      expect(ops.find((t) => t.key === "drops")?.count).toBe(await count(tx, "delivery_drops", "drop_date = '2026-10-19' and status = 'pending'"));
      // kitchen staff cannot open Today; clients neither
      await expect(todayTasks({ db: tx, actor: await staffActor(tx, "kitchen@questmeals.demo"), now: MON })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
