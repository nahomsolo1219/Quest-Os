// Delivery drops (PLAN.md section 3, Delivery).
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tstz } from "./_common";
import { user } from "./auth";
import { areas, clients } from "./core";
import { dropStatusEnum } from "./enums";

export const deliveryDrops = pgTable(
  "delivery_drops",
  {
    id: id(),
    dropDate: date("drop_date", { mode: "string" }).notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** null = all meals; 'breakfast' | 'lunch' | 'dinner_snack' for three drops */
    slot: text("slot"),
    kind: text("kind").notNull(),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    addressSnapshot: text("address_snapshot"),
    phoneSnapshot: text("phone_snapshot"),
    riderUserId: uuid("rider_user_id").references(() => user.id, { onDelete: "set null" }),
    routePosition: integer("route_position").notNull().default(0),
    status: dropStatusEnum("status").notNull().default("pending"),
    failedReason: text("failed_reason"),
    deliveredAt: tstz("delivered_at"),
    serviceDates: date("service_dates", { mode: "string" }).array().notNull().default(sql`'{}'::date[]`),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("delivery_drops_client_date_slot_uq").on(t.clientId, t.dropDate, sql`coalesce(${t.slot}, 'all')`),
    index("delivery_drops_date_idx").on(t.dropDate, t.routePosition),
    index("delivery_drops_rider_idx").on(t.riderUserId, t.dropDate),
    check("delivery_drops_kind_chk", sql`${t.kind} in ('delivery', 'pickup')`),
    check("delivery_drops_slot_chk", sql`${t.slot} is null or ${t.slot} in ('breakfast', 'lunch', 'dinner_snack')`),
  ],
);
