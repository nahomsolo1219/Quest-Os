// Community (SPEC document 7, Module 14): feed, posts, comments, reactions, Q&A, challenges, reports and moderation.
// Every function authorizes twice: the `community.*` permission, then the domain `communityAccess` level of the member.
// Responses never carry phone numbers, addresses or emails (SEC-13): only display names, avatars and post content.
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  challengeCheckins, challenges, checkins, clients, communityComments, communityMutes, communityPosts, communityReactions,
  communityReports, user,
} from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertCan, ForbiddenError, type Actor, type Role } from "@/server/authz";
import { putImage, parseKey, storage } from "@/server/storage";
import {
  canPost, canReact, canRead, communityAccess, communityPowers, formatProgress, leaderboard, progressSummary, streak,
  type CommunityAccess,
} from "@/domain/community";
import { displayName } from "@/domain/format";
import { addisDate, compareDates, formatAddisDateTime, isDateStr } from "@/domain/time";
import { POST_TYPES, REACTIONS, type ClientStatus, type PostType, type Reaction } from "@/domain/types";
import { writeAudit } from "./audit";
import { ServiceError, type Ctx } from "./context";
import { notify, userIdsWithRoles } from "./notifications";
import { loadSettings } from "./settings";

export { POST_TYPES, REACTIONS };
export type { PostType, Reaction };

// ---------- access ----------

export type Viewer = {
  actor: Actor;
  access: CommunityAccess;
  powers: ReturnType<typeof communityPowers>;
  /** why a member is read/react only: shown as a banner */
  limit: "paused" | "ended" | "muted" | null;
  mutedUntil: Date | null;
  clientStatus: ClientStatus | null;
};

/** The current mute end for a user: the later of clients.community_muted_until and an open community_mutes row. */
async function mutedUntilFor(db: DbOrTx, userId: string, clientMuted: Date | null, now: Date): Promise<Date | null> {
  const [m] = await db.select({ until: sql<Date>`max(${communityMutes.until})`.mapWith(communityMutes.until) }).from(communityMutes)
    .where(and(eq(communityMutes.userId, userId), gt(communityMutes.until, now)));
  const a = clientMuted && clientMuted > now ? clientMuted : null;
  const b = m?.until ?? null;
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Loads the actor's community access level (domain `communityAccess`) and staff powers. */
export async function viewer(ctx: Ctx): Promise<Viewer> {
  assertCan(ctx.actor, "community.read");
  const actor = ctx.actor;
  const [c] = await ctx.db.select({ status: clients.status, endedAt: clients.endedAt, muted: clients.communityMutedUntil })
    .from(clients).where(eq(clients.userId, actor.userId)).limit(1);
  const s = await loadSettings(ctx.db);
  const mutedUntil = await mutedUntilFor(ctx.db, actor.userId, c?.muted ?? null, ctx.now);
  const clientStatus = (c?.status as ClientStatus | undefined) ?? null;
  const access = communityAccess({ roles: actor.roles, clientStatus, endedAt: c?.endedAt ?? null, mutedUntil }, ctx.now, s.community);
  const powers = communityPowers(actor.roles);
  let limit: Viewer["limit"] = null;
  if (access !== "full" && c) {
    if (mutedUntil && clientStatus === "active") limit = "muted";
    else if (clientStatus === "paused") limit = "paused";
    else if (clientStatus === "ended") limit = "ended";
    else if (mutedUntil) limit = "muted";
  }
  return { actor, access, powers, limit, mutedUntil, clientStatus };
}

async function needRead(ctx: Ctx): Promise<Viewer> {
  const v = await viewer(ctx);
  if (!canRead(v.access)) throw new ForbiddenError("Your community access has ended. Renew your plan to join again.");
  return v;
}
async function needReact(ctx: Ctx): Promise<Viewer> {
  assertCan(ctx.actor, "community.react");
  const v = await needRead(ctx);
  if (!canReact(v.access)) throw new ForbiddenError("You can only read the community right now.");
  return v;
}
async function needPost(ctx: Ctx): Promise<Viewer> {
  assertCan(ctx.actor, "community.post");
  const v = await needRead(ctx);
  if (!canPost(v.access)) {
    throw new ForbiddenError(
      v.limit === "muted" ? "You are muted in the community for now. You can still read and react."
        : v.limit === "paused" ? "You can read and react while your plan is paused. Posting comes back when your plan restarts."
          : "You can read and react, but posting needs an active plan.",
    );
  }
  return v;
}
function needCoach(v: Viewer) {
  assertCan(v.actor, "community.coach");
}
function needModerator(ctx: Ctx): asserts ctx is Ctx & { actor: Actor } {
  assertCan(ctx.actor, "community.moderate");
}

// ---------- people (display names only: SEC-13) ----------

export type Person = { userId: string; name: string; avatarUrl: string | null; coach: boolean };

/** Display names ("Dagi K."), avatars (signed) and Coach badges for a set of users. Selects no contact details. */
export async function people(db: DbOrTx, userIds: string[]): Promise<Map<string, Person>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, Person>();
  if (ids.length === 0) return out;
  const rows = await db.select({ id: user.id, name: user.name, image: user.image, roles: user.roles, first: clients.firstName, last: clients.lastName })
    .from(user).leftJoin(clients, eq(clients.userId, user.id)).where(inArray(user.id, ids));
  for (const r of rows) {
    let name: string;
    if (r.first != null) name = displayName(r.first, r.last ?? "");
    else {
      const parts = r.name.trim().split(/\s+/);
      name = displayName(parts[0] ?? "", parts.slice(1).join(" "));
    }
    let avatarUrl: string | null = null;
    if (r.image) {
      const k = parseKey(r.image);
      if (k?.prefix === "avatars") avatarUrl = await storage().signedUrl(r.image);
    }
    out.set(r.id, { userId: r.id, name: name || "Member", avatarUrl, coach: (r.roles as Role[]).includes("coach") });
  }
  return out;
}
const unknownPerson = (userId: string): Person => ({ userId, name: "Member", avatarUrl: null, coach: false });

