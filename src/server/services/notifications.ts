import { and, arrayOverlaps, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { clients, notifications, telegramLinks, user } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertSignedIn, type Role } from "@/server/authz";
import { sendTelegram, telegramConfigured, telegramDeepLink } from "@/server/telegram";
import type { Ctx } from "./context";

export type NotifyInput = {
  userIds: string[];
  kind: string;
  title: string;
  body?: string;
  link?: string | null;
  /** unique per user; the user id is appended, so re-running a job never double-notifies (JOB-09) */
  dedupeKey: string;
  /** "now" sends on Telegram right away, "digest" waits for the daily digest, "none" is in-app only */
  telegram?: "now" | "digest" | "none";
};

/** Creates in-app notifications (deduplicated) and sends Telegram where the user linked it. Returns rows created. */
export async function notify(db: DbOrTx, input: NotifyInput): Promise<number> {
  const ids = [...new Set(input.userIds)];
  if (ids.length === 0) return 0;
  const mode = input.telegram ?? "now";
  const inserted = await db.insert(notifications).values(ids.map((userId) => ({
    userId, kind: input.kind, title: input.title, body: input.body ?? "", link: input.link ?? null,
    dedupeKey: `${input.dedupeKey}:${userId}`,
    telegramStatus: mode === "none" ? "none" : mode === "digest" ? "digest" : "pending",
  }))).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id, userId: notifications.userId });

  if (mode === "now" && inserted.length > 0) {
    const chatByUser = await telegramChats(db, inserted.map((r) => r.userId));
    for (const row of inserted) {
      const chat = chatByUser.get(row.userId);
      const status = chat && telegramConfigured()
        ? await sendTelegram(chat, `${input.title}\n${input.body ?? ""}${input.link ? `\n${appUrl()}${input.link}` : ""}`)
        : "skipped";
      await db.update(notifications).set({ telegramStatus: status === "sent" ? "sent" : status === "failed" ? "failed" : "none" })
        .where(eq(notifications.id, row.id));
    }
  }
  return inserted.length;
}

/**
 * Linked Telegram chats that may receive messages: staff always; clients only while their "Send me notifications on
 * Telegram" switch is on (doc 8: clients who opt in).
 */
async function telegramChats(db: DbOrTx, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.select({ userId: telegramLinks.userId, chatId: telegramLinks.chatId, optIn: clients.telegramOptIn })
    .from(telegramLinks).leftJoin(clients, eq(clients.userId, telegramLinks.userId))
    .where(and(inArray(telegramLinks.userId, userIds), sql`${telegramLinks.chatId} is not null`));
  return new Map(rows.filter((r) => r.optIn !== false).map((r) => [r.userId, r.chatId!]));
}

function appUrl() {
  return process.env.APP_URL ?? "";
}

/** User ids holding any of the roles (for staff alerts). */
export async function userIdsWithRoles(db: DbOrTx, roles: Role[]): Promise<string[]> {
  const rows = await db.select({ id: user.id }).from(user)
    .where(and(arrayOverlaps(user.roles, roles), eq(user.banned, false)));
  return rows.map((r) => r.id);
}

export async function listMyNotifications(ctx: Ctx, limit = 50) {
  assertSignedIn(ctx.actor);
  return ctx.db.select().from(notifications).where(eq(notifications.userId, ctx.actor.userId))
    .orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(ctx: Ctx): Promise<number> {
  if (!ctx.actor) return 0;
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(notifications)
    .where(and(eq(notifications.userId, ctx.actor.userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markRead(ctx: Ctx, ids: string[] | "all") {
  assertSignedIn(ctx.actor);
  const mine = eq(notifications.userId, ctx.actor.userId);
  await ctx.db.update(notifications).set({ readAt: ctx.now })
    .where(ids === "all" ? and(mine, isNull(notifications.readAt)) : and(mine, inArray(notifications.id, ids)));
}

/** Daily Telegram digest of community notifications (COM-13: at most one message a day). */
export async function sendCommunityDigests(db: DbOrTx): Promise<number> {
  const pending = await db.select().from(notifications).where(eq(notifications.telegramStatus, "digest"));
  if (pending.length === 0) return 0;
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  const chats = await telegramChats(db, [...byUser.keys()]);
  let sent = 0;
  for (const [userId, items] of byUser) {
    const chat = chats.get(userId);
    let status: string = "none";
    if (chat && telegramConfigured()) {
      const r = await sendTelegram(chat, `Quest Meals community today:\n${items.map((i) => `• ${i.title}`).join("\n")}`);
      status = r === "sent" ? "sent" : "failed";
      if (r === "sent") sent++;
    }
    await db.update(notifications).set({ telegramStatus: status }).where(inArray(notifications.id, items.map((i) => i.id)));
  }
  return sent;
}

// ---- Telegram linking (NOT-04, APP-10) ----

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Creates a one-time token (valid 1 hour) and returns the bot deep link, or null when no bot is configured. */
export async function createTelegramLink(ctx: Ctx): Promise<{ link: string | null; token: string }> {
  assertSignedIn(ctx.actor);
  const token = randomBytes(16).toString("hex");
  const expires = new Date(ctx.now.getTime() + 60 * 60 * 1000);
  await ctx.db.insert(telegramLinks).values({ userId: ctx.actor.userId, tokenHash: hashToken(token), tokenExpiresAt: expires })
    .onConflictDoUpdate({ target: telegramLinks.userId, set: { tokenHash: hashToken(token), tokenExpiresAt: expires } });
  return { link: telegramDeepLink(token), token };
}

/** Called by the bot webhook on "/start <token>". The token works once. */
export async function completeTelegramLink(db: DbOrTx, token: string, chatId: string, now: Date): Promise<boolean> {
  const [row] = await db.select().from(telegramLinks).where(eq(telegramLinks.tokenHash, hashToken(token)));
  if (!row || !row.tokenExpiresAt || row.tokenExpiresAt < now) return false;
  await db.update(telegramLinks).set({ chatId, linkedAt: now, tokenHash: null, tokenExpiresAt: null }).where(eq(telegramLinks.id, row.id));
  // linking from the app is the opt-in; the profile switch turns it off again
  await db.update(clients).set({ telegramOptIn: true }).where(eq(clients.userId, row.userId));
  return true;
}

export async function telegramStatus(ctx: Ctx) {
  assertSignedIn(ctx.actor);
  const [row] = await ctx.db.select().from(telegramLinks).where(eq(telegramLinks.userId, ctx.actor.userId));
  return { linked: Boolean(row?.chatId), configured: telegramConfigured() };
}

export async function unlinkTelegram(ctx: Ctx) {
  assertSignedIn(ctx.actor);
  await ctx.db.update(telegramLinks).set({ chatId: null, linkedAt: null }).where(eq(telegramLinks.userId, ctx.actor.userId));
}
