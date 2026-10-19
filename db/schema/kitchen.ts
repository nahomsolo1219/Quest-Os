// Purchases, stock counts, waste (PLAN.md section 3, kitchen).
import { date, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, isDemo, timestamps } from "./_common";
import { user } from "./auth";
import { ingredients } from "./menu";

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "restrict" }),
    /** grams or pieces */
    qty: integer("qty").notNull(),
    totalPriceBirr: integer("total_price_birr").notNull(),
    supplier: text("supplier"),
    purchasedOn: date("purchased_on", { mode: "string" }).notNull(),
    byUserId: uuid("by_user_id").references(() => user.id, { onDelete: "set null" }),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [index("purchases_ingredient_date_idx").on(t.ingredientId, t.purchasedOn), index("purchases_date_idx").on(t.purchasedOn)],
);

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: id(),
    ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "restrict" }),
    countDate: date("count_date", { mode: "string" }).notNull(),
    qty: integer("qty").notNull(),
    byUserId: uuid("by_user_id").references(() => user.id, { onDelete: "set null" }),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [unique("stock_counts_ingredient_date_uq").on(t.ingredientId, t.countDate)],
);

export const wasteLog = pgTable(
  "waste_log",
  {
    id: id(),
    ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull(),
    reason: text("reason"),
    loggedOn: date("logged_on", { mode: "string" }).notNull(),
    byUserId: uuid("by_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("waste_log_ingredient_date_idx").on(t.ingredientId, t.loggedOn)],
);
