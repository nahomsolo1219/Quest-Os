// Check-ins, partner contributions, notifications, job runs, Telegram links (PLAN.md section 3).
import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, isDemo, timestamps, tstz } from "./_common";
import { user } from "./auth";
import { clients } from "./core";
import { contributionTypeEnum } from "./enums";

export const checkins = pgTable(
  "checkins",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    checkinDate: date("checkin_date", { mode: "string" }).notNull(),
    weightG: integer("weight_g"),
    adherencePct: integer("adherence_pct"),
    notes: text("notes"),
    byUserId: uuid("by_user_id").references(() => user.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [
    index("checkins_client_date_idx").on(t.clientId, t.checkinDate),
    check("checkins_source_chk", sql`${t.source} in ('client', 'nutritionist')`),
    check("checkins_adherence_chk", sql`${t.adherencePct} is null or ${t.adherencePct} between 0 and 100`),
  ],
);

export const partnerContributions = pgTable(
  "partner_contributions",
  {
    id: id(),
    partnerUserId: uuid("partner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    contributedOn: date("contributed_on", { mode: "string" }).notNull(),
    type: contributionTypeEnum("type").notNull(),
    amountBirr: integer("amount_birr"),
    hours: numeric("hours", { precision: 6, scale: 1, mode: "number" }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [index("partner_contributions_partner_idx").on(t.partnerUserId, t.contributedOn)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    dedupeKey: text("dedupe_key").unique(),
    readAt: tstz("read_at"),
    telegramStatus: text("telegram_status").notNull().default("none"),
    ...timestamps(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    check("notifications_telegram_status_chk", sql`${t.telegramStatus} in ('none', 'pending', 'sent', 'failed', 'digest')`),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    job: text("job").notNull(),
    /** Addis date or week start */
    runKey: text("run_key").notNull(),
    startedAt: tstz("started_at").notNull().defaultNow(),
    finishedAt: tstz("finished_at"),
    summary: jsonb("summary"),
    createdAt: createdAt(),
  },
  (t) => [unique("job_runs_job_run_key_uq").on(t.job, t.runKey)],
);

export const telegramLinks = pgTable("telegram_links", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  chatId: text("chat_id"),
  tokenHash: text("token_hash"),
  tokenExpiresAt: tstz("token_expires_at"),
  linkedAt: tstz("linked_at"),
  ...timestamps(),
});
