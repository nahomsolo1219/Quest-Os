// Community services against a real database (each test in a rolled-back transaction):
// feed order + pagination, photos, hidden posts, access levels (paused / ended / muted), comments, reactions,
// coach-only answer + pin, reports, moderation audit rows, no contact details (SEC-13), challenge check-ins.
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../schema";
import type { Ctx } from "../../src/server/services/context";
import * as com from "../../src/server/services/community";
import { ForbiddenError, type Actor } from "../../src/server/authz";
import { storage } from "../../src/server/storage";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Monday 19 Oct 2026, 12:00 Addis
const NOW = new Date("2026-10-19T09:00:00Z");
const ctxOf = (tx: Tx, actor: Actor, now = NOW): Ctx => ({ db: tx, actor, now });

// 1×1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const png = (name = "a.png") => new File([PNG], name, { type: "image/png" });

async function staff(tx: Tx, email: string): Promise<Actor> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { userId: u.id, roles: u.roles, clientId: null, name: u.name };
}
async function member(tx: Tx, phone: string): Promise<Actor & { clientRowId: string }> {
  const [r] = await tx.select({ u: s.user, c: s.clients }).from(s.clients).innerJoin(s.user, eq(s.user.id, s.clients.userId)).where(eq(s.clients.phone, phone));
  return { userId: r.u.id, roles: r.u.roles, clientId: r.c.id, name: r.u.name, clientRowId: r.c.id };
}
const ABEL = "+251911000001"; // active
const SARA = "+251911000002"; // active
const SAMUEL = "+251911000009"; // paused

async function count(tx: Tx, q: string) {
  const r = await tx.execute(sql.raw(q));
  return (r as unknown as { n: number }[])[0].n;
}

async function post(tx: Tx, authorUserId: string, body: string, createdAt: Date, extra: Partial<typeof s.communityPosts.$inferInsert> = {}) {
  const [p] = await tx.insert(s.communityPosts).values({ authorUserId, body, createdAt, updatedAt: createdAt, ...extra }).returning();
  return p;
}

describe("feed", () => {
  it("puts pinned posts on top, then newest first, and paginates by the page size", async () => {
    await inRollback(db, async (tx) => {
      await tx.delete(s.communityPosts);
      const abel = await member(tx, ABEL);
      await tx.insert(s.settings).values({ key: "community", value: { pageSize: 3 } })
        .onConflictDoUpdate({ target: s.settings.key, set: { value: { pageSize: 3 } } });
      const base = new Date("2026-10-18T06:00:00Z").getTime();
      const ids: string[] = [];
      for (let i = 0; i < 7; i++) ids.push((await post(tx, abel.userId, `post ${i}`, new Date(base + i * 60_000))).id);
      const pin = await post(tx, abel.userId, "old pinned", new Date(base - 86_400_000), { pinned: true });

      const p1 = await com.feed(ctxOf(tx, abel));
      expect(p1.pinned.map((p) => p.id)).toEqual([pin.id]);
      expect(p1.posts.map((p) => p.body)).toEqual(["post 6", "post 5", "post 4"]);
      expect(p1.nextCursor).toBeTruthy();
      const p2 = await com.feed(ctxOf(tx, abel), { cursor: p1.nextCursor });
      expect(p2.pinned).toEqual([]);
      expect(p2.posts.map((p) => p.body)).toEqual(["post 3", "post 2", "post 1"]);
      const p3 = await com.feed(ctxOf(tx, abel), { cursor: p2.nextCursor });
      expect(p3.posts.map((p) => p.body)).toEqual(["post 0"]);
      expect(p3.nextCursor).toBeNull();

      // equal timestamps still page without repeats (id tie-break)
      await tx.delete(s.communityPosts);
      const same = new Date(base);
      for (let i = 0; i < 5; i++) await post(tx, abel.userId, `same ${i}`, same);
      const a = await com.feed(ctxOf(tx, abel));
      const b = await com.feed(ctxOf(tx, abel), { cursor: a.nextCursor });
      const seen = [...a.posts, ...b.posts].map((p) => p.id);
      expect(new Set(seen).size).toBe(5);

      // type filter
      await post(tx, abel.userId, "a question", new Date(base + 1000), { type: "question" });
      const q = await com.feed(ctxOf(tx, abel), { type: "question" });
      expect(q.posts.map((p) => p.body)).toEqual(["a question"]);
    });
  });

  it("hides hidden posts from members but shows them to operations with the reason", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const sara = await member(tx, SARA);
      const ops = await staff(tx, "nebiyou@questmeals.demo");
      const { id } = await com.createPost(ctxOf(tx, sara), { type: "post", body: "Spam spam" });
      await com.hide(ctxOf(tx, ops), { targetType: "post", targetId: id, reason: "Spam" });
      const memberFeed = await com.feed(ctxOf(tx, abel));
      expect([...memberFeed.pinned, ...memberFeed.posts].some((p) => p.id === id)).toBe(false);
      await expect(com.postDetail(ctxOf(tx, abel), id)).rejects.toThrow(/not found/);
      const opsFeed = await com.feed(ctxOf(tx, ops));
      const seen = opsFeed.posts.find((p) => p.id === id);
      expect(seen?.hidden).toEqual({ reason: "Spam" });
    });
  });

  it("never includes phone numbers, addresses or emails (SEC-13)", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const sara = await member(tx, SARA);
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "question", body: "What should I eat before training?" });
      await com.addComment(ctxOf(tx, sara), { postId: id, body: "Banana works for me" });
      await com.react(ctxOf(tx, sara), id, "fire");
      const ops = await staff(tx, "nebiyou@questmeals.demo");
      await com.report(ctxOf(tx, sara), { targetType: "post", targetId: id, reason: "test" });
      const json = JSON.stringify([
        await com.feed(ctxOf(tx, abel)), await com.postDetail(ctxOf(tx, abel), id), await com.listChallenges(ctxOf(tx, abel)),
        await com.feed(ctxOf(tx, ops)), await com.reportsQueue(ctxOf(tx, ops)), await com.members(ctxOf(tx, ops)), await com.hiddenItems(ctxOf(tx, ops)),
      ]);
      const all = await tx.select({ phone: s.clients.phone, address: s.clients.address, email: s.clients.email }).from(s.clients);
      const emails = await tx.select({ email: s.user.email }).from(s.user);
      for (const c of all) {
        expect(json).not.toContain(c.phone);
        expect(json).not.toContain(c.phone.replace("+251", "0"));
        if (c.address) expect(json).not.toContain(c.address);
      }
      for (const e of emails) expect(json).not.toContain(e.email);
      expect(json).not.toMatch(/\+251\d{9}/);
      expect(json).toContain("Abel T.");
      expect(json).toContain("Sara M.");
    });
  });
});

