// CLI: npm run db:remove-demo [-- --test] — deletes all demo data in one transaction; reference data stays.
import "../../scripts/env";
import { createDb } from "../client";
import { removeDemo } from "./demo";

async function main() {
  const url = process.argv.includes("--test") ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, sql } = createDb(url, { max: 1 });
  try {
    const counts = await removeDemo(db);
    console.log("Removed demo rows:");
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(22)} ${n}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
