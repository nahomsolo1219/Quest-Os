// Resets the test database once per `npm run test:db`: drop schemas, migrate, seed reference + demo (fixed today).
import { createDb } from "../client";
import { dropSchemas, runMigrations } from "../migrate";
import { seedAll } from "../seed";
import { TEST_TODAY, testUrl } from "./helpers";

export default async function setup() {
  const url = testUrl();
  await dropSchemas(url);
  await runMigrations(url);
  const { db, sql } = createDb(url, { max: 1 });
  try {
    await seedAll(db, { demo: true, today: TEST_TODAY });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