// ---------- feed ----------

export type FeedPost = {
  id: string;
  type: PostType;
  body: string;
  author: Person;
  createdAt: string;
  /** "Mon 19 Oct, 12:00" in Addis time */
  when: string;
  pinned: boolean;
  photos: string[];
  progressText: string | null;
  reactions: Record<Reaction, number>;
  myReaction: Reaction | null;
  commentCount: number;
  answered: boolean;
  hidden: { reason: string | null } | null;
  challengeId: string | null;
  mine: boolean;
};

type PostRow = typeof communityPosts.$inferSelect;

async function decoratePosts(db: DbOrTx, v: Viewer, rows: PostRow[]): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [reacts, mine, counts, ppl] = await Promise.all([
    db.select({ postId: communityReactions.postId, type: communityReactions.type, n: sql<number>`count(*)::int` })
      .from(communityReactions).where(inArray(communityReactions.postId, ids)).groupBy(communityReactions.postId, communityReactions.type),
    db.select({ postId: communityReactions.postId, type: communityReactions.type }).from(communityReactions)
      .where(and(inArray(communityReactions.postId, ids), eq(communityReactions.userId, v.actor.userId))),
    db.select({ postId: communityComments.postId, n: sql<number>`count(*)::int` }).from(communityComments)
      .where(and(inArray(communityComments.postId, ids), v.powers.moderate ? sql`true` : isNull(communityComments.hiddenAt)))
      .groupBy(communityComments.postId),
    people(db, rows.map((r) => r.authorUserId)),
  ]);
  const out: FeedPost[] = [];
  for (const r of rows) {
    const reactions: Record<Reaction, number> = { like: 0, fire: 0, strong: 0 };
    for (const x of reacts) if (x.postId === r.id) reactions[x.type as Reaction] = x.n;
    const photos = await Promise.all(r.photoKeys.filter((k) => parseKey(k)?.prefix === "community").map((k) => storage().signedUrl(k)));
    out.push({
      id: r.id,
      type: r.type as PostType,
      body: r.body,
      author: ppl.get(r.authorUserId) ?? unknownPerson(r.authorUserId),
      createdAt: r.createdAt.toISOString(),
      when: formatAddisDateTime(r.createdAt),
      pinned: r.pinned,
      photos,
      progressText: r.type === "progress" && r.progress ? formatProgress(r.progress) : null,
      reactions,
      myReaction: (mine.find((m) => m.postId === r.id)?.type as Reaction | undefined) ?? null,
      commentCount: counts.find((c) => c.postId === r.id)?.n ?? 0,
      answered: r.answerCommentId != null,
      hidden: r.hiddenAt ? { reason: r.hiddenReason } : null,
      challengeId: r.challengeId,
      mine: r.authorUserId === v.actor.userId,
    });
  }
  return out;
}

export type FeedResult = { pinned: FeedPost[]; posts: FeedPost[]; nextCursor: string | null; viewer: PublicViewer };
export type PublicViewer = {
  access: CommunityAccess; limit: Viewer["limit"]; mutedUntil: string | null;
  canPost: boolean; canReact: boolean; coach: boolean; moderate: boolean; userId: string;
};
export function publicViewer(v: Viewer): PublicViewer {
  return {
    access: v.access, limit: v.limit, mutedUntil: v.mutedUntil?.toISOString() ?? null, canPost: canPost(v.access), canReact: canReact(v.access),
    coach: v.powers.pin, moderate: v.powers.moderate, userId: v.actor.userId,
  };
}

