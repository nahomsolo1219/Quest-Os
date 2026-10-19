// Public sign-up (APP-02, CLI-02): lead + account + provisional profile; duplicate phone; quick-start plan with
// prices; missing prices keep the lead and account but no plan.
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as s from "../schema";
import { DUPLICATE_PHONE, signUp, type SignUpInput } from "../../src/server/services/signup";
import type { Ctx } from "../../src/server/services/context";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const MON_10 = new Date("2026-10-19T07:00:00Z"); // Monday 10:00 Addis

async function setAllPrices(tx: Tx) {
  await tx.update(s.ingredients).set({ costPerUnitBirr: sql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
}

async function input(tx: Tx, over: Partial<SignUpInput> = {}): Promise<SignUpInput> {
  const [pkg] = await tx.select().from(s.packages).where(eq(s.packages.code, "essential"));
  const [area] = await tx.select().from(s.areas).limit(1);
  return {
    firstName: "Meron", lastName: "Alemu", phone: "0933 123 456", password: "Secret123!", sex: "female", age: 28, weightKg: 64, heightCm: 166,
    activity: "moderate", goal: "lean", allergies: ["Peanut", " peanut "], dislikes: ["fish"], address: "Bole, house 9", areaId: area.id, landmark: "Near Edna Mall",
    deliveryOption: "pickup", plan: { packageId: pkg.id, billingPeriod: "weekly", start: "quick_start" }, source: "instagram", ...over,
  };
}

const anon = (tx: Tx, now = MON_10): Ctx => ({ db: tx, actor: null, now });

describe("signUp", () => {
  it("anonymous sign-up creates a lead, a client login and a provisional profile; size assigned at once", async () => {
    await inRollback(db, async (tx) => {
      const r = await signUp(anon(tx), await input(tx, { plan: null }));
      expect(r.phone).toBe("+251933123456");
      expect(r.plan.status).toBe("none");
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.id, r.clientId));
      expect(c.status).toBe("lead");
      expect(c.leadSource).toBe("instagram");
      expect(c.allergies).toEqual(["peanut"]);
      expect(c.weightG).toBe(64000);
      expect(c.userId).toBe(r.userId);
      const [u] = await tx.select().from(s.user).where(eq(s.user.id, r.userId));
      expect(u.phoneNumber).toBe("+251933123456");
      expect(u.roles).toEqual(["client"]);
      const [acct] = await tx.select().from(s.account).where(eq(s.account.userId, r.userId));
      expect(acct.providerId).toBe("credential");
      expect(acct.password).not.toContain("Secret123!");
      const [np] = await tx.select().from(s.nutritionProfiles).where(eq(s.nutritionProfiles.clientId, r.clientId));
      expect(np.provisional).toBe(true);
      expect(np.setByUserId).toBeNull();
      expect(["S", "M", "L"]).toContain(np.size);
      expect(r.size).toBe(np.size);
    });
  });

  it("unknown ?source= falls back to other; invalid phone is rejected", async () => {
    await inRollback(db, async (tx) => {
      const r = await signUp(anon(tx), await input(tx, { plan: null, source: "tiktok" }));
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.id, r.clientId));
      expect(c.leadSource).toBe("other");
      await expect(signUp(anon(tx), await input(tx, { phone: "0811 123 456", plan: null }))).rejects.toThrow(/Ethiopian mobile number/);
    });
  });

  it("a phone number that already has an account is refused with a specific message", async () => {
    await inRollback(db, async (tx) => {
      await expect(signUp(anon(tx), await input(tx, { phone: "0911000001", plan: null }))).rejects.toThrow(DUPLICATE_PHONE);
      await signUp(anon(tx), await input(tx, { plan: null }));
      await expect(signUp(anon(tx), await input(tx, { phone: "+251933123456", plan: null }))).rejects.toThrow(DUPLICATE_PHONE);
    });
  });

  it("a staff-entered lead without a login is claimed by its phone (no duplicate record)", async () => {
    await inRollback(db, async (tx) => {
      const before = await tx.select().from(s.clients).where(eq(s.clients.phone, "+251911000010"));
      expect(before[0].userId).toBeNull();
      const r = await signUp(anon(tx), await input(tx, { phone: "0911000010", plan: null }));
      expect(r.clientId).toBe(before[0].id);
      expect((await tx.select().from(s.clients).where(eq(s.clients.phone, "+251911000010"))).length).toBe(1);
    });
  });

  it("quick start with prices set creates the plan and its quick-start invoice, due at 18:00", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      const r = await signUp(anon(tx), await input(tx));
      expect(r.plan.status).toBe("created");
      if (r.plan.status !== "created") return;
      expect(r.plan.startDate).toBe("2026-10-20");
      expect(r.plan.quickStart).toBe(true);
      expect(r.plan.capacityShifted).toBe(false);
      expect(r.plan.dueAt.toISOString()).toBe("2026-10-19T15:00:00.000Z");
      const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.clientId, r.clientId));
      expect(sub.status).toBe("pending_payment");
      expect(sub.isQuickStart).toBe(true);
      const inv = (await tx.select().from(s.invoices).where(eq(s.invoices.clientId, r.clientId))).filter((i) => i.kind === "quick_start");
      expect(inv).toHaveLength(1);
      expect(inv[0].amountBirr).toBe(r.plan.amountBirr);
      expect(inv[0].amountBirr).toBeGreaterThan(0);
    });
  });

  it("when the day's quick-start capacity is full the next available date is offered", async () => {
    await inRollback(db, async (tx) => {
      await setAllPrices(tx);
      await tx.insert(s.settings).values({ key: "schedule", value: { quickStartDailyCapacity: 1 } })
        .onConflictDoUpdate({ target: s.settings.key, set: { value: sql`${s.settings.value} || '{"quickStartDailyCapacity": 1}'::jsonb` } });
      const a = await signUp(anon(tx), await input(tx));
      const b = await signUp(anon(tx), await input(tx, { phone: "0933123457" }));
      expect(a.plan.status === "created" && a.plan.startDate).toBe("2026-10-20");
      expect(b.plan.status === "created" && b.plan.startDate).toBe("2026-10-21");
      expect(b.plan.status === "created" && b.plan.capacityShifted).toBe(true);
    });
  });

  it("missing ingredient prices: lead and account are created but no plan, with a price-missing result", async () => {
    await inRollback(db, async (tx) => {
      const r = await signUp(anon(tx), await input(tx));
      expect(r.plan.status).toBe("price_missing");
      if (r.plan.status === "price_missing") expect(r.plan.missing.length).toBeGreaterThan(0);
      expect(await tx.select().from(s.subscriptions).where(eq(s.subscriptions.clientId, r.clientId))).toHaveLength(0);
      expect(await tx.select().from(s.invoices).where(eq(s.invoices.clientId, r.clientId))).toHaveLength(0);
      expect(await tx.select().from(s.clients).where(eq(s.clients.id, r.clientId))).toHaveLength(1);
      expect(await tx.select().from(s.user).where(eq(s.user.id, r.userId))).toHaveLength(1);
    });
  });
});
