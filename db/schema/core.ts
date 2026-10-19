// Settings, audit log, areas, clients and their nutrition (PLAN.md section 3, Core).
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, isDemo, timestamps, tstz, updatedAt } from "./_common";
import { user } from "./auth";
import { activityEnum, clientStatusEnum, goalEnum, leadSourceEnum, sexEnum, sizeEnum } from "./enums";

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId), index("audit_log_created_at_idx").on(t.createdAt)],
);

export const areas = pgTable("areas", {
  id: id(),
  name: text("name").notNull().unique(),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps(),
});

export const clients = pgTable(
  "clients",
  {
    id: id(),
    userId: uuid("user_id").unique().references(() => user.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** E.164, e.g. +251911000001 */
    phone: text("phone").notNull().unique(),
    email: text("email"),
    status: clientStatusEnum("status").notNull().default("lead"),
    leadSource: leadSourceEnum("lead_source"),
    leadNotes: text("lead_notes"),
    sex: sexEnum("sex"),
    age: integer("age"),
    weightG: integer("weight_g"),
    heightCm: integer("height_cm"),
    activity: activityEnum("activity"),
    goal: goalEnum("goal"),
    allergies: text("allergies").array().notNull().default(sql`'{}'::text[]`),
    dislikes: text("dislikes").array().notNull().default(sql`'{}'::text[]`),
    address: text("address"),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    landmark: text("landmark"),
    /** ISO weekday 1 = Monday … 7 = Sunday */
    checkInWeekday: integer("check_in_weekday"),
    telegramOptIn: boolean("telegram_opt_in").notNull().default(false),
    communityMutedUntil: tstz("community_muted_until"),
    endedAt: date("ended_at", { mode: "string" }),
    notes: text("notes"),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [
    index("clients_status_idx").on(t.status),
    index("clients_area_id_idx").on(t.areaId),
    check("clients_check_in_weekday_chk", sql`${t.checkInWeekday} is null or ${t.checkInWeekday} between 1 and 7`),
  ],
);

export const consultations = pgTable(
  "consultations",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    heldAt: tstz("held_at").notNull(),
    mode: text("mode").notNull(),
    notes: text("notes"),
    byUserId: uuid("by_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("consultations_client_id_idx").on(t.clientId),
    check("consultations_mode_chk", sql`${t.mode} in ('in_person', 'phone')`),
  ],
);

export const nutritionProfiles = pgTable(
  "nutrition_profiles",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    bmr: integer("bmr").notNull(),
    tdee: integer("tdee").notNull(),
    suggestedKcal: integer("suggested_kcal").notNull(),
    suggestedSize: sizeEnum("suggested_size").notNull(),
    suggestedProteinG: integer("suggested_protein_g").notNull(),
    suggestedCarbG: integer("suggested_carb_g").notNull(),
    suggestedFatG: integer("suggested_fat_g").notNull(),
    kcalTarget: integer("kcal_target").notNull(),
    size: sizeEnum("size").notNull(),
    goal: goalEnum("goal").notNull(),
    proteinG: integer("protein_g").notNull(),
    carbG: integer("carb_g").notNull(),
    fatG: integer("fat_g").notNull(),
    isOverride: boolean("is_override").notNull().default(false),
    /** quick start: set by the calculator, awaiting the nutritionist */
    provisional: boolean("provisional").notNull().default(false),
    /** null = set by the calculator */
    setByUserId: uuid("set_by_user_id").references(() => user.id, { onDelete: "set null" }),
    setAt: tstz("set_at").notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    index("nutrition_profiles_client_id_idx").on(t.clientId),
    uniqueIndex("nutrition_profiles_one_current_uq").on(t.clientId).where(sql`${t.isCurrent}`),
  ],
);
