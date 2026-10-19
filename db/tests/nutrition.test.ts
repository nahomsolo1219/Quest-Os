// Nutritionist services: targets with suggestion + override (NUT-06), quick-start queue (NUT-08), swap approvals (SWP-05),
// check-ins (CHK-01), portion cells kept on recompute (MENU-12) and role checks (SEC-07).
import { afterAll, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import * as s from "../schema";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import type { Ctx } from "../../src/server/services/context";
import { checkinList, clientNutrition, decideSwap, intakeQueue, logCheckin, profileTable, recordConsultation, setNutrition, swapApprovals } from "../../src/server/services/nutrition";
import { recomputePortions, setPortionCell } from "../../src/server/services/portions";
import { updateSettings, loadSettings } from "../../src/server/services/settings";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Monday 19 Oct 2026 10:00 Addis
const NOW = new Date("2026-10-19T07:00:00Z");

async function staff(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}
const ctxOf = (tx: Tx, actor: Actor, now = NOW): Ctx => ({ db: tx, actor, now });

async function newClient(tx: Tx, phone: string, provisionalHoursAgo?: number) {
  const [c] = await tx.insert(s.clients).values({ firstName: "Quick", lastName: "Starter", phone, status: "active", sex: "female", age: 30,
    weightG: 70000, heightCm: 165, activity: "moderate", goal: "lean" }).returning();
  if (provisionalHoursAgo !== undefined) {
    await tx.insert(s.nutritionProfiles).values({ clientId: c.id, bmr: 1420, tdee: 2201, suggestedKcal: 1761, suggestedSize: "S", suggestedProteinG: 120,
      suggestedCarbG: 160, suggestedFatG: 53, kcalTarget: 1600, size: "S", goal: "lean", proteinG: 120, carbG: 160, fatG: 53, provisional: true,
      setByUserId: null, setAt: new Date(NOW.getTime() - provisionalHoursAgo * 3600_000), isCurrent: true });
  }
  return c;
}

describe("setNutrition", () => {
  it("stores the suggestion next to the set values, flags an override, records who/when and replaces the current profile", async () => {
    await inRollback(db, async (tx) => {
      const hana = await staff(tx, "nutritionist@questmeals.demo");
      const c = await newClient(tx, "+251911990001", 2);
      const ctx = ctxOf(tx, hana);
      const plain = await setNutrition(ctx, { clientId: c.id, size: "S", kcalTarget: 1600, proteinG: 120, carbG: 160, fatG: 53 });
      expect(plain.isOverride).toBe(false);
      expect(plain.profile.provisional).toBe(false);
      expect(plain.effectiveWeek).toBe("2026-10-26");

      const r = await setNutrition(ctx, { clientId: c.id, size: "M", kcalTarget: 2000, proteinG: 150, carbG: 200, fatG: 66, note: "Trains twice a day" });
      expect(r.isOverride).toBe(true);
      const rows = await tx.select().from(s.nutritionProfiles).where(eq(s.nutritionProfiles.clientId, c.id)).orderBy(desc(s.nutritionProfiles.setAt));
      expect(rows).toHaveLength(3);
      expect(rows.filter((x) => x.isCurrent)).toHaveLength(1);
      const cur = rows.find((x) => x.isCurrent)!;
      expect(cur.id).toBe(r.profile.id);
      expect(cur.size).toBe("M");
      expect(cur.suggestedSize).toBe("S");
      expect(cur.suggestedKcal).toBeGreaterThan(1600);
      expect(cur.setByUserId).toBe(hana.userId);
      expect(cur.setAt.getTime()).toBe(NOW.getTime());
      expect(cur.provisional).toBe(false);
      const audit = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.action, "nutrition.set"), eq(s.auditLog.entityId, c.id)));
      expect(audit).toHaveLength(2);
      expect(audit.find((a) => a.reason === "Trains twice a day")?.actorUserId).toBe(hana.userId);
    });
  });

  it("refuses operations and owners (only the nutritionist sets targets)", async () => {
    await inRollback(db, async (tx) => {
      const c = await newClient(tx, "+251911990002");
      for (const email of ["nebiyou@questmeals.demo", "dagi@questmeals.demo"]) {
        await expect(setNutrition(ctxOf(tx, await staff(tx, email)), { clientId: c.id, size: "S", kcalTarget: 1600, proteinG: 120, carbG: 160, fatG: 53 }))
          .rejects.toBeInstanceOf(ForbiddenError);
      }
      await expect(recordConsultation(ctxOf(tx, await staff(tx, "nebiyou@questmeals.demo")), { clientId: c.id, heldAt: NOW, mode: "phone" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(logCheckin(ctxOf(tx, await staff(tx, "kitchen@questmeals.demo")), { clientId: c.id, date: "2026-10-19", weightG: 70000 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(intakeQueue(ctxOf(tx, await staff(tx, "kitchen@questmeals.demo")))).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("rejects incomplete body stats with a message", async () => {
    await inRollback(db, async (tx) => {
      const [c] = await tx.insert(s.clients).values({ firstName: "No", lastName: "Stats", phone: "+251911990003", status: "lead", goal: "lean" }).returning();
      await expect(setNutrition(ctxOf(tx, await staff(tx, "nutritionist@questmeals.demo")), { clientId: c.id, size: "S", kcalTarget: 1600, proteinG: 120, carbG: 160, fatG: 53 }))
        .rejects.toThrow(/Body stats are incomplete/);
    });
  });
});

describe("intake queue", () => {
  it("lists provisional quick-start profiles with hours left, overdue ones, and clients without targets", async () => {
    await inRollback(db, async (tx) => {
      const hana = await staff(tx, "nutritionist@questmeals.demo");
      const fresh = await newClient(tx, "+251911990011", 10);
      const late = await newClient(tx, "+251911990012", 50);
      const none = await newClient(tx, "+251911990013");
      const q = await intakeQueue(ctxOf(tx, hana));
      const f = q.provisional.find((p) => p.clientId === fresh.id)!;
      expect(f.hoursLeft).toBe(38);
      expect(f.overdue).toBe(false);
      expect(q.provisional.find((p) => p.clientId === late.id)!.overdue).toBe(true);
      expect(q.provisional[0].clientId).toBe(late.id); // most urgent first
      expect(q.noProfile.some((c) => c.id === none.id && c.statsComplete)).toBe(true);
      expect(q.confirmHours).toBe(48);
      expect(q.flaggedDays).toBeGreaterThan(0);
      // confirming removes it from the queue
      await setNutrition(ctxOf(tx, hana), { clientId: fresh.id, size: "S", kcalTarget: 1600, proteinG: 120, carbG: 160, fatG: 53 });
      expect((await intakeQueue(ctxOf(tx, hana))).provisional.some((p) => p.clientId === fresh.id)).toBe(false);
    });
  });
});

describe("swap approvals", () => {
  it("approves a custom request mapped to a swap rule, audits, notifies, and refuses operations", async () => {
    await inRollback(db, async (tx) => {
      const hana = await staff(tx, "nutritionist@questmeals.demo");
      const [client] = await tx.select().from(s.clients).where(eq(s.clients.firstName, "Sara"));
      const [rule] = await tx.select().from(s.swapRules).where(eq(s.swapRules.active, true)).limit(1);
      const [req] = await tx.insert(s.clientSwaps).values({ clientId: client.id, swapRuleId: null, customRequest: "No onions please",
        status: "requested", effectiveWeekStart: "2026-10-26", requestedByUserId: client.userId }).returning();
      const list = await swapApprovals(ctxOf(tx, hana));
      expect(list.requests.some((r) => r.s.id === req.id)).toBe(true);

      await expect(decideSwap(ctxOf(tx, await staff(tx, "nebiyou@questmeals.demo")), { id: req.id, approve: true })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(decideSwap(ctxOf(tx, hana), { id: req.id, approve: false })).rejects.toThrow(/reason/);

      // Friday after the Thursday cutoff: the earliest week is 2 Nov
      const fri = new Date("2026-10-23T07:00:00Z");
      const done = await decideSwap(ctxOf(tx, hana, fri), { id: req.id, approve: true, swapRuleId: rule.id, note: "Mapped to the table" });
      expect(done.status).toBe("approved");
      expect(done.swapRuleId).toBe(rule.id);
      expect(done.decidedByUserId).toBe(hana.userId);
      expect(done.effectiveWeekStart).toBe("2026-11-02");
      const audit = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.action, "swap.approve"), eq(s.auditLog.entityId, req.id)));
      expect(audit).toHaveLength(1);
      const notes = await tx.select().from(s.notifications).where(eq(s.notifications.userId, client.userId!));
      expect(notes.some((n) => n.kind === "swap.decided")).toBe(true);
      await expect(decideSwap(ctxOf(tx, hana), { id: req.id, approve: false, note: "x" })).rejects.toThrow(/already decided/);
    });
  });
});

describe("check-ins and consultations", () => {
  it("logs a nutritionist check-in and lists clients with no check-in for two weeks", async () => {
    await inRollback(db, async (tx) => {
      const hana = await staff(tx, "nutritionist@questmeals.demo");
      const [client] = await tx.select().from(s.clients).where(eq(s.clients.firstName, "Abel"));
      const row = await logCheckin(ctxOf(tx, hana), { clientId: client.id, date: "2026-10-19", weightG: 90500, adherencePct: 90, notes: "Good week" });
      expect(row.source).toBe("nutritionist");
      expect(row.byUserId).toBe(hana.userId);
      await expect(logCheckin(ctxOf(tx, hana), { clientId: client.id, date: "2026-10-25", weightG: 90000 })).rejects.toThrow(/future/);
      await expect(logCheckin(ctxOf(tx, hana), { clientId: client.id, date: "2026-10-19", adherencePct: 120 })).rejects.toThrow(/Adherence/);
      const list = await checkinList(ctxOf(tx, hana), { clientId: client.id });
      expect(list.recent[0].c.id).toBe(row.id);
      // three weeks later nobody has checked in
      const later = await checkinList(ctxOf(tx, hana, new Date("2026-11-09T07:00:00Z")));
      expect(later.overdue.some((c) => c.id === client.id)).toBe(true);
      const consult = await recordConsultation(ctxOf(tx, hana), { clientId: client.id, heldAt: NOW, mode: "in_person", notes: "Follow-up" });
      const page = await clientNutrition(ctxOf(tx, hana), client.id);
      expect(page.consultations[0].c.id).toBe(consult.id);
      expect(page.suggestion?.size).toBeDefined();
      expect(page.current?.p.isCurrent).toBe(true);
    });
  });
});

describe("profile table", () => {
  it("keeps a manual cell on recompute, shows macros per profile, and clears it back to computed", async () => {
    await inRollback(db, async (tx) => {
      const hana = await staff(tx, "nutritionist@questmeals.demo");
      const ctx = ctxOf(tx, hana);
      const t = await profileTable(ctx, "A");
      expect(t.meals).toHaveLength(4);
      expect(t.meals[0].macros).toHaveLength(6);
      expect(t.meals[0].macros.every((m) => m.kcal > 0)).toBe(true);
      const part = t.meals[1].parts[0];
      await setPortionCell(ctx, { partId: part.id, profile: "M_LEAN", qty: 999 });
      await recomputePortions(ctx);
      const [cell] = await tx.select().from(s.profilePortions).where(and(eq(s.profilePortions.partId, part.id), eq(s.profilePortions.profile, "M_LEAN")));
      expect(cell.qty).toBe(999);
      expect(cell.isManual).toBe(true);
      await setPortionCell(ctx, { partId: part.id, profile: "M_LEAN", qty: null });
      const [back] = await tx.select().from(s.profilePortions).where(eq(s.profilePortions.id, cell.id));
      expect(back.isManual).toBe(false);
      expect(back.qty).toBe(cell.computedQty);
      await expect(setPortionCell(ctxOf(tx, await staff(tx, "nebiyou@questmeals.demo")), { partId: part.id, profile: "M_LEAN", qty: 10 })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("nutritionist may edit nutrition settings; operations may not (SEC-07)", async () => {
    await inRollback(db, async (tx) => {
      const cur = (await loadSettings(tx)).nutrition;
      const next = { ...cur, goalFactors: { lean: 0.82, build: 1.1 } };
      await updateSettings(ctxOf(tx, await staff(tx, "nutritionist@questmeals.demo")), "nutrition", next);
      expect((await loadSettings(tx)).nutrition.goalFactors.lean).toBe(0.82);
      await expect(updateSettings(ctxOf(tx, await staff(tx, "nebiyou@questmeals.demo")), "nutrition", next)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateSettings(ctxOf(tx, await staff(tx, "nutritionist@questmeals.demo")), "pricing", (await loadSettings(tx)).pricing)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