/** Cursor: the created_at text from Postgres (full microsecond precision) plus the id. */
function encodeCursor(ts: string, id: string) {
  return Buffer.from(`${ts}|${id}`).toString("base64url");
}
function decodeCursor(c: string): { ts: string; id: string } | null {
  try {
    const [ts, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    if (!ts || !/^[0-9a-f-]{36}$/.test(id ?? "")) return null;
    if (Number.isNaN(new Date(ts).getTime())) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

/**
 * Newest first; pinned posts come on top (in their own list, on the first page only); the rest are paginated by
 * settings.community.pageSize with a (created_at, id) cursor. Hidden posts are left out for members; moderators see them.
 */
export async function feed(ctx: Ctx, input: { cursor?: string | null; type?: PostType | null } = {}): Promise<FeedResult> {
  const v = await needRead(ctx);
  const { community: cs } = await loadSettings(ctx.db);
  const typeCond = input.type ? eq(communityPosts.type, input.type) : undefined;
  const hiddenCond = v.powers.moderate ? undefined : isNull(communityPosts.hiddenAt);
  const cur = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && !cur) throw new ServiceError("That page link is not valid. Reload the feed.");

  const pinnedRows = cur ? [] : await ctx.db.select().from(communityPosts)
    .where(and(eq(communityPosts.pinned, true), typeCond, hiddenCond))
    .orderBy(desc(communityPosts.createdAt), desc(communityPosts.id));

  const rows = await ctx.db.select({ post: communityPosts, ts: sql<string>`${communityPosts.createdAt}::text` }).from(communityPosts)
    .where(and(
      eq(communityPosts.pinned, false), typeCond, hiddenCond,
      cur ? sql`(${communityPosts.createdAt}, ${communityPosts.id}) < (${cur.ts}::timestamptz, ${cur.id}::uuid)` : undefined,
    ))
    .orderBy(desc(communityPosts.createdAt), desc(communityPosts.id))
    .limit(cs.pageSize + 1);
  const page = rows.slice(0, cs.pageSize);
  const last = page[page.length - 1];
  const nextCursor = rows.length > cs.pageSize && last ? encodeCursor(last.ts, last.post.id) : null;

  const [pinned, posts] = await Promise.all([decoratePosts(ctx.db, v, pinnedRows), decoratePosts(ctx.db, v, page.map((r) => r.post))]);
  return { pinned, posts, nextCursor, viewer: publicViewer(v) };
}

export type CommentView = {
  id: string; body: string; author: Person; createdAt: string; when: string; isAnswer: boolean; hidden: { reason: string | null } | null; mine: boolean;
};

/** One post with its comments (oldest first). Members get "not found" for hidden posts. */
export async function postDetail(ctx: Ctx, postId: string): Promise<{ post: FeedPost; comments: CommentView[]; viewer: PublicViewer }> {
  const v = await needRead(ctx);
  const row = await loadPost(ctx.db, v, postId);
  const [post] = await decoratePosts(ctx.db, v, [row]);
  const cs = await ctx.db.select().from(communityComments)
    .where(and(eq(communityComments.postId, postId), v.powers.moderate ? undefined : isNull(communityComments.hiddenAt)))
    .orderBy(asc(communityComments.createdAt), asc(communityComments.id));
  const ppl = await people(ctx.db, cs.map((c) => c.authorUserId));
  const comments = cs.map((c) => ({
    id: c.id, body: c.body, author: ppl.get(c.authorUserId) ?? unknownPerson(c.authorUserId), createdAt: c.createdAt.toISOString(), when: formatAddisDateTime(c.createdAt),
    isAnswer: row.answerCommentId === c.id, hidden: c.hiddenAt ? { reason: c.hiddenReason } : null, mine: c.authorUserId === v.actor.userId,
  }));
  // the marked answer first, then the rest in time order
  comments.sort((a, b) => Number(b.isAnswer) - Number(a.isAnswer));
  return { post, comments, viewer: publicViewer(v) };
}

async function loadPost(db: DbOrTx, v: Viewer, postId: string): Promise<PostRow> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) throw new ServiceError("That post was not found.", "not_found");
  const [row] = await db.select().from(communityPosts).where(eq(communityPosts.id, postId));
  if (!row || (row.hiddenAt && !v.powers.moderate)) throw new ServiceError("That post was not found.", "not_found");
  return row;
}

// ---------- posting ----------

/** The member's own weight change for a progress post preview ("−3.2 kg in 4 weeks"), or null. */
export async function myProgress(ctx: Ctx): Promise<{ kgChange: number; weeks: number; text: string } | null> {
  await needRead(ctx);
  const clientId = ctx.actor!.clientId;
  if (!clientId) return null;
  const rows = await ctx.db.select({ checkinDate: checkins.checkinDate, weightG: checkins.weightG }).from(checkins).where(eq(checkins.clientId, clientId));
  const p = progressSummary(rows);
  return p ? { ...p, text: formatProgress(p) } : null;
}

export type CreatePostInput = { type: PostType; body: string; photos?: File[]; shareProgress?: boolean; challengeId?: string | null };

export async function createPost(ctx: Ctx, input: CreatePostInput): Promise<{ id: string }> {
  const v = await needPost(ctx);
  const { community: cs } = await loadSettings(ctx.db);
  if (!(POST_TYPES as readonly string[]).includes(input.type)) throw new ServiceError("Choose a post type.");
  const body = (input.body ?? "").trim();
  if (!body) throw new ServiceError("Write something before posting.");
  if (body.length > 2000) throw new ServiceError("Posts can be at most 2,000 characters.");
  if (input.type === "announcement" && !v.actor.roles.includes("coach")) throw new ForbiddenError("Only coaches post announcements.");
  const photos = (input.photos ?? []).filter((f) => f && f.size > 0);
  if (photos.length > cs.maxPhotos) throw new ServiceError(`Add at most ${cs.maxPhotos} photos.`);

  let progress: { kgChange: number; weeks: number } | null = null;
  if (input.type === "progress" && input.shareProgress) {
    // the author's own check-ins only
    const clientId = v.actor.clientId;
    if (!clientId) throw new ServiceError("Only members with check-ins can share progress.");
    const rows = await ctx.db.select({ checkinDate: checkins.checkinDate, weightG: checkins.weightG }).from(checkins).where(eq(checkins.clientId, clientId));
    progress = progressSummary(rows);
    if (!progress) throw new ServiceError("You need at least two weigh-ins to share your progress. Untick “share my progress” or log a weight first.");
  }

  const keys: string[] = [];
  for (const f of photos) keys.push(await putImage("community", v.actor.userId, f));

  const [row] = await ctx.db.insert(communityPosts).values({
    authorUserId: v.actor.userId, type: input.type, body, photoKeys: keys, progress,
    challengeId: input.challengeId ?? null, createdAt: ctx.now, updatedAt: ctx.now,
  }).returning({ id: communityPosts.id });

  if (input.type === "announcement") {
    const members = (await activeMemberUserIds(ctx.db)).filter((id) => id !== v.actor.userId);
    await notify(ctx.db, {
      userIds: members, kind: "community.announcement", title: `New announcement from Coach ${(await people(ctx.db, [v.actor.userId])).get(v.actor.userId)?.name ?? ""}`.trim(),
      body: body.slice(0, 140), link: `/app/community/${row.id}`, dedupeKey: `community-announcement:${row.id}`, telegram: "digest",
    });
  }
  return row;
}

