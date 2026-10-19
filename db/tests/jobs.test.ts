// Scheduled jobs: secret-protected route (SEC-12) and each job's effect + idempotency (JOB-01…JOB-09, RULE-06).
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../schema";
import { JOB_NAMES, runJob } from "../../src/server/jobs";
import { inRollback, testDb, testUrl } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);

async function notes(tx: Tx, kind: string) {
  const r = await tx.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(eq(s.notifications.kind, kind));
  return r[0].n;
}
async function usersWithRole(tx: Tx, role: string) {
  const r = await tx.execute(sql`select count(*)::int as n from "user" where ${role}::role = any(roles)`);
  return (r as unknown as { n: number }[])[0].n;
}

describe("job route", () => {
  it("rejects missing or wrong secrets and unknown jobs; runs with the right secret", async () => {
    process.env.DATABASE_URL = testUrl();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.QM_FAKE_NOW = "2026-10-25T14:00:00Z"; // Sunday 17:00 Addis
    const { POST } = await import("../../src/app/api/jobs/[job]/route");
    const { NextRequest } = await import("next/server");
    const req = (secret?: string) => new NextRequest("http://localhost/api/jobs/sunday-stock", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} });
    const params = (job: string) => ({ params: Promise.resolve({ job }) });
    expect((await POST(req(), params("sunday-stock"))).status).toBe(401);
    expect((await POST(req("wrong"), params("sunday-stock"))).status).toBe(401);
    expect((await POST(req("test-cron-secret"), params("not-a-job"))).status).toBe(404);
    const ok = await POST(req("test-cron-secret"), params("sunday-stock"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).runKey).toBe("2026-10-25");
    delete process.env.QM_FAKE_NOW;
  });
});

