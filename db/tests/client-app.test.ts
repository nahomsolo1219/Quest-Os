// Client app services (APP-03…APP-09, SWP-04, SWP-09, RULE-02, NUT-07, COM-08) against the seeded demo data.
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../schema";
import { runJob } from "../../src/server/jobs";
import { can, ForbiddenError, loadActor, type Actor } from "../../src/server/authz";
import type { Ctx } from "../../src/server/services/context";
import { listClientInvoices } from "../../src/server/services/billing";
import {
  addExtraProtein, endSwap, logWeight, myInvoices, myPlan, myProgress, mySwaps, requestSizeChange, requestSwap, todayForClient,
  updateMyProfile, uploadReceipt, weekMenu,
} from "../../src/server/services/client-app";
import { rateMeal } from "../../src/server/services/ratings";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const at = (iso: string) => new Date(iso);
const MON_10 = at("2026-10-19T07:00:00Z");
// Thursday 22 Oct 2026, Addis = UTC+3
const THU_1759 = at("2026-10-22T14:59:00Z");
const THU_1801 = at("2026-10-22T15:01:00Z");

async function clientActor(tx: Tx, phone: string): Promise<Actor> {
  const [c] = await tx.select().from(s.clients).where(eq(s.clients.phone, phone));
  const a = await loadActor(tx, c.userId!);
  return a!;
}
const ctxOf = (tx: Tx, actor: Actor, now = MON_10): Ctx => ({ db: tx, actor, now });

describe("own records only", () => {
  it("a client sees only their own invoices and cannot pay someone else's", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      const abel = await clientActor(tx, "+251911000001");
      const mine = await myInvoices(ctxOf(tx, sara));
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((i) => i.clientId === sara.clientId)).toBe(true);
      await expect(listClientInvoices(ctxOf(tx, sara), abel.clientId!)).rejects.toBeInstanceOf(ForbiddenError);
      const [abelInv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.clientId, abel.clientId!), eq(s.invoices.status, "issued")));
      await expect(uploadReceipt(ctxOf(tx, sara), { invoiceId: abelInv.id, method: "cash" })).rejects.toThrow(/not found/);
    });
  });

  it("a client pays their own invoice by cash without a photo; Telebirr needs a reference", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      const [inv] = await tx.select().from(s.invoices).where(and(eq(s.invoices.clientId, sara.clientId!), eq(s.invoices.status, "issued")));
      await expect(uploadReceipt(ctxOf(tx, sara), { invoiceId: inv.id, method: "telebirr" })).rejects.toThrow(/reference/);
      const p = await uploadReceipt(ctxOf(tx, sara), { invoiceId: inv.id, method: "cash" });
      expect(p.status).toBe("submitted");
      expect(p.clientId).toBe(sara.clientId);
    });
  });

  it("staff actors are not clients on the client screens", async () => {
    await inRollback(db, async (tx) => {
      const [u] = await tx.select().from(s.user).where(eq(s.user.email, "nebiyou@questmeals.demo"));
      const ops = (await loadActor(tx, u.id))!;
      await expect(myInvoices(ctxOf(tx, ops))).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

describe("swaps", () => {
  it("table swaps are approved within the package limit; the fourth on Essential is refused", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002"); // Essential, limit 3
      const rules = await tx.select().from(s.swapRules).where(eq(s.swapRules.active, true)).limit(4);
      const ctx = ctxOf(tx, sara);
      for (const r of rules.slice(0, 3)) expect((await requestSwap(ctx, { swapRuleId: r.id })).status).toBe("approved");
      await expect(requestSwap(ctx, { swapRuleId: rules[3].id })).rejects.toThrow("Your Essential plan allows 3 standing swaps");
      await expect(requestSwap(ctx, { swapRuleId: rules[0].id })).rejects.toThrow(/already have this swap/);
      expect((await mySwaps(ctx)).used).toBe(3);
      expect((await myPlan(ctx)).swapsUsed).toBe(3);
    });
  });

  it("a table swap takes effect from the next lockable week: Thursday 17:59 vs 18:01 Addis", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      const [r1, r2] = await tx.select().from(s.swapRules).where(eq(s.swapRules.active, true)).limit(2);
      const before = await requestSwap(ctxOf(tx, sara, THU_1759), { swapRuleId: r1.id });
      const after = await requestSwap(ctxOf(tx, sara, THU_1801), { swapRuleId: r2.id });
      expect(before.effectiveWeekStart).toBe("2026-10-26");
      expect(after.effectiveWeekStart).toBe("2026-11-02");
      // ending a swap also waits for the next lockable week
      const ended = await endSwap(ctxOf(tx, sara, THU_1801), before.id);
      expect(ended.endedWeekStart).toBe("2026-11-02");
    });
  });

  it("a custom request goes to the nutritionist as requested and does not count toward the limit", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      const row = await requestSwap(ctxOf(tx, sara), { customRequest: "No onions please" });
      expect(row.status).toBe("requested");
      expect(row.swapRuleId).toBeNull();
      expect((await mySwaps(ctxOf(tx, sara))).used).toBe(0);
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(eq(s.notifications.kind, "swap.requested"));
      expect(n.n).toBeGreaterThan(0);
    });
  });

  it("extra protein needs a price; with prices it is added from the next lockable week", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      await expect(addExtraProtein(ctxOf(tx, sara), "lunch")).rejects.toThrow(/Prices are being updated/);
      await tx.update(s.ingredients).set({ costPerUnitBirr: sql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
      const a = await addExtraProtein(ctxOf(tx, sara), "lunch");
      expect(a.effectiveWeekStart).toBe("2026-10-26");
      expect(a.pricePerPortionBirr % 10).toBe(0);
      await expect(addExtraProtein(ctxOf(tx, sara), "lunch")).rejects.toThrow(/already/);
    });
  });
});