/** User ids of active clients (full community members). */
async function activeMemberUserIds(db: DbOrTx): Promise<string[]> {
  const rows = await db.select({ id: clients.userId }).from(clients).where(and(eq(clients.status, "active"), isNotNull(clients.userId)));
  return rows.map((r) => r.id!).filter(Boolean);
}

/** Comments are one level deep: a comment belongs to a post, never to another comment. */
export async function addComment(ctx: Ctx, input: { postId: string; body: string }): Promise<{ id: string }> {
  const v = await needPost(ctx);
  const post = await loadPost(ctx.db, v, input.postId);
  const body = (input.body ?? "").trim();
  if (!body) throw new ServiceError("Write a comment first.");
  if (body.length > 1000) throw new ServiceError("Comments can be at most 1,000 characters.");
  const [row] = await ctx.db.insert(communityComments).values({ postId: post.id, authorUserId: v.actor.userId, body, createdAt: ctx.now, updatedAt: ctx.now })
    .returning({ id: communityComments.id });
  if (post.authorUserId !== v.actor.userId) {
    const who = (await people(ctx.db, [v.actor.userId])).get(v.actor.userId)?.name ?? "Someone";
    await notify(ctx.db, {
      userIds: [post.authorUserId], kind: "community.reply", title: `${who} replied to your post`, body: body.slice(0, 140),
      link: `/app/community/${post.id}`, dedupeKey: `community-reply:${row.id}`, telegram: "digest",
    });
  }
  return row;
}

/** One reaction per user per post: set, change, or remove (null). Paused members may react. */
export async function react(ctx: Ctx, postId: string, type: Reaction | null): Promise<{ reactions: Record<Reaction, number>; myReaction: Reaction | null }> {
  const v = await needReact(ctx);
  const post = await loadPost(ctx.db, v, postId);
  if (type !== null && !(REACTIONS as readonly string[]).includes(type)) throw new ServiceError("Unknown reaction.");
  if (type === null) {
    await ctx.db.delete(communityReactions).where(and(eq(communityReactions.postId, post.id), eq(communityReactions.userId, v.actor.userId)));
  } else {
    await ctx.db.insert(communityReactions).values({ postId: post.id, userId: v.actor.userId, type })
      .onConflictDoUpdate({ target: [communityReactions.postId, communityReactions.userId], set: { type, updatedAt: ctx.now } });
  }
  const rows = await ctx.db.select({ type: communityReactions.type, n: sql<number>`count(*)::int` }).from(communityReactions)
    .where(eq(communityReactions.postId, post.id)).groupBy(communityReactions.type);
  const reactions: Record<Reaction, number> = { like: 0, fire: 0, strong: 0 };
  for (const r of rows) reactions[r.type as Reaction] = r.n;
  return { reactions, myReaction: type };
}

/** Coaches mark one reply as the answer to a question (null clears it). */
export async function markAnswer(ctx: Ctx, postId: string, commentId: string | null): Promise<void> {
  const v = await needRead(ctx);
  needCoach(v);
  const post = await loadPost(ctx.db, v, postId);
  if (post.type !== "question") throw new ServiceError("Only questions for the coaches can have an answer.");
  if (commentId) {
    const [c] = await ctx.db.select({ id: communityComments.id }).from(communityComments)
      .where(and(eq(communityComments.id, commentId), eq(communityComments.postId, post.id), isNull(communityComments.hiddenAt)));
    if (!c) throw new ServiceError("That reply is not on this question.");
  }
  await ctx.db.update(communityPosts).set({ answerCommentId: commentId, updatedAt: ctx.now }).where(eq(communityPosts.id, post.id));
}

export async function pinPost(ctx: Ctx, postId: string, pinned: boolean): Promise<void> {
  const v = await needRead(ctx);
  needCoach(v);
  const post = await loadPost(ctx.db, v, postId);
  await ctx.db.update(communityPosts).set({ pinned, updatedAt: ctx.now }).where(eq(communityPosts.id, post.id));
}

// ---------- reports and moderation ----------

export type TargetType = "post" | "comment";

