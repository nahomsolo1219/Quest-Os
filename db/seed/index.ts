// Seed entry points shared by the CLI scripts and the db tests.
import { sql as dsql } from "drizzle-orm";
import { createDb, type DbOrTx } from "../client";
import { runMigrations } from "../migrate";
import { addisInstant, addisToday } from "./dates";
import { seedDemo } from "./demo";
import { seedPortions } from "./portions";
import { seedReference } from "./reference";
import { seedTourData } from "./tour-data";

export { seedDemo, removeDemo, DEMO_STAFF, DEMO_CLIENTS, DEMO_STAFF_PASSWORD, DEMO_CLIENT_PASSWORD, demoPhone } from "./demo";
export { seedTourData, DEMO_COACH, DEMO_TRY_ROLES, type DemoTryRole, type TourSummary } from "./tour-data";
export { seedPortions } from "./portions";
export { seedReference } from "./reference";
export { addisToday } from "./dates";

/**
 * The instant the tour data is "as of": the real time when `today` is today in Addis, otherwise 09:00 Addis on `today`
 * (fixed dates in tests and `--today=` runs).
 */
export function tourNow(today: string, realNow: Date = new Date()): Date {
  return today === addisToday(realNow) ? realNow : addisInstant(today, "09:00");
}

export async function seedAll(db: DbOrTx, opts: { demo?: boolean; today?: string; tourData?: boolean; now?: Date } = {}) {
  await seedReference(db);
  const portions = await seedPortions(db);
  const today = opts.today ?? addisToday();
  const demo = opts.demo === false ? null : await seedDemo(db, { today });
  // tour data only on top of a demo seeded just now (it is not idempotent)
  const tour = opts.tourData && demo && !demo.skipped ? await seedTourData(db, { today, now: opts.now ?? tourNow(today) }) : null;
  return { portions, demo, tour };
}

/**
 * Nightly demo reset (POST /api/jobs/demo-reset): applies any pending migrations, then in ONE transaction empties every
 * table in `public` (TRUNCATE … CASCADE; the schema, enum types and migration history stay) and reseeds reference,
 * demo and tour data for today. Unlike `npm run db:reset` it never drops the schema, so the app's open pool keeps
 * valid prepared statements and enum type OIDs, and other sessions see either the old data or the new (they wait on
 * the table locks while it runs). Tour progress and sessions are emptied too, so everyone starts fresh.
 */
export async function resetDemoDatabase(url: string, opts: { today?: string; now?: Date } = {}) {
  await runMigrations(url);
  const { db, sql } = createDb(url, { max: 1 });
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx.execute<{ name: string }>(dsql`select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`);
      const names = [...rows].map((r) => `public.${r.name}`);
      if (names.length) await tx.execute(dsql.raw(`truncate table ${names.join(", ")} restart identity cascade`));
      return seedAll(tx, { demo: true, tourData: true, today: opts.today, now: opts.now });
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
