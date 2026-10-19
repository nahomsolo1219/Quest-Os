// Shared column helpers for every table (PLAN.md section 3).
import { boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

export const isDemo = () => boolean("is_demo").notNull().default(false);

/** timestamptz column helper (UTC instants) */
export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
