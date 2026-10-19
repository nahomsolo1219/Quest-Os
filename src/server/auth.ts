// Better Auth: staff sign in with email + password, clients with phone + password (no SMS, DECISIONS D011).
// Runs inside Next.js (route handler, server components) and outside it (seed scripts, tests): no next/* imports here;
// the nextCookies plugin loads next/headers lazily and does nothing outside a request.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { db as sharedDb, type Db, type DbOrTx } from "../../db/client";
import * as schema from "../../db/schema";
import type { Role } from "../domain/types";

/** Ethiopian mobile numbers in E.164 (+2519XXXXXXXX or +2517XXXXXXXX) */
export const ETHIOPIAN_PHONE_RE = /^\+251[79]\d{8}$/;
export const CLIENT_EMAIL_DOMAIN = "clients.questmeals.invalid";

export function createAuth(db: Db) {
  return betterAuth({
    appName: "Quest Meals",
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-32-characters-min",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: false },
    user: {
      additionalFields: {
        roles: { type: "string[]", required: false, input: false, defaultValue: [] },
        isDemo: { type: "boolean", required: false, input: false, defaultValue: false },
        banned: { type: "boolean", required: false, input: false, defaultValue: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    advanced: { database: { generateId: "uuid" } },
    plugins: [
      phoneNumber({
        requireVerification: false,
        phoneNumberValidator: (p) => ETHIOPIAN_PHONE_RE.test(p),
        // No SMS in phase 1: OTP flows are not used. Kept as a no-op so the plugin is satisfied.
        sendOTP: () => {},
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __qmAuth?: Auth };
/** The app's Better Auth instance bound to the shared database, created on first use. */
export function getAuth(): Auth {
  return (globalForAuth.__qmAuth ??= createAuth(sharedDb));
}
export const auth: Auth = new Proxy({} as Auth, {
  get(_t, prop) {
    return (getAuth() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ---------------------------------------------------------------------------------------------
// Admin helpers (seed, tests, staff screens). They write the same rows Better Auth writes on
// sign-up (user + credential account) and hash with Better Auth's own hasher.

const authByDb = new WeakMap<object, Auth>();
function authFor(db: DbOrTx, given?: Auth): Auth {
  if (given) return given;
  let a = authByDb.get(db);
  if (!a) {
    a = createAuth(db as Db);
    authByDb.set(db, a);
  }
  return a;
}

export async function hashPassword(db: DbOrTx, password: string, a?: Auth): Promise<string> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const ctx = await authFor(db, a).$context;
  return ctx.password.hash(password);
}

/** `+251911000001` -> `251911000001@clients.questmeals.invalid` */
export function syntheticClientEmail(phone: string): string {
  return `${phone.replace(/\D/g, "")}@${CLIENT_EMAIL_DOMAIN}`;
}

type CreatedUser = { id: string; email: string };

async function insertUserWithPassword(
  db: DbOrTx,
  values: typeof schema.user.$inferInsert,
  password: string,
  a?: Auth,
): Promise<CreatedUser> {
  const hash = await hashPassword(db, password, a);
  const [u] = await db.insert(schema.user).values(values).returning({ id: schema.user.id, email: schema.user.email });
  await db.insert(schema.account).values({ userId: u.id, accountId: u.id, providerId: "credential", password: hash });
  return u;
}

export async function createStaffUser(
  db: DbOrTx,
  input: { name: string; email: string; password: string; roles: Role[]; isDemo?: boolean },
  a?: Auth,
): Promise<CreatedUser> {
  if (input.roles.length === 0 || input.roles.includes("client")) throw new Error("Staff users need staff roles");
  return insertUserWithPassword(
    db,
    {
      name: input.name,
      email: input.email.trim().toLowerCase(),
      emailVerified: true,
      roles: input.roles,
      isDemo: input.isDemo ?? false,
    },
    input.password,
    a,
  );
}

export async function createClientUser(
  db: DbOrTx,
  input: { name: string; phone: string; password: string; isDemo?: boolean },
  a?: Auth,
): Promise<CreatedUser> {
  if (!ETHIOPIAN_PHONE_RE.test(input.phone)) throw new Error(`Invalid Ethiopian phone number: ${input.phone}`);
  return insertUserWithPassword(
    db,
    {
      name: input.name,
      email: syntheticClientEmail(input.phone),
      emailVerified: false,
      phoneNumber: input.phone,
      phoneNumberVerified: false,
      roles: ["client"],
      isDemo: input.isDemo ?? false,
    },
    input.password,
    a,
  );
}

/** Sets (or creates) the credential password of a user. Existing sessions are kept. */
export async function setUserPassword(db: DbOrTx, userId: string, newPassword: string, a?: Auth): Promise<void> {
  const hash = await hashPassword(db, newPassword, a);
  const updated = await db
    .update(schema.account)
    .set({ password: hash })
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")))
    .returning({ id: schema.account.id });
  if (updated.length === 0) {
    await db.insert(schema.account).values({ userId, accountId: userId, providerId: "credential", password: hash });
  }
}