describe("jobs", () => {
  it("Tuesday 10:00 reminds every active client once (JOB-01)", async () => {
    await inRollback(db, async (tx) => {
      const r = await runJob(tx as never, "tuesday-reminder", at("2026-10-20T07:00:00Z"));
      const active = await tx.select().from(s.clients).where(and(eq(s.clients.status, "active"), sql`${s.clients.userId} is not null`));
      expect((r.result as { reminded: number }).reminded).toBe(active.length);
      await runJob(tx as never, "tuesday-reminder", at("2026-10-20T07:05:00Z"));
      expect(await notes(tx, "reminder.weekly")).toBe(active.length);
    });
  });

  it("Thursday 16:00 last call goes to clients with invoices due at the cutoff (JOB-02)", async () => {
    await inRollback(db, async (tx) => {
      const due = await tx.select().from(s.invoices).where(and(eq(s.invoices.status, "issued"), eq(s.invoices.dueAt, at("2026-10-22T15:00:00Z"))));
      expect(due.length).toBeGreaterThan(0);
      const r = await runJob(tx as never, "thursday-last-call", at("2026-10-22T13:00:00Z"));
      expect((r.result as { unpaid: number }).unpaid).toBe(due.length);
      await runJob(tx as never, "thursday-last-call", at("2026-10-22T13:00:00Z"));
      expect(await notes(tx, "reminder.last_call")).toBe(due.length);
    });
  });

  it("Friday 08:00 sends ops the shopping list link (JOB-04)", async () => {
    await inRollback(db, async (tx) => {
      const r = await runJob(tx as never, "friday-shopping", at("2026-10-23T05:00:00Z"));
      expect(r.runKey).toBe("2026-10-26");
      const [n] = await tx.select().from(s.notifications).where(eq(s.notifications.kind, "ops.shopping_list"));
      expect(n.link).toBe("/staff/purchasing?week=2026-10-26");
      await runJob(tx as never, "friday-shopping", at("2026-10-23T05:00:00Z"));
      expect(await notes(tx, "ops.shopping_list")).toBe(await usersWithRole(tx, "operations"));
    });
  });

  it("Daily 06:00 sends the kitchen the production sheet and riders their route (JOB-06)", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", at("2026-10-22T15:00:05Z"));
      const r = await runJob(tx as never, "daily-morning", at("2026-10-26T03:00:00Z"));
      expect(r.runKey).toBe("2026-10-26");
      const [k] = await tx.select().from(s.notifications).where(eq(s.notifications.kind, "kitchen.production"));
      expect(k.link).toBe("/kitchen/production/2026-10-26");
      await runJob(tx as never, "daily-morning", at("2026-10-26T03:10:00Z"));
      expect(await notes(tx, "kitchen.production")).toBe(await usersWithRole(tx, "kitchen"));
      expect(await notes(tx, "delivery.route")).toBe(await usersWithRole(tx, "delivery"));
    });
  });

  it("Sunday 17:00 reminds the kitchen to count stock (JOB-07, RULE-06)", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "sunday-stock", at("2026-10-25T14:00:00Z"));
      await runJob(tx as never, "sunday-stock", at("2026-10-25T14:01:00Z"));
      expect(await notes(tx, "kitchen.stock_count")).toBe(await usersWithRole(tx, "kitchen"));
    });
  });

  it("Daily 09:00: renewal reminders 5 and 1 days before the end, check-in reminders, expired plans end (JOB-08)", async () => {
    await inRollback(db, async (tx) => {
      const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.status, "active")).limit(1);
      await tx.update(s.subscriptions).set({ endDate: "2026-10-25" }).where(eq(s.subscriptions.id, sub.id));
      await runJob(tx as never, "daily-renewals", at("2026-10-20T06:00:00Z")); // 5 days left
      await runJob(tx as never, "daily-renewals", at("2026-10-20T06:30:00Z")); // again: no duplicate
      // check-in reminders go to active clients whose check-in weekday is today (Tuesday = 2)
      const tuesday = await tx.select().from(s.clients).where(and(eq(s.clients.checkInWeekday, 2), eq(s.clients.status, "active"), sql`${s.clients.userId} is not null`));
      const checkinNotes = await tx.select().from(s.notifications).where(and(eq(s.notifications.kind, "reminder.checkin"), sql`${s.notifications.dedupeKey} like 'checkin:2026-10-20:%'`));
      expect(checkinNotes.length).toBe(tuesday.length);
      const five = await tx.select().from(s.notifications).where(eq(s.notifications.kind, "reminder.renewal"));
      expect(five.length).toBeGreaterThanOrEqual(1);
      expect(five.every((n) => n.title.includes("5 days"))).toBe(true);
      // renewing moves the end date: reminders for the new end date are sent again
      await tx.update(s.subscriptions).set({ endDate: "2026-11-24" }).where(eq(s.subscriptions.id, sub.id));
      await runJob(tx as never, "daily-renewals", at("2026-11-19T06:00:00Z"));
      expect((await tx.select().from(s.notifications).where(eq(s.notifications.kind, "reminder.renewal"))).length).toBeGreaterThan(five.length);
      // plans past their end date are ended
      await tx.update(s.subscriptions).set({ endDate: "2026-11-01" }).where(eq(s.subscriptions.id, sub.id));
      const r = await runJob(tx as never, "daily-renewals", at("2026-11-03T06:00:00Z"));
      expect((r.result as { ended: number }).ended).toBeGreaterThanOrEqual(1);
      const [after] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id));
      expect(after.status).toBe("ended");
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.id, sub.clientId));
      expect(c.status).toBe("ended");
      expect(c.endedAt).toBe("2026-11-01");
    });
  });

  it("every job can run twice without doubling anything (JOB-09)", async () => {
    await inRollback(db, async (tx) => {
      const instants: Record<string, string> = {
        "tuesday-reminder": "2026-10-20T07:00:00Z", "thursday-last-call": "2026-10-22T13:00:00Z", "thursday-lock": "2026-10-22T15:00:05Z",
        "friday-shopping": "2026-10-23T05:00:00Z", "daily-quick-start": "2026-10-22T15:00:05Z", "daily-morning": "2026-10-26T03:00:00Z",
        "sunday-stock": "2026-10-25T14:00:00Z", "daily-renewals": "2026-10-20T06:00:00Z",
      };
      const tables = ["weekly_orders", "order_days", "order_meals", "invoices", "payments", "delivery_drops", "notifications", "account_credits"];
      const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async (t) =>
        [t, ((await tx.execute(sql.raw(`select count(*)::int as n from ${t}`))) as unknown as { n: number }[])[0].n] as const)));
      for (const job of JOB_NAMES) {
        await runJob(tx as never, job, at(instants[job]));
        const once = await snapshot();
        await runJob(tx as never, job, at(instants[job]));
        expect(await snapshot(), job).toEqual(once);
      }
    });
  });
});
