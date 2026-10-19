// Database client: drizzle over postgres.js with the full schema attached.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;

export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, { max: opts.max ?? 10, onnotice: () => {}, prepare: true });
  const db = drizzle(sql, { schema, casing: undefined });
  return { db, sql };
}

export type Db = ReturnType<typeof createDb>["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Cached = { db: Db; sql: postgres.Sql };
const globalForDb = globalThis as unknown as { __qmDb?: Cached };

function shared(): Cached {
  if (globalForDb.__qmDb) return globalForDb.__qmDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const created = createDb(url, { max: 10 });
  // Cache on globalThis in every environment: survives Next.js dev HMR, one pool per process in production.
  globalForDb.__qmDb = created;
  return created;
}

/** Shared app database (DATABASE_URL, max 10 connections), created on first use. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = shared().db as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

/** Close the shared pool (scripts). */
export async function closeSharedDb() {
  if (globalForDb.__qmDb) {
    await globalForDb.__qmDb.sql.end({ timeout: 5 });
    globalForDb.__qmDb = undefined;
  }
}

export { schema };
