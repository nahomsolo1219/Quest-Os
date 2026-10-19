// Shared helpers for database tests (real Postgres at DATABASE_URL_TEST).
import { existsSync } from "node:fs";
import { createDb } from "../client";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

export const TEST_TODAY = "2026-10-19";

export function testUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  return url;
}

export function testDb() {
  return createDb(testUrl(), { max: 3 });
}

/** Runs fn in a transaction that is always rolled back. */
export async function inRollback<T>(db: ReturnType<typeof testDb>["db"], fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  let result: T | undefined;
  const ROLLBACK = new Error("rollback");
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return result as T;
}
