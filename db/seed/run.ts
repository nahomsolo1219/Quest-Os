// CLI: npm run db:seed [-- --no-demo] [--today=YYYY-MM-DD] [--test] [--tour-data]
// Tour data (demo copy) is added when DEMO_MODE=true or --tour-data is given, and only on a freshly seeded demo.
import "../../scripts/env";
import { createDb } from "../client";
import { seedAll } from "./index";

async function main() {
  const args = process.argv.slice(2);
  const url = args.includes("--test") ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const today = args.find((a) => a.startsWith("--today="))?.slice("--today=".length);
  const tourData = process.env.DEMO_MODE === "true" || args.includes("--tour-data");
  const { db, sql } = createDb(url, { max: 1 });
  try {
    const result = await seedAll(db, { demo: !args.includes("--no-demo"), today, tourData });
    console.log("Reference data seeded; profile portions inserted:", result.portions.inserted);
    if (result.demo?.skipped) console.log("Demo data already present, skipped");
    else if (result.demo) console.log("Demo data:", result.demo);
    if (result.tour) console.log("Tour data:", JSON.stringify(result.tour));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
