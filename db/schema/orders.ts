// Weekly orders, order days and meals (PLAN.md section 3, Orders).
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, isDemo, timestamps, tstz } from "./_common";
import { subscriptions } from "./billing";
import { clients } from "./core";
import { deliveryOptionEnum, menuCodeEnum, orderStatusEnum, profileEnum, slotEnum } from "./enums";
import { meals } from "./menu";

export type OrderMealItem = {
  partId: string;
  partName: string;
  category: string;
  unit: "g" | "piece";
  qty: number;
  ingredients: { ingredientId: string; name: string; qty: number }[];
  baseQty?: number;
  source?: { kind: "swap" | "addon"; code: string };
};

export const weeklyOrders = pgTable(
  "weekly_orders",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    profile: profileEnum("profile").notNull(),
    status: orderStatusEnum("status").notNull(),
    isQuickStart: boolean("is_quick_start").notNull().default(false),
    lockedAt: tstz("locked_at").notNull().defaultNow(),
    deliveryOption: deliveryOptionEnum("delivery_option").notNull(),
    skipReason: text("skip_reason"),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [unique("weekly_orders_client_week_uq").on(t.clientId, t.weekStart), index("weekly_orders_week_idx").on(t.weekStart)],
);

export const orderDays = pgTable(
  "order_days",
  {
    id: id(),
    weeklyOrderId: uuid("weekly_order_id").notNull().references(() => weeklyOrders.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** the menu day eaten */
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    cookDate: date("cook_date", { mode: "string" }).notNull(),
    dropDate: date("drop_date", { mode: "string" }).notNull(),
    menu: menuCodeEnum("menu").notNull(),
    isQuickStart: boolean("is_quick_start").notNull().default(false),
    /** the delivery option of the plan that ordered this day (a returning client's quick start can share a week row
     * with their previous plan); null on rows from before this column = the weekly order's option */
    deliveryOption: deliveryOptionEnum("delivery_option"),
    ...timestamps(),
  },
  (t) => [
    unique("order_days_client_service_date_uq").on(t.clientId, t.serviceDate),
    index("order_days_cook_date_idx").on(t.cookDate),
    index("order_days_drop_date_idx").on(t.dropDate),
    index("order_days_weekly_order_idx").on(t.weeklyOrderId),
  ],
);

export const orderMeals = pgTable(
  "order_meals",
  {
    id: id(),
    orderDayId: uuid("order_day_id").notNull().references(() => orderDays.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    mealId: uuid("meal_id").notNull().references(() => meals.id, { onDelete: "restrict" }),
    slot: slotEnum("slot").notNull(),
    profile: profileEnum("profile").notNull(),
    items: jsonb("items").$type<OrderMealItem[]>().notNull(),
    kcal: integer("kcal").notNull(),
    proteinG: integer("protein_g").notNull(),
    carbG: integer("carb_g").notNull(),
    fatG: integer("fat_g").notNull(),
    /** allergy/dislike conflicts left after swaps */
    conflicts: text("conflicts").array().notNull().default(sql`'{}'::text[]`),
    cookDate: date("cook_date", { mode: "string" }).notNull(),
    eatBy: date("eat_by", { mode: "string" }).notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("order_meals_day_slot_uq").on(t.orderDayId, t.slot),
    index("order_meals_cook_date_idx").on(t.cookDate),
    index("order_meals_client_idx").on(t.clientId),
  ],
);
