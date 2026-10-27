// Tour data for the demo copy (DEMO_MODE=true): every staff tour step has something real for "today".
// Runs on its own database (<test db>_tour) through resetDemoDatabase, so the shared test database stays untouched.
import { and, count, eq, isNotNull } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbOrTx } from "../client";
import * as s from "../schema";
import { DEMO_TRY_ROLES, removeDemo, resetDemoDatabase } from "../seed";
import { loadActor } from "../../src/server/authz";
import { lockedMealsForCookDate, labelsForDate, packingForDate, productionForDate, recipeCards } from "../../src/server/services/kitchen";
import { dropsForDate, pickupList } from "../../src/server/services/delivery";
import { paymentQueue } from "../../src/server/services/billing";
import { quickStartQueue, todayTasks } from "../../src/server/services/ops";
import { checkinList, intakeQueue, swapApprovals } from "../../src/server/services/nutrition";
import { reportsQueue } from "../../src/server/services/community";
import { unreadCount } from "../../src/server/services/notifications";
import { isServiceDay, nextLockableWeek, weeklyCutoff } from "../../src/domain/schedule";
import { DEFAULT_SCHEDULE } from "../../src/domain/settings";
import { addDays } from "../../src/domain/time";
import { inRollback, testUrl } from "./helpers";

const tourUrl = (() => {
  const u = new URL(testUrl());
  u.pathname = `${u.pathname}_tour`;
  return u.toString();
})();