async function loadTarget(db: DbOrTx, targetType: TargetType, targetId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return null;
  if (targetType === "post") {
    const [p] = await db.select().from(communityPosts).where(eq(communityPosts.id, targetId));
    return p ? { kind: "post" as const, id: p.id, postId: p.id, authorUserId: p.authorUserId, body: p.body, hiddenAt: p.hiddenAt, hiddenReason: p.hiddenReason } : null;
  }
  const [c] = await db.select().from(communityComments).where(eq(communityComments.id, targetId));
  return c ? { kind: "comment" as const, id: c.id, postId: c.postId, authorUserId: c.authorUserId, body: c.body, hiddenAt: c.hiddenAt, hiddenReason: c.hiddenReason } : null;
}

/** Any member who can read may report a post or comment; operations get an in-app and Telegram alert right away. */
export async function report(ctx: Ctx, input: { targetType: TargetType; targetId: string; reason: string }): Promise<{ id: string }> {
  assertCan(ctx.actor, "community.report");
  const v = await needRead(ctx);
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new ServiceError("Tell us what is wrong with it.");
  if (reason.length > 500) throw new ServiceError("Keep the reason under 500 characters.");
  const t = await loadTarget(ctx.db, input.targetType, input.targetId);
  if (!t || (t.hiddenAt && !v.powers.moderate)) throw new ServiceError("That post or comment was not found.", "not_found");
  const [row] = await ctx.db.insert(communityReports).values({ targetType: input.targetType, targetId: t.id, reporterUserId: v.actor.userId, reason })
    .returning({ id: communityReports.id });
  const ops = await userIdsWithRoles(ctx.db, ["operations"]);
  await notify(ctx.db, {
    userIds: ops, kind: "community.report", title: `Community report: ${input.targetType}`, body: `${reason.slice(0, 120)} — “${t.body.slice(0, 80)}”`,
    link: "/staff/community", dedupeKey: `community-report:${row.id}`, telegram: "now",
  });
  return row;
}

/** Owners and operations hide a post or comment with a reason (audited). */
export async function hide(ctx: Ctx, input: { targetType: TargetType; targetId: string; reason: string }): Promise<void> {
  needModerator(ctx);
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new ServiceError("Give a reason for hiding it.");
  const t = await loadTarget(ctx.db, input.targetType, input.targetId);
  if (!t) throw new ServiceError("That post or comment was not found.", "not_found");
  const set = { hiddenAt: ctx.now, hiddenByUserId: ctx.actor.userId, hiddenReason: reason, updatedAt: ctx.now };
  if (t.kind === "post") await ctx.db.update(communityPosts).set(set).where(eq(communityPosts.id, t.id));
  else await ctx.db.update(communityComments).set(set).where(eq(communityComments.id, t.id));
  await writeAudit(ctx.db, ctx.actor, {
    action: "community.hide", entity: t.kind === "post" ? "community_posts" : "community_comments", entityId: t.id,
    before: { hiddenAt: t.hiddenAt, hiddenReason: t.hiddenReason }, after: { hiddenAt: ctx.now, hiddenReason: reason }, reason,
  });
  // reports about it are settled by the hide
  await ctx.db.update(communityReports).set({ status: "resolved", resolvedByUserId: ctx.actor.userId, resolvedAt: ctx.now, updatedAt: ctx.now })
    .where(and(eq(communityReports.targetType, t.kind), eq(communityReports.targetId, t.id), eq(communityReports.status, "open")));
}

export async function unhide(ctx: Ctx, input: { targetType: TargetType; targetId: string; reason?: string | null }): Promise<void> {
  needModerator(ctx);
  const t = await loadTarget(ctx.db, input.targetType, input.targetId);
  if (!t) throw new ServiceError("That post or comment was not found.", "not_found");
  const set = { hiddenAt: null, hiddenByUserId: null, hiddenReason: null, updatedAt: ctx.now };
  if (t.kind === "post") await ctx.db.update(communityPosts).set(set).where(eq(communityPosts.id, t.id));
  else await ctx.db.update(communityComments).set(set).where(eq(communityComments.id, t.id));
  await writeAudit(ctx.db, ctx.actor, {
    action: "community.unhide", entity: t.kind === "post" ? "community_posts" : "community_comments", entityId: t.id,
    before: { hiddenAt: t.hiddenAt, hiddenReason: t.hiddenReason }, after: { hiddenAt: null }, reason: input.reason?.trim() || null,
  });
}

/** Mutes a member for a set time (hours or days): they keep read + react until it ends (audited). */
export async function mute(ctx: Ctx, input: { userId: string; hours?: number; days?: number; reason: string }): Promise<{ until: Date }> {
  needModerator(ctx);
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new ServiceError("Give a reason for the mute.");
  const hours = (input.hours ?? 0) + (input.days ?? 0) * 24;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 90) throw new ServiceError("Choose how long the mute lasts (up to 90 days).");
  if (input.userId === ctx.actor.userId) throw new ServiceError("You cannot mute yourself.");
  const [u] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.id, input.userId));
  if (!u) throw new ServiceError("That member was not found.", "not_found");
  const until = new Date(ctx.now.getTime() + hours * 3600_000);
  const [c] = await ctx.db.select({ id: clients.id, muted: clients.communityMutedUntil }).from(clients).where(eq(clients.userId, u.id));
  await ctx.db.insert(communityMutes).values({ userId: u.id, until, reason, byUserId: ctx.actor.userId });
  if (c) await ctx.db.update(clients).set({ communityMutedUntil: until }).where(eq(clients.id, c.id));
  await writeAudit(ctx.db, ctx.actor, { action: "community.mute", entity: "user", entityId: u.id, before: { mutedUntil: c?.muted ?? null }, after: { mutedUntil: until }, reason });
  return { until };
}

