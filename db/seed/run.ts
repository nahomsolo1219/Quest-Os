// CLI: npm run db:seed [-- --no-demo] [--today=YYYY-MM-DD] [--test]
import "../../scripts/env";
import { createDb } from "../client";
import { seedAll } from "./index";

async function main() {
  const args = process.argv.slice(2);
  const url = args.includes("--test") ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const today = args.find((a) => a.startsWith("--today="))?.slice("--today=".length);
  const { db, sql } = createDb(url, { max: 1 });
  try {
    const result = await seedAll(db, { demo: !args.includes("--no-demo"), today });
    console.log("Reference data seeded; profile portions inserted:", result.portions.inserted);
    if (result.demo?.skipped) console.log("Demo data already present, skipped");
    else if (result.demo) console.log("Demo data:", result.demo);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