async function ensureDatabase(url: string) {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  u.pathname = "/postgres";
  const { sql } = createDb(u.toString(), { max: 1 });
  try {
    const rows = await sql`select 1 from pg_database where datname = ${name}`;
    if (rows.length === 0) await sql.unsafe(`create database "${name.replace(/"/g, "")}"`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const { db, sql } = createDb(tourUrl, { max: 3 });
afterAll(() => sql.end({ timeout: 5 }));

const COUNTED: [string, PgTable][] = [
  ["user", s.user], ["clients", s.clients], ["subscriptions", s.subscriptions], ["invoices", s.invoices], ["payments", s.payments],
  ["weekly_orders", s.weeklyOrders], ["order_days", s.orderDays], ["order_meals", s.orderMeals], ["delivery_drops", s.deliveryDrops],
  ["client_swaps", s.clientSwaps], ["checkins", s.checkins], ["community_posts", s.communityPosts], ["community_comments", s.communityComments],
  ["community_reports", s.communityReports], ["notifications", s.notifications], ["nutrition_profiles", s.nutritionProfiles],
  ["ingredients", s.ingredients], ["meals", s.meals], ["profile_portions", s.profilePortions], ["settings", s.settings], ["job_runs", s.jobRuns],
];
async function counts(d: DbOrTx = db) {
  const out: Record<string, number> = {};
  for (const [name, t] of COUNTED) out[name] = Number((await d.select({ n: count() }).from(t))[0].n);
  return out;
}

async function actorByEmail(email: string) {
  const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email));
  return (await loadActor(db, u.id))!;
}


const STAFF_EMAILS = ["dagi", "kidus", "fahim", "nebiyou", "nutritionist", "kitchen", "rider", "coach"].map((n) => `${n}@questmeals.demo`);

beforeAll(async () => {
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_DIR = ".data/storage-test-tour";
  await ensureDatabase(tourUrl);
});

describe("resetDemoDatabase", () => {
  it("empties and reseeds the same data twice (truncate, not drop)", async () => {
    const TODAY = "2026-10-27", NOW = new Date("2026-10-27T07:00:00Z");
    const first = await resetDemoDatabase(tourUrl, { today: TODAY, now: NOW });
    expect(first.tour).not.toBeNull();
    const a = await counts();
    // the shared pool above stays open across the reset (prepared statements, enum OIDs): a query after it still works
    const second = await resetDemoDatabase(tourUrl, { today: TODAY, now: NOW });
    const b = await counts();
    expect(b).toEqual(a);
    expect(second.tour).toEqual(first.tour);
    expect(a.user).toBe(16 + 1 + 2); // demo staff and clients, the coach, two quick-start sign-ups
    expect(a.job_runs).toBeGreaterThan(0);
  });
});

describe.each([
  { label: "Tuesday", today: "2026-10-27", now: new Date("2026-10-27T07:00:00Z"), sceneDate: "2026-10-27", cookToday: true, locked: ["2026-10-26"] },
  { label: "Saturday", today: "2026-10-31", now: new Date("2026-10-31T07:00:00Z"), sceneDate: "2026-10-31", cookToday: true, locked: ["2026-10-26", "2026-11-02"] },
  { label: "Sunday", today: "2026-11-01", now: new Date("2026-11-01T07:00:00Z"), sceneDate: "2026-10-31", cookToday: false, locked: ["2026-10-26", "2026-11-02"] },
])("tour data on a $label", ({ today, now, sceneDate, cookToday, locked }) => {
  const ctxFor = async (email: string) => ({ db, actor: await actorByEmail(email), now });
  let summary: Awaited<ReturnType<typeof resetDemoDatabase>>["tour"];

  beforeAll(async () => {
    summary = (await resetDemoDatabase(tourUrl, { today, now })).tour;
  });

  it("locks the current week (and next week once Thursday's cutoff has passed) through the real lock", async () => {
    expect(summary?.lockedWeeks).toEqual(locked);
    for (const w of locked) {
      const [run] = await db.select().from(s.jobRuns).where(and(eq(s.jobRuns.job, "thursday-lock"), eq(s.jobRuns.runKey, w)));
      expect(run, w).toBeTruthy();
      const rows = await db.select().from(s.weeklyOrders).where(and(eq(s.weeklyOrders.weekStart, w), eq(s.weeklyOrders.status, "locked")));
      expect(rows.length, w).toBeGreaterThanOrEqual(7);
    }
  });

  it("gives the kitchen a production sheet, recipes, packing list and labels for today or the next cook day", async () => {
    const kitchen = await ctxFor("kitchen@questmeals.demo");
    const tomorrow = addDays(today, 1);
    const cookDate = cookToday ? today : tomorrow;
    if (!cookToday) expect(await lockedMealsForCookDate(db, today)).toHaveLength(0); // Sunday: nothing is cooked
    expect((await productionForDate(kitchen, cookDate)).rows.length).toBeGreaterThan(0);
    expect((await recipeCards(kitchen, cookDate)).length).toBeGreaterThan(0);
    expect((await packingForDate(kitchen, cookDate)).length).toBeGreaterThan(0);
    expect((await labelsForDate(kitchen, cookDate)).length).toBeGreaterThan(0);
    // the next cook day after today is always locked too
    const next = [1, 2].map((n) => addDays(today, n)).find((d) => isServiceDay(d, DEFAULT_SCHEDULE))!;
    expect((await lockedMealsForCookDate(db, next)).length, next).toBeGreaterThan(0);
  });

  it("has drops in every state on the delivery scene date, assigned and unassigned, and a pick-up list", async () => {
    expect(summary?.sceneDate).toBe(sceneDate);
    const opsCtx = await ctxFor("nebiyou@questmeals.demo");
    const board = await dropsForDate(opsCtx, sceneDate);
    const drops = board.groups.flatMap((g) => g.drops);
    expect(drops.filter((d) => d.status === "delivered").length).toBeGreaterThanOrEqual(1);
    const failed = drops.filter((d) => d.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].failedReason).toBe("Not home");
    expect(drops.filter((d) => d.status === "pending").length).toBeGreaterThanOrEqual(2);
    const rider = await actorByEmail("rider@questmeals.demo");
    expect(drops.filter((d) => d.riderUserId === rider.userId && d.status === "pending").length).toBeGreaterThanOrEqual(1);
    expect(drops.filter((d) => d.riderUserId === null).length).toBeGreaterThanOrEqual(1);
    const pickups = await pickupList(opsCtx, sceneDate);
    expect(pickups.drops.length).toBeGreaterThanOrEqual(2);
    expect(pickups.drops.some((d) => d.status === "pending")).toBe(true);
    if (sceneDate === today) {
      // the rider's own screen for today
      const mine = await dropsForDate({ db, actor: rider, now }, today);
      expect(mine.groups.flatMap((g) => g.drops).length).toBeGreaterThanOrEqual(3);
    } else {
      expect(await db.select().from(s.deliveryDrops).where(eq(s.deliveryDrops.dropDate, today))).toHaveLength(0);
    }
  });

  it("has receipts waiting for the coming cutoff's week and unpaid invoices due at that cutoff", async () => {
    const week = nextLockableWeek(now, DEFAULT_SCHEDULE);
    const queue = await paymentQueue(await ctxFor("nebiyou@questmeals.demo"));
    const weekly = queue.filter((q) => q.invoice.kind === "weekly");
    expect(weekly).toHaveLength(3);
    for (const q of weekly) expect(q.invoice.periodStart).toBe(week);
    expect(queue.some((q) => q.invoice.kind === "quick_start")).toBe(true);
    const issued = await db.select().from(s.invoices).where(and(eq(s.invoices.status, "issued"), eq(s.invoices.periodStart, week), eq(s.invoices.kind, "weekly")));
    const waiting = new Set(weekly.map((q) => q.invoice.id));
    const unpaid = issued.filter((i) => !waiting.has(i.id));
    expect(unpaid.length).toBeGreaterThanOrEqual(2);
    for (const i of unpaid) expect(i.dueAt.getTime()).toBe(weeklyCutoff(week, DEFAULT_SCHEDULE).getTime());
  });

  it("has two quick starts (receipt waiting, paid) with provisional sizes to confirm", async () => {
    const q = await quickStartQueue(await ctxFor("nebiyou@questmeals.demo"));
    expect(q.items.map((i) => i.stage).sort()).toEqual(["paid", "receipt_waiting"]);
    expect(q.items.every((i) => i.provisional)).toBe(true);
    const intake = await intakeQueue(await ctxFor("nutritionist@questmeals.demo"));
    expect(intake.provisional).toHaveLength(2);
    const qsClients = await db.select().from(s.clients).where(eq(s.clients.isDemo, false));
    expect(qsClients).toHaveLength(0);
  });

  it("gives the nutritionist swap requests and check-ins due", async () => {
    const n = await ctxFor("nutritionist@questmeals.demo");
    const swaps = await swapApprovals(n);
    expect(swaps.requests.map((r) => r.s.customRequest)).toHaveLength(2);
    const due = await checkinList(n);
    expect(due.overdue.map((c) => c.firstName).sort()).toEqual(["Bethlehem", "Liya", "Mikias"]);
    const tasks = Object.fromEntries((await todayTasks(n)).map((t) => [t.key, t.count]));
    expect(tasks).toMatchObject({ swaps: 2, sizes: 2, checkins: 3 });
  });

  it("fills the owner and operations Today to-do lists", async () => {
    const ops = Object.fromEntries((await todayTasks(await ctxFor("nebiyou@questmeals.demo"))).map((t) => [t.key, t.count]));
    expect(ops.receipts).toBe(4);
    expect(ops.quickStarts).toBe(2);
    expect(ops.leads).toBe(3); // Rahel, the walk-in Tigist and Meseret (quick start not paid yet)
    expect(ops.unpaidNext).toBeGreaterThanOrEqual(2);
    if (sceneDate === today) expect(ops.drops).toBeGreaterThanOrEqual(3);
    const owner = Object.fromEntries((await todayTasks(await ctxFor("fahim@questmeals.demo"))).map((t) => [t.key, t.count]));
    expect(owner.receipts).toBe(4);
    expect(owner.quickStarts).toBe(2);
  });

  it("has community posts (coach, client progress and question), a client comment and an open report", async () => {
    const coach = await actorByEmail("coach@questmeals.demo");
    expect(coach.roles).toEqual(["coach"]);
    expect(await db.select().from(s.communityPosts).where(eq(s.communityPosts.authorUserId, coach.userId))).toHaveLength(1);
    const posts = await db.select().from(s.communityPosts);
    expect(posts.map((p) => p.type).sort()).toEqual(["announcement", "post", "post", "progress", "progress", "question"]);
    expect(posts.find((p) => p.type === "progress" && p.progress)).toBeTruthy();
    const comments = await db.select().from(s.communityComments);
    expect(comments.length).toBeGreaterThanOrEqual(1);
    const reports = await reportsQueue(await ctxFor("nebiyou@questmeals.demo"));
    expect(reports).toHaveLength(1);
    expect(reports[0].targetAuthor).toBe("Mikias A.");
    expect(await db.select().from(s.challengeCheckins)).toHaveLength(3);
  });

  it("leaves unread notifications for every staff member and lists working one-tap accounts", async () => {
    for (const email of STAFF_EMAILS) {
      const a = await actorByEmail(email);
      expect(await unreadCount({ db, actor: a, now }), email).toBeGreaterThan(0);
    }
    for (const r of DEMO_TRY_ROLES) {
      const [u] = await db.select().from(s.user).where(r.kind === "email" ? eq(s.user.email, r.login) : eq(s.user.phoneNumber, r.login));
      expect(u, r.login).toBeTruthy();
      expect((u.roles as string[]).includes(r.role), r.login).toBe(true);
    }
  });

  it("is all demo data: removeDemo deletes it and keeps reference data", async () => {
    await inRollback(db as never, async (tx: DbOrTx) => {
      await removeDemo(tx);
      const left = await counts(tx);
      for (const t of ["user", "clients", "subscriptions", "invoices", "payments", "weekly_orders", "order_days", "order_meals", "delivery_drops",
        "client_swaps", "checkins", "community_posts", "community_comments", "community_reports", "notifications", "nutrition_profiles"]) {
        expect(left[t], t).toBe(0);
      }
      expect(left.meals).toBe(17);
      expect(left.ingredients).toBeGreaterThan(0);
      const priced = await tx.select({ n: count() }).from(s.ingredients).where(isNotNull(s.ingredients.costPerUnitBirr));
      expect(Number(priced[0].n)).toBe(0); // reference prices stay empty
      expect(await tx.select().from(s.accountCredits)).toHaveLength(0);
    });
  });
});