export async function unmute(ctx: Ctx, input: { userId: string; reason?: string | null }): Promise<void> {
  needModerator(ctx);
  const [c] = await ctx.db.select({ id: clients.id, muted: clients.communityMutedUntil }).from(clients).where(eq(clients.userId, input.userId));
  const before = await mutedUntilFor(ctx.db, input.userId, c?.muted ?? null, ctx.now);
  await ctx.db.update(communityMutes).set({ until: ctx.now, updatedAt: ctx.now }).where(and(eq(communityMutes.userId, input.userId), gt(communityMutes.until, ctx.now)));
  if (c) await ctx.db.update(clients).set({ communityMutedUntil: null }).where(eq(clients.id, c.id));
  await writeAudit(ctx.db, ctx.actor, { action: "community.unmute", entity: "user", entityId: input.userId, before: { mutedUntil: before }, after: { mutedUntil: null }, reason: input.reason?.trim() || null });
}

export type ReportView = {
  id: string; targetType: TargetType; targetId: string; postId: string | null; reason: string; createdAt: string;
  reporter: string; preview: string | null; targetAuthor: string | null; targetAuthorUserId: string | null; targetHidden: boolean;
};

export async function reportsQueue(ctx: Ctx): Promise<ReportView[]> {
  needModerator(ctx);
  const rows = await ctx.db.select().from(communityReports).where(eq(communityReports.status, "open")).orderBy(asc(communityReports.createdAt)).limit(200);
  const targets = await Promise.all(rows.map((r) => loadTarget(ctx.db, r.targetType as TargetType, r.targetId)));
  const ppl = await people(ctx.db, [...rows.map((r) => r.reporterUserId), ...targets.flatMap((t) => (t ? [t.authorUserId] : []))]);
  return rows.map((r, i) => {
    const t = targets[i];
    return {
      id: r.id, targetType: r.targetType as TargetType, targetId: r.targetId, postId: t?.postId ?? null, reason: r.reason, createdAt: r.createdAt.toISOString(),
      reporter: ppl.get(r.reporterUserId)?.name ?? "Member", preview: t ? t.body.slice(0, 280) : null,
      targetAuthor: t ? ppl.get(t.authorUserId)?.name ?? "Member" : null, targetAuthorUserId: t?.authorUserId ?? null, targetHidden: Boolean(t?.hiddenAt),
    };
  });
}

/** Hide (with reason) or dismiss a report. */
export async function resolveReport(ctx: Ctx, input: { reportId: string; action: "hide" | "dismiss"; reason?: string | null }): Promise<void> {
  needModerator(ctx);
  const [r] = await ctx.db.select().from(communityReports).where(eq(communityReports.id, input.reportId));
  if (!r) throw new ServiceError("That report was not found.", "not_found");
  if (r.status !== "open") throw new ServiceError("That report is already resolved.");
  if (input.action === "hide") {
    await hide(ctx, { targetType: r.targetType as TargetType, targetId: r.targetId, reason: input.reason?.trim() || r.reason });
  }
  await ctx.db.update(communityReports).set({ status: "resolved", resolvedByUserId: ctx.actor.userId, resolvedAt: ctx.now, updatedAt: ctx.now })
    .where(eq(communityReports.id, r.id));
  if (input.action === "dismiss") {
    await writeAudit(ctx.db, ctx.actor, { action: "community.report.dismiss", entity: "community_reports", entityId: r.id, before: { status: "open" }, after: { status: "resolved" }, reason: input.reason?.trim() || null });
  }
}

export type HiddenItem = { targetType: TargetType; id: string; postId: string; preview: string; author: string; reason: string | null; hiddenAt: string; hiddenBy: string | null };

export async function hiddenItems(ctx: Ctx): Promise<HiddenItem[]> {
  needModerator(ctx);
  const [ps, cs] = await Promise.all([
    ctx.db.select().from(communityPosts).where(isNotNull(communityPosts.hiddenAt)).orderBy(desc(communityPosts.hiddenAt)).limit(100),
    ctx.db.select().from(communityComments).where(isNotNull(communityComments.hiddenAt)).orderBy(desc(communityComments.hiddenAt)).limit(100),
  ]);
  const ppl = await people(ctx.db, [...ps, ...cs].flatMap((x) => [x.authorUserId, ...(x.hiddenByUserId ? [x.hiddenByUserId] : [])]));
  const items: HiddenItem[] = [
    ...ps.map((p) => ({ targetType: "post" as const, id: p.id, postId: p.id, preview: p.body.slice(0, 200), author: ppl.get(p.authorUserId)?.name ?? "Member", reason: p.hiddenReason, hiddenAt: p.hiddenAt!.toISOString(), hiddenBy: p.hiddenByUserId ? ppl.get(p.hiddenByUserId)?.name ?? null : null })),
    ...cs.map((c) => ({ targetType: "comment" as const, id: c.id, postId: c.postId, preview: c.body.slice(0, 200), author: ppl.get(c.authorUserId)?.name ?? "Member", reason: c.hiddenReason, hiddenAt: c.hiddenAt!.toISOString(), hiddenBy: c.hiddenByUserId ? ppl.get(c.hiddenByUserId)?.name ?? null : null })),
  ];
  return items.sort((a, b) => (a.hiddenAt < b.hiddenAt ? 1 : -1));
}

