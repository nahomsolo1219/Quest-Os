// Delivery services against a real database (rolled back): drops after the lock, rider permissions,
// failed needs a reason (+ ops notified), reorder persists, rider assignment, pick-up list.
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import * as s from "../schema";
import { runJob } from "../../src/server/jobs";
import type { Ctx } from "../../src/server/services/context";
import { assignRider, dropsForDate, markDelivered, markFailed, pickupList, reorderDrops } from "../../src/server/services/delivery";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);
const THU_LOCK = at("2026-10-22T15:00:05Z");
const MON = "2026-10-26";
const MON_MORNING = at("2026-10-26T06:00:00Z"); // Monday 09:00 Addis

async function staffActor(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}

async function setup(tx: Tx) {
  await runJob(tx as never, "thursday-lock", THU_LOCK);
  const ops = await staffActor(tx, "nebiyou@questmeals.demo");
  const rider = await staffActor(tx, "rider@questmeals.demo");
  const kitchen = await staffActor(tx, "kitchen@questmeals.demo");
  // a second rider
  const [other] = await tx.insert(s.user).values({ name: "Other Rider", email: "other.rider@questmeals.demo", roles: ["delivery"], emailVerified: true }).returning();
  const otherRider: Actor = { userId: other.id, roles: ["delivery"], clientId: null, name: other.name };
  return { ops, rider, kitchen, otherRider };
}

