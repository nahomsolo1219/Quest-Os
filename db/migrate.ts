// Applies the drizzle migrations in db/migrations. Used by scripts/migrate.ts, scripts/db-reset.ts and db tests.
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** resolved from the repository root (npm scripts, Next.js and Vitest all run there) */
export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "db/migrations");

export async function runMigrations(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Drops and recreates the `public` and `drizzle` schemas (all tables, enums and migration history). */
export async function dropSchemas(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
