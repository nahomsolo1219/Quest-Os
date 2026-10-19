// Applies drizzle migrations to DATABASE_URL (or DATABASE_URL_TEST with --test).
import "./env";
import { runMigrations } from "../db/migrate";

async function main() {
  const url = process.argv.includes("--test") ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await runMigrations(url);
  console.log("Migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
