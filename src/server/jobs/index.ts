// The eight scheduled jobs (SPEC document 8). Each is idempotent: running it twice does not double-lock,
// double-charge or double-notify (orders/invoices/drops have unique keys; notifications carry dedupe keys).
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { clients, jobRuns, subscriptions } from "@db/schema";
import type { DbOrTx as Db } from "@db/client";
import { renewalRemindersDue, checkinDue } from "@/domain/checkins";
import { formatBirr } from "@/domain/money";
import { nextServiceDay, weekLockedAt, weeklyCutoff, nextLockableWeek } from "@/domain/schedule";
import { addisDate, formatDate } from "@/domain/time";
import { generateInvoicesForLock, unpaidInvoicesDueBy } from "@/server/services/billing";
import { notify, sendCommunityDigests, userIdsWithRoles } from "@/server/services/notifications";
import { ensureDrops, lockQuickStarts, lockWeekOrders } from "@/server/services/orders";
import { loadSettings } from "@/server/services/settings";
import { sendChallengeReminders } from "@/server/services/community";
import { endExpiredPlans, repriceRenewedPlansAtLockEnd } from "@/server/services/subscriptions";
import { SYSTEM_ACTOR } from "@/server/services/context";

export const JOB_NAMES = [
  "tuesday-reminder", "thursday-last-call", "thursday-lock", "friday-shopping",
  "daily-quick-start", "daily-morning", "sunday-stock", "daily-renewals",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

type JobCtx = { db: Db; now: Date };
type JobResult = Record<string, unknown>;

async function activeClientUsers(db: Db) {
  return db.select({ clientId: clients.id, userId: clients.userId, firstName: clients.firstName, status: clients.status, checkInWeekday: clients.checkInWeekday })
    .from(clients).where(and(inArray(clients.status, ["active", "paused"]), isNotNull(clients.userId)));
}

const jobs: Record<JobName, (c: JobCtx) => Promise<{ runKey: string; result: JobResult }>> = {
  /** Tuesday 10:00: changes and payment due by Thursday 18:00. */
  async "tuesday-reminder"({ db, now }) {
    const s = await loadSettings(db);
    const week = nextLockableWeek(now, s.schedule);
    const users = (await activeClientUsers(db)).filter((c) => c.status === "active");
    const sent = await notify(db, { userIds: users.map((u) => u.userId!), kind: "reminder.weekly", title: "Changes and payment due Thursday 18:00",
      body: `Swaps, pauses and address changes for the week of ${formatDate(week)} must be in before Thursday 18:00. Make sure your payment is confirmed too.`,
      link: "/app/plan", dedupeKey: `tue-reminder:${week}` });
    return { runKey: week, result: { reminded: sent } };
  },

  /** Thursday 16:00: last call for unpaid invoices due at today's cutoff. */
  async "thursday-last-call"({ db, now }) {
    const s = await loadSettings(db);
    const week = nextLockableWeek(now, s.schedule);
    const due = await unpaidInvoicesDueBy(db, weeklyCutoff(week, s.schedule));
    let sent = 0;
    for (const d of due) if (d.userId) sent += await notify(db, { userIds: [d.userId], kind: "reminder.last_call",
      title: "Last call: payment due at 18:00 today", body: `${formatBirr(d.invoice.amountBirr)} is still unpaid. Unpaid weeks are not cooked.`,
      link: "/app/payments", dedupeKey: `last-call:${d.invoice.id}` });
    return { runKey: week, result: { unpaid: due.length, reminded: sent } };
  },

  /** Thursday 18:00: lock next week, generate the following invoices, summary to ops. */
  async "thursday-lock"({ db, now }) {
    const s = await loadSettings(db);
    const week = weekLockedAt(now, s.schedule);
    // Thursday 18:00 is also a daily quick-start lock: run it first so the outcome never depends on which of the two
    // Railway crons fires first (the separate daily-quick-start run is then a no-op; both are idempotent).
    const quickStarts = await lockQuickStarts({ db, now });
    const summary = await lockWeekOrders({ db, now }, week);
    const inv = await generateInvoicesForLock(db, week);
    const ops = await userIdsWithRoles(db, ["operations"]);
    await notify(db, { userIds: ops, kind: "ops.lock_summary", title: `Week of ${formatDate(week)} locked`,
      body: `${summary.locked} locked, ${summary.skippedUnpaid} skipped for non-payment${summary.skippedNames.length ? ` (${summary.skippedNames.join(", ")})` : ""}, ${summary.paused} paused. ${inv.created} new invoices.`,
      link: `/staff/orders?week=${week}`, dedupeKey: `lock-summary:${week}` });
    return { runKey: week, result: { ...summary, invoicesCreated: inv.created, quickStartsAdded: quickStarts.added } };
  },

  /** Friday 08:00: shopping list for next week is ready. */
  async "friday-shopping"({ db, now }) {
    const s = await loadSettings(db);
    const week = weekLockedAt(now, s.schedule);
    const ops = await userIdsWithRoles(db, ["operations"]);
    const sent = await notify(db, { userIds: ops, kind: "ops.shopping_list", title: "Shopping list ready",
      body: `Next week's shopping list (total grams needed minus stock on hand) is ready.`, link: `/staff/purchasing?week=${week}`, dedupeKey: `shopping:${week}` });
    return { runKey: week, result: { notified: sent } };
  },

  /** Daily 18:00: quick starts for the next service day, top-up list, counts to kitchen and ops. */
  async "daily-quick-start"({ db, now }) {
    const s = await loadSettings(db);
    const today = addisDate(now);
    const r = await lockQuickStarts({ db, now });
    const next = nextServiceDay(today, s.schedule);
    const staff = await userIdsWithRoles(db, ["operations", "kitchen"]);
    await notify(db, { userIds: staff, kind: "ops.quick_starts", title: `Quick starts for ${next ? formatDate(next) : "next service day"}: ${r.added}`,
      body: r.added ? `${r.names.join(", ")} added to the production sheet. Check the top-up purchase list for fresh items.` : "No new quick starts.",
      link: next ? `/staff/purchasing?topup=${next}` : "/staff/quick-starts", dedupeKey: `qs-counts:${today}`, telegram: r.added ? "now" : "none" });
    return { runKey: today, result: r };
  },

  /** Daily 06:00: production sheet link to the kitchen, route link to riders. */
  async "daily-morning"({ db, now }) {
    const today = addisDate(now);
    const drops = await ensureDrops(db, today, today);
    const challengeReminders = await sendChallengeReminders(db, now);
    const kitchen = await userIdsWithRoles(db, ["kitchen"]);
    const riders = await userIdsWithRoles(db, ["delivery"]);
    await notify(db, { userIds: kitchen, kind: "kitchen.production", title: `Production sheet for ${formatDate(today)}`, link: `/kitchen/production/${today}`, dedupeKey: `morning-kitchen:${today}` });
    await notify(db, { userIds: riders, kind: "delivery.route", title: `Your drops for ${formatDate(today)}`, link: "/delivery", dedupeKey: `morning-riders:${today}` });
    return { runKey: today, result: { dropsCreated: drops, challengeReminders } };
  },

  /** Sunday 17:00: stock count reminder. */
  async "sunday-stock"({ db, now }) {
    const today = addisDate(now);
    const kitchen = await userIdsWithRoles(db, ["kitchen"]);
    const sent = await notify(db, { userIds: kitchen, kind: "kitchen.stock_count", title: "Stock count due", body: "Count stock before Monday's cooking.",
      link: "/kitchen/stock", dedupeKey: `stock-count:${today}` });
    return { runKey: today, result: { notified: sent } };
  },

  /** Daily 09:00: end expired plans, renewal reminders (5 and 1 days), check-in reminders, community digest. */
  async "daily-renewals"({ db, now }) {
    const today = addisDate(now);
    const ended = await endExpiredPlans(db, today);
    const repriced = await repriceRenewedPlansAtLockEnd({ db, actor: SYSTEM_ACTOR, now });
    const subs = await db.select({ s: subscriptions, userId: clients.userId, firstName: clients.firstName }).from(subscriptions).innerJoin(clients, eq(clients.id, subscriptions.clientId))
      .where(eq(subscriptions.status, "active"));
    let renewals = 0;
    for (const due of renewalRemindersDue(subs.map((x) => x.s), today)) {
      const row = subs.find((x) => x.s.id === due.subscriptionId)!;
      const title = `Plan ends in ${due.daysLeft} day${due.daysLeft === 1 ? "" : "s"}`;
      if (row.userId) renewals += await notify(db, { userIds: [row.userId], kind: "reminder.renewal", title,
        body: `Plan end date ${formatDate(row.s.endDate)}. Renew to keep your meals coming.`, link: "/app/plan", dedupeKey: `renewal:${row.s.id}:${row.s.endDate}:${due.daysLeft}` });
      // the staff copy is a staff alert (links to the client page), so a staff member's client Telegram switch never hides it
      renewals += await notify(db, { userIds: await userIdsWithRoles(db, ["operations"]), kind: "ops.renewal_due", title: `${row.firstName ?? "A client"}: ${title.toLowerCase()}`,
        body: `End date ${formatDate(row.s.endDate)}.`, link: `/staff/clients/${row.s.clientId}`, dedupeKey: `renewal-ops:${row.s.id}:${row.s.endDate}:${due.daysLeft}` });
    }
    const users = await activeClientUsers(db);
    const checkins = users.filter((u) => checkinDue(u, today));
    const ci = await notify(db, { userIds: checkins.map((u) => u.userId!), kind: "reminder.checkin", title: "Check-in day", body: "Log your weight today.",
      link: "/app/progress", dedupeKey: `checkin:${today}` });
    const digests = await sendCommunityDigests(db);
    return { runKey: today, result: { ended, repriced, renewals, checkinReminders: ci, digests } };
  },
};

/** Runs a job and records it in job_runs (one row per job and run key). */
export async function runJob(db: Db, name: JobName, now: Date) {
  const startedAt = new Date();
  const { runKey, result } = await jobs[name]({ db, now });
  await db.insert(jobRuns).values({ job: name, runKey, startedAt, finishedAt: new Date(), summary: result as never })
    .onConflictDoUpdate({ target: [jobRuns.job, jobRuns.runKey], set: { finishedAt: new Date(), summary: sql`excluded.summary` } });
  return { job: name, runKey, result };
}


