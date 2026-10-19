// Telegram opt-in by deep link with a one-time token (NOT-04, APP-10) and the webhook's secret check.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "../schema";
import { loadActor } from "../../src/server/authz";
import { completeTelegramLink, telegramStatus } from "../../src/server/services/notifications";
import { connectTelegram, disconnectTelegram } from "../../src/server/services/client-app";
import { POST } from "../../src/app/api/telegram/webhook/route";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
const NOW = new Date("2026-10-19T07:00:00Z");

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("Telegram link token", () => {
  it("works once, sets the client's opt-in, and expires after an hour", async () => {
    await inRollback(db, async (tx) => {
      process.env.TELEGRAM_BOT_USERNAME = "QuestMealsBot";
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.phone, "+251911000002"));
      const actor = (await loadActor(tx, c.userId!))!;
      const ctx = { db: tx, actor, now: NOW };
      const { link } = await connectTelegram(ctx);
      expect(link).toMatch(/^https:\/\/t\.me\/QuestMealsBot\?start=[a-f0-9]{32}$/);
      const token = link!.split("start=")[1];
      const [after] = await tx.select().from(s.clients).where(eq(s.clients.id, c.id));
      expect(after.telegramOptIn).toBe(true);

      expect(await completeTelegramLink(tx, token, "5550001", new Date(NOW.getTime() + 60_000))).toBe(true);
      expect(await completeTelegramLink(tx, token, "5550002", new Date(NOW.getTime() + 120_000))).toBe(false); // once only
      expect((await telegramStatus(ctx)).linked).toBe(true);

      const second = await connectTelegram(ctx);
      const t2 = second.link!.split("start=")[1];
      expect(await completeTelegramLink(tx, t2, "5550003", new Date(NOW.getTime() + 61 * 60_000))).toBe(false); // expired

      await disconnectTelegram(ctx);
      expect((await telegramStatus(ctx)).linked).toBe(false);
    });
  });

  it("without a bot username there is no link (Telegram is not set up yet)", async () => {
    await inRollback(db, async (tx) => {
      delete process.env.TELEGRAM_BOT_USERNAME;
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.phone, "+251911000002"));
      const actor = (await loadActor(tx, c.userId!))!;
      expect((await connectTelegram({ db: tx, actor, now: NOW })).link).toBeNull();
    });
  });
});

describe("Telegram webhook", () => {
  const req = (secret: string | null, body: unknown) => new Request("http://localhost/api/telegram/webhook", {
    method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
    body: JSON.stringify(body),
  });

  it("rejects a wrong or missing secret", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "right-secret";
    expect((await POST(req("wrong-secret", { message: { text: "/start abc", chat: { id: 1 } } }))).status).toBe(401);
    expect((await POST(req(null, {}))).status).toBe(401);
  });

  it("rejects everything when no secret is configured", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect((await POST(req("anything", {}))).status).toBe(401);
  });

  it("accepts the right secret and ignores messages that are not /start <token>", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "right-secret";
    const res = await POST(req("right-secret", { message: { text: "hello", chat: { id: 1 } } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
