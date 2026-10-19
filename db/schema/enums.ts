// Postgres enums. Values come from the shared const arrays in src/domain/types.ts.
import { pgEnum } from "drizzle-orm/pg-core";
import {
  ACTIVITIES, BILLING_PERIODS, CLIENT_STATUSES, CONTRIBUTION_TYPES, DELIVERY_OPTIONS, DROP_STATUSES, FOOD_GROUPS,
  GOALS, INVOICE_KINDS, INVOICE_STATUSES, LEAD_SOURCES, MENU_CODES, ORDER_STATUSES, PACKAGE_CODES, PART_CATEGORIES,
  PAYMENT_METHODS, PAYMENT_STATUSES, POST_TYPES, PROFILES, PURCHASE_UNITS, REACTIONS, REPORT_STATUSES, ROLES, SEXES,
  SIZES, SLOTS, SUBSCRIPTION_STATUSES, SWAP_STATUSES,
} from "../../src/domain/types";

export const roleEnum = pgEnum("role", ROLES);
export const clientStatusEnum = pgEnum("client_status", CLIENT_STATUSES);
export const leadSourceEnum = pgEnum("lead_source", LEAD_SOURCES);
export const sexEnum = pgEnum("sex", SEXES);
export const activityEnum = pgEnum("activity", ACTIVITIES);
export const goalEnum = pgEnum("goal", GOALS);
export const sizeEnum = pgEnum("size", SIZES);
export const profileEnum = pgEnum("profile", PROFILES);
export const foodGroupEnum = pgEnum("food_group", FOOD_GROUPS);
export const purchaseUnitEnum = pgEnum("purchase_unit", PURCHASE_UNITS);
export const partCategoryEnum = pgEnum("part_category", PART_CATEGORIES);
export const menuCodeEnum = pgEnum("menu_code", MENU_CODES);
export const slotEnum = pgEnum("slot", SLOTS);
export const packageCodeEnum = pgEnum("package_code", PACKAGE_CODES);
export const deliveryOptionEnum = pgEnum("delivery_option", DELIVERY_OPTIONS);
export const billingPeriodEnum = pgEnum("billing_period", BILLING_PERIODS);
export const subscriptionStatusEnum = pgEnum("subscription_status", SUBSCRIPTION_STATUSES);
export const invoiceKindEnum = pgEnum("invoice_kind", INVOICE_KINDS);
export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const dropStatusEnum = pgEnum("drop_status", DROP_STATUSES);
export const swapStatusEnum = pgEnum("swap_status", SWAP_STATUSES);
export const contributionTypeEnum = pgEnum("contribution_type", CONTRIBUTION_TYPES);
export const postTypeEnum = pgEnum("post_type", POST_TYPES);
export const reactionEnum = pgEnum("reaction", REACTIONS);
export const reportStatusEnum = pgEnum("report_status", REPORT_STATUSES);