describe("posting", () => {
  it("allows at most 4 photos and stores them under community/ with signed URLs", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      await expect(com.createPost(ctxOf(tx, abel), { type: "post", body: "Too many", photos: [png(), png(), png(), png(), png()] }))
        .rejects.toThrow(/at most 4 photos/);
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "post", body: "Lunch", photos: [png(), png()] });
      const [row] = await tx.select().from(s.communityPosts).where(eq(s.communityPosts.id, id));
      expect(row.photoKeys).toHaveLength(2);
      expect(row.photoKeys.every((k) => k.startsWith(`community/${abel.userId}/`))).toBe(true);
      const d = await com.postDetail(ctxOf(tx, abel), id);
      expect(d.post.photos).toHaveLength(2);
      expect(d.post.photos[0]).not.toContain(".png?"); // signed URL, not a bare key
      for (const k of row.photoKeys) await storage().delete(k);
    });
  });

  it("attaches progress from the author's own check-ins only when share is ticked", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const a = await com.createPost(ctxOf(tx, abel), { type: "progress", body: "Week 3", shareProgress: false });
      const b = await com.createPost(ctxOf(tx, abel), { type: "progress", body: "Week 3 with numbers", shareProgress: true });
      const [ra] = await tx.select().from(s.communityPosts).where(eq(s.communityPosts.id, a.id));
      const [rb] = await tx.select().from(s.communityPosts).where(eq(s.communityPosts.id, b.id));
      expect(ra.progress).toBeNull();
      expect(rb.progress).toEqual({ kgChange: -1.1, weeks: 2 }); // seed: 92.0 → 90.9 kg over two weeks
      const d = await com.postDetail(ctxOf(tx, abel), b.id);
      expect(d.post.progressText).toBe("−1.1 kg in 2 weeks");
    });
  });

  it("lets only coaches post announcements, and notifies active members (digest)", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const dagi = await staff(tx, "dagi@questmeals.demo");
      await expect(com.createPost(ctxOf(tx, abel), { type: "announcement", body: "Hi all" })).rejects.toThrow(ForbiddenError);
      const { id } = await com.createPost(ctxOf(tx, dagi), { type: "announcement", body: "New menu next week" });
      const n = await count(tx, `select count(*)::int as n from notifications where dedupe_key like 'community-announcement:${id}:%' and telegram_status = 'digest'`);
      const active = await count(tx, "select count(*)::int as n from clients where status = 'active' and user_id is not null");
      expect(n).toBe(active);
      const f = await com.feed(ctxOf(tx, abel));
      expect(f.posts.find((p) => p.id === id)?.author).toMatchObject({ name: "Dagi B.", coach: true });
    });
  });
});

