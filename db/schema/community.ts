// Community: posts, comments, reactions, challenges, ratings, reports, mutes (PLAN.md section 3).
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, isDemo, timestamps, tstz } from "./_common";
import { user } from "./auth";
import { clients } from "./core";
import { postTypeEnum, reactionEnum, reportStatusEnum } from "./enums";
import { meals } from "./menu";

export const challenges = pgTable(
  "challenges",
  {
    id: id(),
    title: text("title").notNull(),
    question: text("question").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [check("challenges_dates_chk", sql`${t.endsOn} >= ${t.startsOn}`)],
);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: id(),
    authorUserId: uuid("author_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: postTypeEnum("type").notNull().default("post"),
    body: text("body").notNull(),
    photoKeys: text("photo_keys").array().notNull().default(sql`'{}'::text[]`),
    /** { kgChange, weeks } */
    progress: jsonb("progress").$type<{ kgChange: number; weeks: number } | null>(),
    pinned: boolean("pinned").notNull().default(false),
    hiddenAt: tstz("hidden_at"),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => user.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    /** community_comments.id marked as the answer (no FK: avoids a cycle) */
    answerCommentId: uuid("answer_comment_id"),
    challengeId: uuid("challenge_id").references(() => challenges.id, { onDelete: "set null" }),
    isDemo: isDemo(),
    ...timestamps(),
  },
  (t) => [
    index("community_posts_feed_idx").on(t.pinned, t.createdAt),
    index("community_posts_author_idx").on(t.authorUserId),
    check("community_posts_body_len_chk", sql`char_length(${t.body}) <= 2000`),
    check("community_posts_photos_chk", sql`coalesce(array_length(${t.photoKeys}, 1), 0) <= 4`),
  ],
);

export const communityComments = pgTable(
  "community_comments",
  {
    id: id(),
    postId: uuid("post_id").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    hiddenAt: tstz("hidden_at"),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => user.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    ...timestamps(),
  },
  (t) => [
    index("community_comments_post_idx").on(t.postId, t.createdAt),
    check("community_comments_body_len_chk", sql`char_length(${t.body}) <= 1000`),
  ],
);

export const communityReactions = pgTable(
  "community_reactions",
  {
    id: id(),
    postId: uuid("post_id").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: reactionEnum("type").notNull(),
    ...timestamps(),
  },
  (t) => [unique("community_reactions_post_user_uq").on(t.postId, t.userId)],
);

export const challengeCheckins = pgTable(
  "challenge_checkins",
  {
    id: id(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    checkinDate: date("checkin_date", { mode: "string" }).notNull(),
    ...timestamps(),
  },
  (t) => [unique("challenge_checkins_uq").on(t.challengeId, t.userId, t.checkinDate)],
);

export const mealRatings = pgTable(
  "meal_ratings",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    mealId: uuid("meal_id").notNull().references(() => meals.id, { onDelete: "cascade" }),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    ...timestamps(),
  },
  (t) => [
    unique("meal_ratings_client_meal_date_uq").on(t.clientId, t.mealId, t.serviceDate),
    index("meal_ratings_meal_date_idx").on(t.mealId, t.serviceDate),
    check("meal_ratings_rating_chk", sql`${t.rating} between 1 and 5`),
  ],
);

export const communityReports = pgTable(
  "community_reports",
  {
    id: id(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reporterUserId: uuid("reporter_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: reportStatusEnum("status").notNull().default("open"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: tstz("resolved_at"),
    ...timestamps(),
  },
  (t) => [
    index("community_reports_status_idx").on(t.status, t.createdAt),
    check("community_reports_target_type_chk", sql`${t.targetType} in ('post', 'comment')`),
  ],
);

export const communityMutes = pgTable(
  "community_mutes",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    until: tstz("until").notNull(),
    reason: text("reason"),
    byUserId: uuid("by_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("community_mutes_user_idx").on(t.userId, t.until)],
);
