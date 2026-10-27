// Resets and seeds questmeals_e2e (demo, today = Mon 19 Oct 2026), sets every ingredient price so plan
// prices exist, runs the Thursday lock of 15 Oct for the current week (orders, meals and drops for today),
// and saves one signed-in storage state per role under e2e/.auth/.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { and, eq, sql as dsql } from "drizzle-orm";
import { createDb } from "../db/client";
import { dropSchemas, runMigrations } from "../db/migrate";
import { seedAll } from "../db/seed";
import * as s from "../db/schema";
import { runJob } from "../src/server/jobs";
import { loadActor } from "../src/server/authz";
import { uploadReceipt } from "../src/server/services/client-app";
import { createLead } from "../src/server/services/clients";
import { makePng } from "./png";
import { AUTH_DIR, E2E_DB_URL, LOGINS, testIp, type RoleKey } from "./env";

export default async function globalSetup(config: FullConfig) {
  const url = E2E_DB_URL;
  // E2E_REUSE_DB=1 keeps the current database (only for iterating on one spec locally).
  if (!process.env.E2E_REUSE_DB) await resetAndSeed(url);
  await saveLogins(config);
}

/** Creates the e2e database on first use (scripts/db-start.sh only creates questmeals and questmeals_test). */
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

async function resetAndSeed(url: string) {
  await ensureDatabase(url);
  await dropSchemas(url);
  await runMigrations(url);
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_DIR = ".data/storage-e2e";
  rmSync(path.resolve(".data/storage-e2e"), { recursive: true, force: true });
  const { db, sql } = createDb(url, { max: 1 });
  try {
    await seedAll(db, { demo: true, today: "2026-10-19" });
    await db.update(s.ingredients).set({ costPerUnitBirr: dsql`case when ${s.ingredients.purchaseUnit} = 'piece' then 15 else 400 end` });
    await runJob(db, "thursday-lock", new Date("2026-10-15T15:00:05Z"));
    // drops for today (Tue 20 Oct) as the 06:00 morning job would have created them
    await runJob(db, "daily-morning", new Date("2026-10-20T03:00:00Z"));
    // Receipts waiting in the ops queue for the week of 26 Oct, uploaded Monday evening: Sara and Samuel are confirmed
    // (phone / laptop run), Hiwot and Mikias rejected with a reason (phone / laptop run).
    const png = new File([new Uint8Array(makePng(120, 160))], "receipt.png", { type: "image/png" });
    for (const [phone, method, ref] of [
      ["+251911000002", "telebirr", "TB-E2E-SARA"], ["+251911000009", "cbe", "FT-E2E-SAMUEL"],
      ["+251911000008", "telebirr", "TB-E2E-HIWOT"], ["+251911000005", "cbe", "FT-E2E-MIKIAS"],
    ] as const) {
      const [c] = await db.select().from(s.clients).where(eq(s.clients.phone, phone));
      const [inv] = await db.select().from(s.invoices).where(and(eq(s.invoices.clientId, c.id), eq(s.invoices.periodStart, "2026-10-26"), eq(s.invoices.status, "issued")));
      if (!inv) throw new Error(`no issued invoice for ${phone} for the week of 26 Oct`);
      const actor = await loadActor(db, c.userId!);
      await uploadReceipt({ db, actor, now: new Date("2026-10-19T16:00:00Z") }, { invoiceId: inv.id, method, reference: ref, receipt: png });
    }
    // One lead per project for the onboarding wizard.
    const [ops] = await db.select().from(s.user).where(eq(s.user.email, "nebiyou@questmeals.demo"));
    const opsActor = await loadActor(db, ops.id);
    for (const [last, phone] of [["Phone", "0911500001"], ["Laptop", "0911500002"]]) {
      await createLead({ db, actor: opsActor, now: new Date("2026-10-20T06:00:00Z") }, { firstName: "Onboard", lastName: last, phone, source: "walk_in" });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function saveLogins(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3100";
  mkdirSync(AUTH_DIR, { recursive: true });
  for (const key of Object.keys(LOGINS) as RoleKey[]) {
    const ctx = await request.newContext({ baseURL });
    const { who, password } = LOGINS[key];
    const isPhone = !who.includes("@");
    const res = await ctx.post(`/api/auth/sign-in/${isPhone ? "phone-number" : "email"}`, {
      data: isPhone ? { phoneNumber: "+251" + who.slice(1), password } : { email: who, password },
      headers: { origin: baseURL, "x-forwarded-for": testIp() },
    });
    if (!res.ok()) throw new Error(`sign-in for ${key} failed: ${res.status()} ${await res.text()}`);
    await ctx.storageState({ path: path.join(AUTH_DIR, `${key}.json`) });
    await ctx.dispose();
  }
}