describe("access levels", () => {
  it("paused members can read and react but not post or comment", async () => {
    await inRollback(db, async (tx) => {
      const samuel = await member(tx, SAMUEL);
      const abel = await member(tx, ABEL);
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "post", body: "Hello" });
      const v = await com.viewer(ctxOf(tx, samuel));
      expect(v.access).toBe("react");
      expect(v.limit).toBe("paused");
      await com.feed(ctxOf(tx, samuel));
      const r = await com.react(ctxOf(tx, samuel), id, "strong");
      expect(r.reactions.strong).toBe(1);
      await expect(com.createPost(ctxOf(tx, samuel), { type: "post", body: "Can I?" })).rejects.toThrow(/paused/);
      await expect(com.addComment(ctxOf(tx, samuel), { postId: id, body: "Nice" })).rejects.toThrow(ForbiddenError);
    });
  });

  it("ended members keep read + react for 14 days, then lose access", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      await tx.update(s.clients).set({ status: "ended", endedAt: "2026-10-05" }).where(eq(s.clients.id, abel.clientRowId)); // day 14
      expect((await com.viewer(ctxOf(tx, abel))).access).toBe("react");
      await com.feed(ctxOf(tx, abel));
      await tx.update(s.clients).set({ endedAt: "2026-10-04" }).where(eq(s.clients.id, abel.clientRowId)); // day 15
      await expect(com.feed(ctxOf(tx, abel))).rejects.toThrow(ForbiddenError);
    });
  });

  it("muted members cannot post until the mute ends; mute and unmute write audit rows", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const ops = await staff(tx, "nebiyou@questmeals.demo");
      const { until } = await com.mute(ctxOf(tx, ops), { userId: abel.userId, days: 1, reason: "Rude comments" });
      expect(until.toISOString()).toBe("2026-10-20T09:00:00.000Z");
      await expect(com.createPost(ctxOf(tx, abel), { type: "post", body: "Hi" })).rejects.toThrow(/muted/);
      expect((await com.viewer(ctxOf(tx, abel))).limit).toBe("muted");
      // after the mute ends
      await com.createPost(ctxOf(tx, abel, new Date("2026-10-20T09:00:01Z")), { type: "post", body: "Back" });
      await com.mute(ctxOf(tx, ops), { userId: abel.userId, hours: 3, reason: "Again" });
      await com.unmute(ctxOf(tx, ops), { userId: abel.userId });
      await com.createPost(ctxOf(tx, abel), { type: "post", body: "Unmuted" });
      expect(await count(tx, `select count(*)::int as n from audit_log where action = 'community.mute' and entity_id = '${abel.userId}' and reason is not null`)).toBe(2);
      expect(await count(tx, `select count(*)::int as n from audit_log where action = 'community.unmute' and entity_id = '${abel.userId}'`)).toBe(1);
      // members cannot moderate
      await expect(com.mute(ctxOf(tx, abel), { userId: ops.userId, days: 1, reason: "x" })).rejects.toThrow(ForbiddenError);
    });
  });
});

