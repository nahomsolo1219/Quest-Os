import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "../schema";
import {
  assertCan, assertCanForClient, assertClientAccess, can, canUpdateDrop, ForbiddenError, homePathFor, isStaff, loadActor,
  PERMISSIONS, type Actor, type Permission, type Role,
} from "../../src/server/authz";
import { ROLES } from "../../src/domain/types";
import { testDb } from "./helpers";

const { db, sql } = testDb();
afterAll(() => sql.end({ timeout: 5 }));

const actor = (roles: Role[], extra: Partial<Actor> = {}): Actor => ({ userId: "u-" + roles.join("-"), roles, clientId: null, name: "Test", ...extra });

// [permission, roles that must be allowed]; every other role and anon must be denied. Mirrors PLAN.md section 4.
const MATRIX: [Permission, Role[]][] = [
  ["settings.write", ["owner"]],
  ["pricing.write", ["owner"]],
  ["settings.nutrition.write", ["owner", "nutritionist"]],
  ["settings.read", ["owner", "operations", "nutritionist", "kitchen"]],
  ["audit.read", ["owner", "operations"]],
  ["areas.write", ["owner", "operations"]],
  ["clients.read", ["owner", "operations", "nutritionist"]],
  ["clients.write", ["owner", "operations"]],
  ["clients.readKitchen", ["owner", "operations", "nutritionist", "kitchen"]],
  ["clients.readDeliveryContact", ["owner", "operations", "delivery"]],
  ["clients.readOwn", ["client"]],
  ["nutrition.write", ["nutritionist"]],
  ["nutrition.read", ["owner", "operations", "nutritionist"]],
  ["consultations.write", ["nutritionist"]],
  ["ingredients.write", ["owner", "operations"]],
  ["ingredients.nutrition.write", ["owner", "operations", "nutritionist"]],
  ["ingredients.read", ["owner", "operations", "nutritionist", "kitchen"]],
  ["menu.write", ["owner", "nutritionist"]],
  ["menu.read", ["owner", "operations", "nutritionist", "kitchen", "client"]],
  ["portions.write", ["nutritionist"]],
  ["portions.read", ["owner", "operations", "nutritionist", "kitchen"]],
  ["swapRules.write", ["owner", "operations", "nutritionist"]],
  ["swaps.approve", ["owner", "nutritionist"]],
  ["swaps.request", ["client"]],
  ["packages.write", ["owner"]],
  ["subscriptions.write", ["owner", "operations"]],
  ["subscriptions.read", ["owner", "operations", "nutritionist"]],
  ["discounts.apply", ["owner"]],
  ["pauses.requestOwn", ["client"]],
  ["invoices.read", ["owner", "operations"]],
  ["payments.confirm", ["owner", "operations"]],
  ["payments.submitOwn", ["client"]],
  ["orders.read", ["owner", "operations", "nutritionist", "kitchen"]],
  ["orders.readToday", ["owner", "operations", "nutritionist", "kitchen", "delivery"]],
  ["orders.lock", ["operations"]],
  ["kitchen.read", ["owner", "operations", "kitchen"]],
  ["stock.write", ["operations", "kitchen"]],
  ["purchases.write", ["operations"]],
  ["stock.read", ["owner", "operations", "kitchen"]],
  ["delivery.read", ["owner", "operations", "kitchen", "delivery"]],
  ["delivery.update", ["operations", "delivery"]],
  ["delivery.manage", ["operations"]],
  ["checkins.write", ["nutritionist"]],
  ["checkins.read", ["owner", "operations", "nutritionist"]],
  ["checkins.writeOwn", ["client"]],
  ["partners.write", ["owner"]],
  ["dashboard.read", ["owner"]],
  ["jobs.read", ["owner", "operations"]],
  ["community.moderate", ["owner", "operations"]],
  ["community.coach", ["coach"]],
  ["community.post", ["owner", "operations", "coach", "client"]],
  ["community.read", ["owner", "operations", "nutritionist", "coach", "client"]],
  ["mealRatings.read", ["owner", "operations", "nutritionist"]],
  ["mealRatings.writeOwn", ["client"]],
  ["notifications.own", [...ROLES]],
];