export type MemberView = { userId: string; name: string; status: ClientStatus; access: CommunityAccess; mutedUntil: string | null; muteReason: string | null };

/** Members with an app account (clients), for the mute list. No contact details. */
export async function members(ctx: Ctx): Promise<MemberView[]> {
  needModerator(ctx);
  const { community: cs } = await loadSettings(ctx.db);
  const rows = await ctx.db.select({ userId: clients.userId, first: clients.firstName, last: clients.lastName, status: clients.status, endedAt: clients.endedAt, muted: clients.communityMutedUntil })
    .from(clients).where(and(isNotNull(clients.userId), inArray(clients.status, ["active", "paused", "ended"])))
    .orderBy(asc(clients.firstName), asc(clients.lastName));
  const mutes = await ctx.db.select().from(communityMutes).where(gt(communityMutes.until, ctx.now)).orderBy(desc(communityMutes.until));
  return rows.map((r) => {
    const m = mutes.find((x) => x.userId === r.userId);
    let mutedUntil: Date | null = r.muted && r.muted > ctx.now ? r.muted : null;
    if (m && (!mutedUntil || m.until > mutedUntil)) mutedUntil = m.until;
    return {
      userId: r.userId!, name: displayName(r.first, r.last), status: r.status as ClientStatus,
      access: communityAccess({ roles: ["client"], clientStatus: r.status as ClientStatus, endedAt: r.endedAt, mutedUntil }, ctx.now, cs),
      mutedUntil: mutedUntil?.toISOString() ?? null, muteReason: mutedUntil ? m?.reason ?? null : null,
    };
  });
}

// ---------- challenges ----------

export type ChallengeSummary = {
  id: string; title: string; question: string; startsOn: string; endsOn: string; state: "upcoming" | "active" | "ended";
  participants: number; myDays: number; checkedInToday: boolean;
};

function challengeState(c: { startsOn: string; endsOn: string }, today: string): ChallengeSummary["state"] {
  if (compareDates(today, c.startsOn) < 0) return "upcoming";
  if (compareDates(today, c.endsOn) > 0) return "ended";
  return "active";
}

export async function createChallenge(ctx: Ctx, input: { title: string; question: string; startsOn: string; endsOn: string }): Promise<{ id: string }> {
  const v = await needPost(ctx);
  needCoach(v);
  const title = (input.title ?? "").trim();
  const question = (input.question ?? "").trim();
  if (!title) throw new ServiceError("Give the challenge a title.");
  if (!question) throw new ServiceError("Write the daily check-in question.");
  if (!isDateStr(input.startsOn) || !isDateStr(input.endsOn)) throw new ServiceError("Pick a start and end date.");
  if (compareDates(input.endsOn, input.startsOn) < 0) throw new ServiceError("The end date must be on or after the start date.");
  if (compareDates(input.endsOn, addisDate(ctx.now)) < 0) throw new ServiceError("The challenge would already be over. Pick dates from today on.");
  const [row] = await ctx.db.insert(challenges).values({ title, question, startsOn: input.startsOn, endsOn: input.endsOn, createdByUserId: v.actor.userId })
    .returning({ id: challenges.id });
  const membersIds = (await activeMemberUserIds(ctx.db)).filter((id) => id !== v.actor.userId);
  await notify(ctx.db, {
    userIds: membersIds, kind: "community.challenge", title: `New challenge: ${title}`, body: question,
    link: `/app/community/challenges/${row.id}`, dedupeKey: `community-challenge:${row.id}`, telegram: "digest",
  });
  return row;
}

export async function listChallenges(ctx: Ctx): Promise<{ challenges: ChallengeSummary[]; viewer: PublicViewer }> {
  const v = await needRead(ctx);
  const today = addisDate(ctx.now);
  const rows = await ctx.db.select().from(challenges).orderBy(desc(challenges.startsOn)).limit(50);
  const ids = rows.map((r) => r.id);
  const stats = ids.length === 0 ? [] : await ctx.db.select({
    id: challengeCheckins.challengeId,
    participants: sql<number>`count(distinct ${challengeCheckins.userId})::int`,
    mine: sql<number>`count(*) filter (where ${challengeCheckins.userId} = ${v.actor.userId})::int`,
    today: sql<number>`count(*) filter (where ${challengeCheckins.userId} = ${v.actor.userId} and ${challengeCheckins.checkinDate} = ${today})::int`,
  }).from(challengeCheckins).where(inArray(challengeCheckins.challengeId, ids)).groupBy(challengeCheckins.challengeId);
  const list = rows.map((r) => {
    const s = stats.find((x) => x.id === r.id);
    return {
      id: r.id, title: r.title, question: r.question, startsOn: r.startsOn, endsOn: r.endsOn, state: challengeState(r, today),
      participants: s?.participants ?? 0, myDays: s?.mine ?? 0, checkedInToday: (s?.today ?? 0) > 0,
    };
  });
  const order = { active: 0, upcoming: 1, ended: 2 } as const;
  list.sort((a, b) => order[a.state] - order[b.state]);
  return { challenges: list, viewer: publicViewer(v) };
}