describe("comments, reactions, answers, pins", () => {
  it("comments are one level deep and notify the post author (digest)", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const sara = await member(tx, SARA);
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "post", body: "Hello" });
      const c = await com.addComment(ctxOf(tx, sara), { postId: id, body: "Hi Abel" });
      // a reply to a comment is not possible: comment ids are not posts
      await expect(com.addComment(ctxOf(tx, sara), { postId: c.id, body: "nested" })).rejects.toThrow(/not found/);
      const cols = await tx.execute(sql`select column_name from information_schema.columns where table_name = 'community_comments'`);
      expect((cols as unknown as { column_name: string }[]).map((x) => x.column_name)).not.toContain("parent_id");
      const [n] = await tx.select().from(s.notifications).where(eq(s.notifications.dedupeKey, `community-reply:${c.id}:${abel.userId}`));
      expect(n.telegramStatus).toBe("digest");
      // own comment does not notify
      const own = await com.addComment(ctxOf(tx, abel), { postId: id, body: "Thanks" });
      expect(await count(tx, `select count(*)::int as n from notifications where dedupe_key like 'community-reply:${own.id}:%'`)).toBe(0);
    });
  });

  it("keeps one reaction per user per post: set, change, remove", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const sara = await member(tx, SARA);
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "post", body: "Hello" });
      await com.react(ctxOf(tx, sara), id, "like");
      const r = await com.react(ctxOf(tx, sara), id, "fire");
      expect(r.reactions).toEqual({ like: 0, fire: 1, strong: 0 });
      expect(await count(tx, `select count(*)::int as n from community_reactions where post_id = '${id}'`)).toBe(1);
      const d = await com.postDetail(ctxOf(tx, sara), id);
      expect(d.post.myReaction).toBe("fire");
      const off = await com.react(ctxOf(tx, sara), id, null);
      expect(off.reactions.fire).toBe(0);
    });
  });

  it("only coaches mark the answer to a question and pin posts", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const dagi = await staff(tx, "dagi@questmeals.demo");
      const ops = await staff(tx, "nebiyou@questmeals.demo");
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "question", body: "How much water?" });
      const reply = await com.addComment(ctxOf(tx, dagi), { postId: id, body: "About 3 litres." });
      await expect(com.markAnswer(ctxOf(tx, abel), id, reply.id)).rejects.toThrow(ForbiddenError);
      await expect(com.markAnswer(ctxOf(tx, ops), id, reply.id)).rejects.toThrow(ForbiddenError);
      await com.markAnswer(ctxOf(tx, dagi), id, reply.id);
      const d = await com.postDetail(ctxOf(tx, abel), id);
      expect(d.post.answered).toBe(true);
      expect(d.comments[0]).toMatchObject({ id: reply.id, isAnswer: true });
      expect(d.comments[0].author.coach).toBe(true);

      await expect(com.pinPost(ctxOf(tx, abel), id, true)).rejects.toThrow(ForbiddenError);
      await expect(com.pinPost(ctxOf(tx, ops), id, true)).rejects.toThrow(ForbiddenError);
      await com.pinPost(ctxOf(tx, dagi), id, true);
      expect((await com.feed(ctxOf(tx, abel))).pinned.some((p) => p.id === id)).toBe(true);

      const plain = await com.createPost(ctxOf(tx, abel), { type: "post", body: "Not a question" });
      await expect(com.markAnswer(ctxOf(tx, dagi), plain.id, reply.id)).rejects.toThrow(/Only questions/);
    });
  });
});

describe("reports and moderation", () => {
  it("a report goes to the queue and notifies operations on Telegram now; hide resolves it with an audit row", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const samuel = await member(tx, SAMUEL); // paused members can still report
      const ops = await staff(tx, "nebiyou@questmeals.demo");
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "post", body: "Something rude" });
      const r = await com.report(ctxOf(tx, samuel), { targetType: "post", targetId: id, reason: "Rude" });
      const [n] = await tx.select().from(s.notifications).where(eq(s.notifications.dedupeKey, `community-report:${r.id}:${ops.userId}`));
      expect(n.kind).toBe("community.report");
      expect(n.telegramStatus).not.toBe("digest"); // sent right away (or none when no bot is configured)
      const q = await com.reportsQueue(ctxOf(tx, ops));
      expect(q.find((x) => x.id === r.id)).toMatchObject({ reporter: "Samuel K.", targetAuthor: "Abel T.", preview: "Something rude" });
      await expect(com.reportsQueue(ctxOf(tx, abel))).rejects.toThrow(ForbiddenError);

      await com.resolveReport(ctxOf(tx, ops), { reportId: r.id, action: "hide", reason: "Insulting" });
      const [report] = await tx.select().from(s.communityReports).where(eq(s.communityReports.id, r.id));
      expect(report.status).toBe("resolved");
      const [audit] = await tx.select().from(s.auditLog).where(and(eq(s.auditLog.action, "community.hide"), eq(s.auditLog.entityId, id)));
      expect(audit).toMatchObject({ actorUserId: ops.userId, entity: "community_posts", reason: "Insulting" });
      expect((await com.hiddenItems(ctxOf(tx, ops))).some((h) => h.id === id)).toBe(true);
      await expect(com.hide(ctxOf(tx, ops), { targetType: "post", targetId: id, reason: " " })).rejects.toThrow(/reason/);

      await com.unhide(ctxOf(tx, ops), { targetType: "post", targetId: id });
      expect(await count(tx, `select count(*)::int as n from audit_log where action = 'community.unhide' and entity_id = '${id}'`)).toBe(1);
      expect((await com.feed(ctxOf(tx, abel))).posts.some((p) => p.id === id)).toBe(true);
    });
  });

  it("hidden comments disappear for members", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const sara = await member(tx, SARA);
      const ops = await staff(tx, "nebiyou@questmeals.demo");
      const { id } = await com.createPost(ctxOf(tx, abel), { type: "post", body: "Hello" });
      const c = await com.addComment(ctxOf(tx, sara), { postId: id, body: "bad words" });
      await com.hide(ctxOf(tx, ops), { targetType: "comment", targetId: c.id, reason: "Language" });
      const d = await com.postDetail(ctxOf(tx, abel), id);
      expect(d.comments).toHaveLength(0);
      expect(d.post.commentCount).toBe(0);
      expect((await com.postDetail(ctxOf(tx, ops), id)).comments[0].hidden).toEqual({ reason: "Language" });
    });
  });
});