describe("drops", () => {
  it("exist after the lock, grouped by area in route order; riders see only delivery drops", async () => {
    await inRollback(db, async (tx) => {
      const { ops, rider, kitchen } = await setup(tx);
      const all = await tx.select().from(s.deliveryDrops).where(eq(s.deliveryDrops.dropDate, MON));
      expect(all.length).toBeGreaterThan(0);
      const list = await dropsForDate({ db: tx, actor: ops, now: MON_MORNING }, MON);
      const flat = list.groups.flatMap((g) => g.drops);
      expect(flat.length).toBe(all.filter((d) => d.kind === "delivery").length);
      expect(flat.every((d) => d.kind === "delivery")).toBe(true);
      expect(flat.every((d) => d.phone)).toBe(true);
      const mine = await dropsForDate({ db: tx, actor: rider, now: MON_MORNING }, MON);
      expect(mine.groups.flatMap((g) => g.drops).length).toBe(flat.length); // all unassigned
      // kitchen sees drops but no phone or address
      const k = await dropsForDate({ db: tx, actor: kitchen, now: MON_MORNING }, MON);
      expect(k.groups.flatMap((g) => g.drops).every((d) => d.phone === null && d.address === null)).toBe(true);
      // riders cannot look at another day
      await expect(dropsForDate({ db: tx, actor: rider, now: MON_MORNING }, "2026-10-27")).rejects.toBeInstanceOf(ForbiddenError);
      // pick-up list holds the pickup drops
      const pickups = await pickupList({ db: tx, actor: ops, now: MON_MORNING }, MON);
      expect(pickups.drops.length).toBe(all.filter((d) => d.kind === "pickup").length);
      for (const p of pickups.drops) expect(p.mealsCount).toBeGreaterThan(0);
    });
  });

  it("a rider can mark their own or an unassigned drop delivered today, not another rider's or another day's", async () => {
    await inRollback(db, async (tx) => {
      const { ops, rider, otherRider } = await setup(tx);
      const drops = await tx.select().from(s.deliveryDrops).where(and(eq(s.deliveryDrops.dropDate, MON), eq(s.deliveryDrops.kind, "delivery")));
      expect(drops.length).toBeGreaterThanOrEqual(3);
      const [a, b, c] = drops;
      const opsCtx: Ctx = { db: tx, actor: ops, now: MON_MORNING };
      await assignRider(opsCtx, [b.id], rider.userId);
      await assignRider(opsCtx, [c.id], otherRider.userId);
      const riderCtx: Ctx = { db: tx, actor: rider, now: MON_MORNING };

      const ra = await markDelivered(riderCtx, a.id); // unassigned -> rider takes it
      expect(ra.status).toBe("delivered");
      expect(ra.riderUserId).toBe(rider.userId);
      expect(ra.deliveredAt?.toISOString()).toBe(MON_MORNING.toISOString());
      expect((await markDelivered(riderCtx, b.id)).status).toBe("delivered");
      await expect(markDelivered(riderCtx, c.id)).rejects.toBeInstanceOf(ForbiddenError);
      // the next day the rider cannot change Monday's drops
      await expect(markDelivered({ ...riderCtx, now: at("2026-10-27T06:00:00Z") }, a.id)).rejects.toBeInstanceOf(ForbiddenError);
      // tomorrow's drop cannot be marked today
      const [tue] = await tx.select().from(s.deliveryDrops).where(and(eq(s.deliveryDrops.dropDate, "2026-10-27"), eq(s.deliveryDrops.kind, "delivery"), isNull(s.deliveryDrops.riderUserId))).limit(1);
      await expect(markDelivered(riderCtx, tue.id)).rejects.toBeInstanceOf(ForbiddenError);
      // rider view shows own + unassigned only
      const view = await dropsForDate(riderCtx, MON);
      expect(view.groups.flatMap((g) => g.drops).some((d) => d.id === c.id)).toBe(false);
      expect(view.counts.delivered).toBe(2);
    });
  });

  it("failed requires a reason and notifies operations", async () => {
    await inRollback(db, async (tx) => {
      const { ops, rider } = await setup(tx);
      const [d] = await tx.select().from(s.deliveryDrops).where(and(eq(s.deliveryDrops.dropDate, MON), eq(s.deliveryDrops.kind, "delivery"))).limit(1);
      const ctx: Ctx = { db: tx, actor: rider, now: MON_MORNING };
      await expect(markFailed(ctx, d.id, "  ")).rejects.toThrow(/reason/);
      const r = await markFailed(ctx, d.id, "Not home");
      expect(r.status).toBe("failed");
      expect(r.failedReason).toBe("Not home");
      const notes = await tx.select().from(s.notifications).where(and(eq(s.notifications.kind, "delivery.failed"), eq(s.notifications.userId, ops.userId)));
      expect(notes).toHaveLength(1);
      expect(notes[0].link).toBe(`/staff/delivery?date=${MON}`);
    });
  });

  it("reorder persists route positions; only operations reorder and assign", async () => {
    await inRollback(db, async (tx) => {
      const { ops, rider } = await setup(tx);
      const ctx: Ctx = { db: tx, actor: ops, now: MON_MORNING };
      const before = (await dropsForDate(ctx, MON)).groups.flatMap((g) => g.drops).map((d) => d.id);
      const reversed = [...before].reverse();
      await reorderDrops(ctx, MON, reversed);
      const rows = await tx.select().from(s.deliveryDrops).where(and(eq(s.deliveryDrops.dropDate, MON), eq(s.deliveryDrops.kind, "delivery")));
      for (const [i, id] of reversed.entries()) expect(rows.find((r) => r.id === id)!.routePosition).toBe(i + 1);
      // reordering one area's drops keeps the others in place
      const groups = (await dropsForDate(ctx, MON)).groups;
      const g = groups.find((x) => x.drops.length >= 2);
      if (g) {
        const ids = g.drops.map((d) => d.id);
        await reorderDrops(ctx, MON, [ids[1], ids[0], ...ids.slice(2)]);
        const after = (await dropsForDate(ctx, MON)).groups.find((x) => x.areaId === g.areaId)!.drops.map((d) => d.id);
        expect(after.slice(0, 2)).toEqual([ids[1], ids[0]]);
      }
      await expect(reorderDrops({ ...ctx, actor: rider }, MON, before)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(assignRider({ ...ctx, actor: rider }, [before[0]], rider.userId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(assignRider(ctx, [before[0]], ops.userId === rider.userId ? "x" : (await staffActor(tx, "kitchen@questmeals.demo")).userId)).rejects.toThrow(/not a rider/);
    });
  });
});