describe("weight, size and profile", () => {
  it("logs weight as a client check-in and shows it in progress", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      const row = await logWeight(ctxOf(tx, sara), { weightKg: 67.4 });
      expect(row.source).toBe("client");
      expect(row.weightG).toBe(67400);
      expect(row.checkinDate).toBe("2026-10-19");
      await logWeight(ctxOf(tx, sara), { weightKg: 67.2 }); // same day: updated, not duplicated
      const prog = await myProgress(ctxOf(tx, sara));
      expect(prog.filter((p) => p.date === "2026-10-19" && p.source === "client")).toHaveLength(1);
      await expect(logWeight(ctxOf(tx, sara), { weightKg: 67, date: "2026-10-25" })).rejects.toThrow(/today or an earlier/);
    });
  });

  it("a client cannot change their own size; they can only request it", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      expect(can(sara, "nutrition.write")).toBe(false);
      const [before] = await tx.select().from(s.nutritionProfiles).where(and(eq(s.nutritionProfiles.clientId, sara.clientId!), eq(s.nutritionProfiles.isCurrent, true)));
      const r = await requestSizeChange(ctxOf(tx, sara), "I am always hungry, can I go up a size?");
      expect(r.sentTo).toBeGreaterThan(0);
      await expect(requestSizeChange(ctxOf(tx, sara), "again")).rejects.toThrow(/already sent/);
      const [after] = await tx.select().from(s.nutritionProfiles).where(and(eq(s.nutritionProfiles.clientId, sara.clientId!), eq(s.nutritionProfiles.isCurrent, true)));
      expect(after.size).toBe(before.size);
      expect(after.id).toBe(before.id);
    });
  });

  it("address changes apply from the next lockable week", async () => {
    await inRollback(db, async (tx) => {
      const abel = await clientActor(tx, "+251911000001");
      const [area] = await tx.select().from(s.areas).limit(1);
      const r = await updateMyProfile(ctxOf(tx, abel, THU_1801), { address: "New road 1", areaId: area.id, landmark: "", telegramOptIn: false });
      expect(r.addressChanged).toBe(true);
      expect(r.effectiveWeek).toBe("2026-11-02");
      await expect(updateMyProfile(ctxOf(tx, abel), { address: "", areaId: null, landmark: "", telegramOptIn: false })).rejects.toThrow(/delivered/);
    });
  });
});

describe("today, menu and ratings", () => {
  it("shows the locked meals and lets the client rate only meals they received, once per meal and day", async () => {
    await inRollback(db, async (tx) => {
      await runJob(tx as never, "thursday-lock", at("2026-10-22T15:00:05Z"));
      const yared = await clientActor(tx, "+251911000003"); // monthly biller, paid: locked for 26 Oct
      const monNoon = at("2026-10-26T09:00:00Z");
      const ctx = ctxOf(tx, yared, monNoon);
      const today = await todayForClient(ctx);
      expect(today.meals).toHaveLength(4);
      expect(today.meals[0].slot).toBe("breakfast");
      expect(today.meals.every((m) => m.eatBy && m.kcal > 0)).toBe(true);

      const meal = today.meals[1];
      await rateMeal(ctx, { mealId: meal.mealId, serviceDate: "2026-10-26", rating: 4, comment: "Good" });
      await rateMeal(ctx, { mealId: meal.mealId, serviceDate: "2026-10-26", rating: 5 });
      const rows = await tx.select().from(s.mealRatings).where(eq(s.mealRatings.clientId, yared.clientId!));
      expect(rows).toHaveLength(1);
      expect(rows[0].rating).toBe(5);

      // a meal not on their order that day, a future day, and a bad rating are refused
      const [other] = await tx.select().from(s.meals).where(eq(s.meals.menu, "D")).limit(1);
      await expect(rateMeal(ctx, { mealId: other.id, serviceDate: "2026-10-26", rating: 3 })).rejects.toThrow(/meals you received/);
      await expect(rateMeal(ctx, { mealId: meal.mealId, serviceDate: "2026-10-27", rating: 3 })).rejects.toThrow(/once you have it/);
      await expect(rateMeal(ctx, { mealId: meal.mealId, serviceDate: "2026-10-26", rating: 6 })).rejects.toThrow(/1 to 5/);
      // another client cannot rate Yared's meal
      const sara = await clientActor(tx, "+251911000002");
      await expect(rateMeal(ctxOf(tx, sara, monNoon), { mealId: meal.mealId, serviceDate: "2026-10-26", rating: 3 })).rejects.toThrow(/meals you received/);

      const locked = await weekMenu(ctx, "2026-10-26");
      expect(locked.state).toBe("locked");
      expect(locked.days.length).toBe(7);
    });
  });

  it("an unlocked week shows the standard menu at the client's profile with the cutoff", async () => {
    await inRollback(db, async (tx) => {
      const sara = await clientActor(tx, "+251911000002");
      const m = await weekMenu(ctxOf(tx, sara), "2026-10-26");
      expect(m.state).toBe("open");
      expect(m.cutoff.toISOString()).toBe("2026-10-22T15:00:00.000Z");
      expect(m.days).toHaveLength(7);
      expect(m.days[0].meals).toHaveLength(4);
    });
  });
});