describe("challenges", () => {
  it("check-in once per Addis day within the dates; streak and leaderboard", async () => {
    await inRollback(db, async (tx) => {
      const abel = await member(tx, ABEL);
      const sara = await member(tx, SARA);
      const samuel = await member(tx, SAMUEL);
      const dagi = await staff(tx, "dagi@questmeals.demo");
      await expect(com.createChallenge(ctxOf(tx, abel), { title: "x", question: "y", startsOn: "2026-10-19", endsOn: "2026-10-25" })).rejects.toThrow(ForbiddenError);
      const { id } = await com.createChallenge(ctxOf(tx, dagi), { title: "Water", question: "Did you drink 3 litres?", startsOn: "2026-10-17", endsOn: "2026-10-23" });
      expect(await count(tx, `select count(*)::int as n from notifications where dedupe_key like 'community-challenge:${id}:%' and telegram_status = 'digest'`)).toBeGreaterThan(0);

      // Abel: Sat 17, Sun 18, Mon 19 (Addis). 20:59 UTC Sunday = 23:59 Addis Sunday.
      await com.checkInChallenge(ctxOf(tx, abel, new Date("2026-10-17T07:00:00Z")), id);
      await com.checkInChallenge(ctxOf(tx, abel, new Date("2026-10-18T20:59:00Z")), id);
      const r = await com.checkInChallenge(ctxOf(tx, abel), id);
      expect(r).toEqual({ myStreak: 3, myDays: 3 });
      // same Addis day again (Monday 23:30 Addis = 20:30 UTC)
      await expect(com.checkInChallenge(ctxOf(tx, abel, new Date("2026-10-19T20:30:00Z")), id)).rejects.toThrow(/already checked in/);
      // Sara: Saturday and today, so streak 1, days 2
      await com.checkInChallenge(ctxOf(tx, sara, new Date("2026-10-17T07:00:00Z")), id);
      await com.checkInChallenge(ctxOf(tx, sara), id);
      // paused members cannot join in
      await expect(com.checkInChallenge(ctxOf(tx, samuel), id)).rejects.toThrow(ForbiddenError);
      // outside the dates
      await expect(com.checkInChallenge(ctxOf(tx, sara, new Date("2026-10-24T07:00:00Z")), id)).rejects.toThrow(/ended/);
      await expect(com.checkInChallenge(ctxOf(tx, sara, new Date("2026-10-16T07:00:00Z")), id)).rejects.toThrow(/not started/);

      const d = await com.challengeDetail(ctxOf(tx, sara), id);
      expect(d).toMatchObject({ myStreak: 1, myDays: 2, checkedInToday: true, canCheckIn: false, state: "active", participants: 2 });
      expect(d.leaderboard.map((x) => [x.rank, x.name, x.days, x.me])).toEqual([[1, "Abel T.", 3, false], [2, "Sara M.", 2, true]]);
      const tomorrow = await com.challengeDetail(ctxOf(tx, abel, new Date("2026-10-20T07:00:00Z")), id);
      expect(tomorrow).toMatchObject({ myStreak: 3, checkedInToday: false, canCheckIn: true });
      const list = await com.listChallenges(ctxOf(tx, abel));
      expect(list.challenges.find((c) => c.id === id)).toMatchObject({ state: "active", myDays: 3, checkedInToday: true });

      // reminders: once per challenge, user and day; not for those already checked in
      const sent = await com.sendChallengeReminders(tx, NOW);
      expect(await count(tx, `select count(*)::int as n from notifications where dedupe_key = 'challenge-reminder:${id}:2026-10-19:${abel.userId}'`)).toBe(0);
      expect(sent).toBeGreaterThan(0);
      expect(await com.sendChallengeReminders(tx, NOW)).toBe(0);
    });
  });
});
