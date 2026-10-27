// npm run db:reset [-- --test] [--no-demo] [--today=YYYY-MM-DD] [--tour-data]
// Tour data (demo copy) is added when DEMO_MODE=true or --tour-data is given.
// Drops and recreates the public and drizzle schemas, applies migrations, seeds reference data (+ demo).
import "./env";
import { createDb } from "../db/client";
import { dropSchemas, runMigrations } from "../db/migrate";
import { seedAll } from "../db/seed";

async function main() {
  const args = process.argv.slice(2);
  const test = args.includes("--test");
  const url = test ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error(`${test ? "DATABASE_URL_TEST" : "DATABASE_URL"} is not set`);
  const today = args.find((a) => a.startsWith("--today="))?.slice("--today=".length);
  await dropSchemas(url);
  await runMigrations(url);
  const { db, sql } = createDb(url, { max: 1 });
  try {
    const tourData = process.env.DEMO_MODE === "true" || args.includes("--tour-data");
    const result = await seedAll(db, { demo: !args.includes("--no-demo"), today, tourData });
    console.log(`Reset ${new URL(url).pathname.slice(1)}: migrated, reference seeded, portions ${result.portions.inserted}` +
      (result.demo ? `, demo ${JSON.stringify(result.demo)}` : ", no demo") +
      (result.tour ? `, tour ${JSON.stringify(result.tour)}` : ""));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