describe("permission matrix", () => {
  it("covers every listed permission", () => {
    for (const [p] of MATRIX) expect(PERMISSIONS[p], p).toBeDefined();
  });

  for (const [permission, allowed] of MATRIX) {
    it(`${permission}: allows ${allowed.join(", ")} only`, () => {
      for (const role of ROLES) {
        expect(can(actor([role]), permission), `${role} ${permission}`).toBe(allowed.includes(role));
      }
      expect(can(null, permission), `anon ${permission}`).toBe(false);
    });
  }

  it("anon gets only the public calculator and sign-up", () => {
    expect(can(null, "settings.readPublic")).toBe(true);
    expect(can(null, "packages.read")).toBe(true);
    expect(can(null, "clients.createLead")).toBe(true);
    const allowed = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(null, p));
    expect(allowed.sort()).toEqual(["clients.createLead", "packages.read", "settings.readPublic"]);
  });

  it("assertCan throws ForbiddenError", () => {
    expect(() => assertCan(actor(["kitchen"]), "payments.confirm")).toThrow(ForbiddenError);
    expect(() => assertCan(null, "clients.read")).toThrow(ForbiddenError);
    expect(() => assertCan(actor(["operations"]), "payments.confirm")).not.toThrow();
  });

  it("gives a multi-role user the union (Nebiyou: operations + delivery)", () => {
    const neb = actor(["operations", "delivery"]);
    expect(can(neb, "payments.confirm")).toBe(true);
    expect(can(neb, "delivery.update")).toBe(true);
    expect(can(neb, "clients.readDeliveryContact")).toBe(true);
    expect(can(neb, "discounts.apply")).toBe(false);
    expect(can(neb, "nutrition.write")).toBe(false);
    const dagi = actor(["owner", "coach"]);
    expect(can(dagi, "community.coach")).toBe(true);
    expect(can(dagi, "discounts.apply")).toBe(true);
    expect(can(dagi, "orders.lock")).toBe(false);
  });

  it("isStaff and homePathFor", () => {
    expect(isStaff(actor(["client"]))).toBe(false);
    expect(isStaff(null)).toBe(false);
    expect(isStaff(actor(["kitchen"]))).toBe(true);
    expect(homePathFor(["owner", "coach"])).toBe("/staff/dashboard");
    expect(homePathFor(["operations", "delivery"])).toBe("/staff");
    expect(homePathFor(["nutritionist"])).toBe("/staff");
    expect(homePathFor(["kitchen"])).toBe("/kitchen");
    expect(homePathFor(["delivery"])).toBe("/delivery");
    expect(homePathFor(["client"])).toBe("/app");
    expect(homePathFor([])).toBe("/login");
  });

  it("riders update only today's drops assigned to them or unassigned", () => {
    const rider = actor(["delivery"], { userId: "rider-1" });
    expect(canUpdateDrop(rider, { riderUserId: "rider-1", dropDate: "2026-10-19" }, "2026-10-19")).toBe(true);
    expect(canUpdateDrop(rider, { riderUserId: null, dropDate: "2026-10-19" }, "2026-10-19")).toBe(true);
    expect(canUpdateDrop(rider, { riderUserId: "rider-2", dropDate: "2026-10-19" }, "2026-10-19")).toBe(false);
    expect(canUpdateDrop(rider, { riderUserId: "rider-1", dropDate: "2026-10-18" }, "2026-10-19")).toBe(false);
    expect(canUpdateDrop(actor(["operations"]), { riderUserId: "rider-2", dropDate: "2026-10-18" }, "2026-10-19")).toBe(true);
    expect(canUpdateDrop(actor(["kitchen"]), { riderUserId: null, dropDate: "2026-10-19" }, "2026-10-19")).toBe(false);
  });
});

describe("client scope", () => {
  it("loads actors from the database and limits clients to their own record", async () => {
    const [abelUser] = await db.select().from(s.user).where(eq(s.user.phoneNumber, "+251911000001"));
    const [saraUser] = await db.select().from(s.user).where(eq(s.user.phoneNumber, "+251911000002"));
    const abel = (await loadActor(db, abelUser.id))!;
    const sara = (await loadActor(db, saraUser.id))!;
    expect(abel.roles).toEqual(["client"]);
    expect(abel.clientId).toBeTruthy();
    expect(abel.name).toBe("Abel Tesfaye");

    expect(() => assertClientAccess(abel, abel.clientId!)).not.toThrow();
    expect(() => assertClientAccess(abel, sara.clientId!)).toThrow(ForbiddenError);
    expect(() => assertClientAccess(null, abel.clientId!)).toThrow(ForbiddenError);
    expect(() => assertCanForClient(abel, abel.clientId!, "invoices.read", "invoices.readOwn")).not.toThrow();
    expect(() => assertCanForClient(abel, sara.clientId!, "invoices.read", "invoices.readOwn")).toThrow(ForbiddenError);

    const [nebUser] = await db.select().from(s.user).where(eq(s.user.email, "nebiyou@questmeals.demo"));
    const neb = (await loadActor(db, nebUser.id))!;
    expect(neb.roles.sort()).toEqual(["delivery", "operations"]);
    expect(neb.clientId).toBeNull();
    expect(() => assertClientAccess(neb, sara.clientId!)).not.toThrow();
    expect(() => assertCanForClient(neb, sara.clientId!, "invoices.read", "invoices.readOwn")).not.toThrow();

    const [kitchenUser] = await db.select().from(s.user).where(eq(s.user.email, "kitchen@questmeals.demo"));
    const kitchen = (await loadActor(db, kitchenUser.id))!;
    expect(() => assertClientAccess(kitchen, sara.clientId!)).toThrow(ForbiddenError);
  });

  it("returns null for unknown or banned users", async () => {
    expect(await loadActor(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
