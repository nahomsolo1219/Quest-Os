import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import * as s from "../schema";
import { createAuth, createClientUser, createStaffUser, setUserPassword } from "../../src/server/auth";
import { DEMO_CLIENT_PASSWORD, DEMO_STAFF_PASSWORD } from "../seed";
import { testDb } from "./helpers";

const { db, sql } = testDb();
const auth = createAuth(db);
const created: string[] = [];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

afterAll(async () => {
  if (created.length) await db.delete(s.user).where(inArray(s.user.id, created));
  await sql.end({ timeout: 5 });
});

describe("Better Auth", () => {
  it("signs in a staff user with email and password", async () => {
    const u = await createStaffUser(db, { name: "Test Ops", email: "Ops.Test@questmeals.test", password: "OpsPass123!", roles: ["operations"] }, auth);
    created.push(u.id);
    expect(u.id).toMatch(UUID);
    expect(u.email).toBe("ops.test@questmeals.test");
    const res = await auth.api.signInEmail({ body: { email: "ops.test@questmeals.test", password: "OpsPass123!" } });
    expect(res.token).toBeTruthy();
    expect(res.user.id).toBe(u.id);
    const [sess] = await db.select().from(s.session).where(eq(s.session.token, res.token));
    expect(sess.userId).toBe(u.id);
    expect(sess.id).toMatch(UUID);
  });

  it("returns the session (with roles) from the cookie", async () => {
    const { headers } = await auth.api.signInEmail({
      body: { email: "ops.test@questmeals.test", password: "OpsPass123!" },
      returnHeaders: true,
    });
    const setCookie = headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(/,(?=\s*[\w.-]+=)/).map((c) => c.split(";")[0].trim()).join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe("ops.test@questmeals.test");
    expect((session?.user as { roles?: string[] }).roles).toEqual(["operations"]);
  });

  it("signs in a client with phone number and password", async () => {
    const u = await createClientUser(db, { name: "Test Client", phone: "+251922000001", password: "ClientPass1" }, auth);
    created.push(u.id);
    expect(u.email).toBe("251922000001@clients.questmeals.invalid");
    const res = await auth.api.signInPhoneNumber({ body: { phoneNumber: "+251922000001", password: "ClientPass1" } });
    expect(res.token).toBeTruthy();
    expect(res.user.id).toBe(u.id);
    const [row] = await db.select().from(s.user).where(eq(s.user.id, u.id));
    expect(row.roles).toEqual(["client"]);
  });

  it("rejects wrong passwords and invalid phone numbers", async () => {
    await expect(auth.api.signInEmail({ body: { email: "ops.test@questmeals.test", password: "wrong-password" } })).rejects.toThrow();
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: "+251922000001", password: "wrong-password" } })).rejects.toThrow();
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: "0922000001", password: "ClientPass1" } })).rejects.toThrow();
    await expect(createClientUser(db, { name: "X", phone: "+15551234567", password: "Whatever123" }, auth)).rejects.toThrow();
  });

  it("setUserPassword changes the password with Better Auth's hasher", async () => {
    const [u] = await db.select().from(s.user).where(eq(s.user.phoneNumber, "+251922000001"));
    await setUserPassword(db, u.id, "NewClientPass2", auth);
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: "+251922000001", password: "ClientPass1" } })).rejects.toThrow();
    const res = await auth.api.signInPhoneNumber({ body: { phoneNumber: "+251922000001", password: "NewClientPass2" } });
    expect(res.user.id).toBe(u.id);
    const [acct] = await db.select().from(s.account).where(eq(s.account.userId, u.id));
    expect(acct.password).not.toContain("NewClientPass2");
  });

  it("signs in the seeded demo users", async () => {
    const staff = await auth.api.signInEmail({ body: { email: "dagi@questmeals.demo", password: DEMO_STAFF_PASSWORD } });
    expect(staff.user.email).toBe("dagi@questmeals.demo");
    const client = await auth.api.signInPhoneNumber({ body: { phoneNumber: "+251911000001", password: DEMO_CLIENT_PASSWORD } });
    expect(client.user.name).toBe("Abel Tesfaye");
    // demo sessions are removed again so later tests see a clean session table
    await db.delete(s.session).where(inArray(s.session.userId, [staff.user.id, client.user.id]));
  });
});
