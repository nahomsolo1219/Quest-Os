// Notifications: in-app always; Telegram only with a bot token and a linked chat (NOT-02, NOT-03); digest (COM-13).
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "../schema";
import { notify, sendCommunityDigests } from "../../src/server/services/notifications";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
afterEach(() => { vi.unstubAllGlobals(); delete process.env.TELEGRAM_BOT_TOKEN; });

async function twoUsers(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const users = await tx.select().from(s.user).limit(2);
  await tx.insert(s.telegramLinks).values({ userId: users[0].id, chatId: "1001", linkedAt: new Date() });
  return users;
}

describe("notifications", () => {
  it("without a bot token: in-app only, nothing sent, app keeps working (NOT-03)", async () => {
    await inRollback(db, async (tx) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const [a, b] = await twoUsers(tx);
      const n = await notify(tx, { userIds: [a.id, b.id], kind: "test", title: "Hello", dedupeKey: "t1" });
      expect(n).toBe(2);
      expect(fetchMock).not.toHaveBeenCalled();
      const rows = await tx.select().from(s.notifications).where(eq(s.notifications.kind, "test"));
      expect(rows.map((r) => r.telegramStatus).sort()).toEqual(["none", "none"]);
      expect(await notify(tx, { userIds: [a.id, b.id], kind: "test", title: "Hello", dedupeKey: "t1" })).toBe(0); // deduplicated
    });
  });

  it("with a bot token: sends to linked users only and records the status (NOT-02)", async () => {
    await inRollback(db, async (tx) => {
      process.env.TELEGRAM_BOT_TOKEN = "123:abc";
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const [a, b] = await twoUsers(tx);
      await notify(tx, { userIds: [a.id, b.id], kind: "test", title: "Lock done", body: "8 locked", dedupeKey: "t2" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
      expect(JSON.parse(String(init.body)).chat_id).toBe("1001");
      const rows = await tx.select().from(s.notifications).where(eq(s.notifications.kind, "test"));
      expect(rows.find((r) => r.userId === a.id)?.telegramStatus).toBe("sent");
      expect(rows.find((r) => r.userId === b.id)?.telegramStatus).toBe("none");
    });
  });

  it("community notifications wait for one daily digest per user (COM-13)", async () => {
    await inRollback(db, async (tx) => {
      process.env.TELEGRAM_BOT_TOKEN = "123:abc";
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const [a] = await twoUsers(tx);
      await notify(tx, { userIds: [a.id], kind: "community.reply", title: "New reply", dedupeKey: "d1", telegram: "digest" });
      await notify(tx, { userIds: [a.id], kind: "community.announcement", title: "Coach post", dedupeKey: "d2", telegram: "digest" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await sendCommunityDigests(tx)).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await sendCommunityDigests(tx)).toBe(0);
    });
  });
});