export type ChallengeDetail = ChallengeSummary & {
  today: string; myStreak: number; canCheckIn: boolean;
  leaderboard: { rank: number; userId: string; name: string; avatarUrl: string | null; days: number; me: boolean }[];
  viewer: PublicViewer;
};

export async function challengeDetail(ctx: Ctx, id: string): Promise<ChallengeDetail> {
  const v = await needRead(ctx);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceError("That challenge was not found.", "not_found");
  const [c] = await ctx.db.select().from(challenges).where(eq(challenges.id, id));
  if (!c) throw new ServiceError("That challenge was not found.", "not_found");
  const today = addisDate(ctx.now);
  const all = await ctx.db.select({ userId: challengeCheckins.userId, checkinDate: challengeCheckins.checkinDate }).from(challengeCheckins)
    .where(eq(challengeCheckins.challengeId, c.id));
  const mine = all.filter((x) => x.userId === v.actor.userId).map((x) => x.checkinDate);
  const board = leaderboard(all).slice(0, 20);
  const ppl = await people(ctx.db, board.map((b) => b.userId));
  const state = challengeState(c, today);
  const checkedInToday = mine.includes(today);
  // a streak counts up to the last day of the challenge
  const streakDay = compareDates(today, c.endsOn) > 0 ? c.endsOn : today;
  let rank = 0;
  let prev = -1;
  return {
    id: c.id, title: c.title, question: c.question, startsOn: c.startsOn, endsOn: c.endsOn, state,
    participants: new Set(all.map((x) => x.userId)).size, myDays: new Set(mine).size, checkedInToday,
    today, myStreak: streak(mine, streakDay), canCheckIn: canPost(v.access) && state === "active" && !checkedInToday,
    leaderboard: board.map((b, i) => {
      if (b.days !== prev) { rank = i + 1; prev = b.days; }
      const p = ppl.get(b.userId) ?? unknownPerson(b.userId);
      return { rank, userId: b.userId, name: p.name, avatarUrl: p.avatarUrl, days: b.days, me: b.userId === v.actor.userId };
    }),
    viewer: publicViewer(v),
  };
}

/** "Yes, I did it today": once per Addis day, only between the start and end dates, full-access members. */
export async function checkInChallenge(ctx: Ctx, id: string): Promise<{ myStreak: number; myDays: number }> {
  const v = await needPost(ctx);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceError("That challenge was not found.", "not_found");
  const [c] = await ctx.db.select().from(challenges).where(eq(challenges.id, id));
  if (!c) throw new ServiceError("That challenge was not found.", "not_found");
  const today = addisDate(ctx.now);
  if (compareDates(today, c.startsOn) < 0) throw new ServiceError("This challenge has not started yet.");
  if (compareDates(today, c.endsOn) > 0) throw new ServiceError("This challenge has ended.");
  const ins = await ctx.db.insert(challengeCheckins).values({ challengeId: c.id, userId: v.actor.userId, checkinDate: today })
    .onConflictDoNothing().returning({ id: challengeCheckins.id });
  if (ins.length === 0) throw new ServiceError("You already checked in today. Come back tomorrow.");
  const mine = await ctx.db.select({ d: challengeCheckins.checkinDate }).from(challengeCheckins)
    .where(and(eq(challengeCheckins.challengeId, c.id), eq(challengeCheckins.userId, v.actor.userId)));
  const dates = mine.map((m) => m.d);
  return { myStreak: streak(dates, today), myDays: new Set(dates).size };
}

/**
 * Challenge reminders for a daily job (COM-13): active members who have not checked in today on a running challenge
 * get an in-app note that rides the daily Telegram digest. Deduplicated per challenge, user and day.
 */
export async function sendChallengeReminders(db: DbOrTx, now: Date): Promise<number> {
  const today = addisDate(now);
  const running = await db.select().from(challenges)
    .where(and(sql`${challenges.startsOn} <= ${today}`, sql`${challenges.endsOn} >= ${today}`));
  if (running.length === 0) return 0;
  const memberIds = await activeMemberUserIds(db);
  let n = 0;
  for (const c of running) {
    const done = await db.select({ userId: challengeCheckins.userId }).from(challengeCheckins)
      .where(and(eq(challengeCheckins.challengeId, c.id), eq(challengeCheckins.checkinDate, today)));
    const doneSet = new Set(done.map((d) => d.userId));
    n += await notify(db, {
      userIds: memberIds.filter((u) => !doneSet.has(u)), kind: "community.challenge-reminder", title: `${c.title}: check in today`,
      body: c.question, link: `/app/community/challenges/${c.id}`, dedupeKey: `challenge-reminder:${c.id}:${today}`, telegram: "digest",
    });
  }
  return n;
}

/** Recent posts for coach tools (pin / unpin). */
export async function recentPostsForCoach(ctx: Ctx, limit = 15): Promise<FeedPost[]> {
  const v = await needRead(ctx);
  needCoach(v);
  const rows = await ctx.db.select().from(communityPosts).where(isNull(communityPosts.hiddenAt))
    .orderBy(desc(communityPosts.pinned), desc(communityPosts.createdAt)).limit(limit);
  return decoratePosts(ctx.db, v, rows);
}

