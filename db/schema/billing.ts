// Packages, subscriptions, pauses, invoices, payments, credits (PLAN.md section 3, Plans, billing).
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, isDemo, timestamps, tstz } from "./_common";
import { user } from "./auth";
import { clients } from "./core";
import {
  billingPeriodEnum, deliveryOptionEnum, goalEnum, invoiceKindEnum, invoiceStatusEnum, packageCodeEnum,
  paymentMethodEnum, paymentStatusEnum, subscriptionStatusEnum,
} from "./enums";

export const packages = pgTable("packages", {
  id: id(),
  code: packageCodeEnum("code").notNull().unique(),
  name: text("name").notNull(),
  swapLimit: integer("swap_limit").notNull(),
  checkinIntervalDays: integer("checkin_interval_days").notNull(),
  coaching: text("coaching").notNull().default(""),
  deliveryOptions: deliveryOptionEnum("delivery_options").array().notNull(),
  serviceFeeMonthBirr: integer("service_fee_month_birr").notNull().default(0),
  prioritySlot: boolean("priority_slot").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    packageId: uuid("package_id").notNull().references(() => packages.id, { onDelete: "restrict" }),
    goal: goalEnum("goal").notNull(),
    deliveryOption: deliveryOptionEnum("delivery_option").notNull(),
    billingPeriod: billingPeriodEnum("billing_period").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    termMonths: integer("term_months").notNull().default(1),
    priceDayBirr: integer("price_day_birr").notNull(),
    priceMonthBirr: integer("price_month_birr").notNull(),
    planPriceBirr: integer("plan_price_birr").notNull(),
    /** the full domain pricing result */
    priceBreakdown: jsonb("price_breakdown"),
    priceLockedUntil: date("price_locked_until", { mode: "string" }).notNull(),
    discountMonthBirr: integer("discount_month_birr").notNull().default(0),
    discountReason: text("discount_reason"),
    discountByUserId: uuid("discount_by_user_id").references(() => user.id, { onDelete: "set null" }),
    status: subscriptionStatusEnum("status").notNull().default("pending_payment"),
    isQuickStart: boolean("is_quick_start").notNull().default(false),
    quickStartPeriodEnd: date("quick_start_period_end", { mode: "string" }),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [
    index("subscriptions_client_idx").on(t.clientId),
    index("subscriptions_status_idx").on(t.status),
    check("subscriptions_term_chk", sql`${t.termMonths} between 1 and 4`),
  ],
);

export const pauses = pgTable(
  "pauses",
  {
    id: id(),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** Monday */
    startWeek: date("start_week", { mode: "string" }).notNull(),
    weeks: integer("weeks").notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("pauses_client_idx").on(t.clientId, t.startWeek),
    index("pauses_subscription_idx").on(t.subscriptionId),
    check("pauses_weeks_chk", sql`${t.weeks} > 0`),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    kind: invoiceKindEnum("kind").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    /** inclusive */
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    serviceDays: integer("service_days").notNull(),
    amountBirr: integer("amount_birr").notNull(),
    status: invoiceStatusEnum("status").notNull().default("issued"),
    dueAt: tstz("due_at").notNull(),
    creditAppliedBirr: integer("credit_applied_birr").notNull().default(0),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [
    unique("invoices_subscription_kind_period_uq").on(t.subscriptionId, t.kind, t.periodStart),
    index("invoices_client_idx").on(t.clientId, t.periodStart),
    index("invoices_status_idx").on(t.status),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    amountBirr: integer("amount_birr").notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference"),
    receiptKey: text("receipt_key"),
    status: paymentStatusEnum("status").notNull().default("submitted"),
    submittedAt: tstz("submitted_at").notNull().defaultNow(),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => user.id, { onDelete: "set null" }),
    confirmedAt: tstz("confirmed_at"),
    rejectionReason: text("rejection_reason"),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_client_idx").on(t.clientId),
    index("payments_status_idx").on(t.status),
    // at most one receipt waiting for confirmation per invoice (double taps / double submits on 3G)
    uniqueIndex("payments_one_submitted_per_invoice_uq").on(t.invoiceId).where(sql`${t.status} = 'submitted'`),
  ],
);

export const accountCredits = pgTable(
  "account_credits",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** positive = the client is owed */
    amountBirr: integer("amount_birr").notNull(),
    reason: text("reason").notNull(),
    appliedInvoiceId: uuid("applied_invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("account_credits_client_idx").on(t.clientId)],
);
