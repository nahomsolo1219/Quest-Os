// Telegram bot webhook (NOT-04, APP-10). Telegram POSTs updates with the secret token header we registered.
// Only "/start <token>" is handled: it completes a one-time link; everything else is ignored.
import { timingSafeEqual } from "node:crypto";
import { db } from "@db/client";
import { now } from "@/server/clock";
import { completeTelegramLink } from "@/server/services/notifications";
import { sendTelegram } from "@/server/telegram";

export const dynamic = "force-dynamic";

function secretOk(given: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Update = { message?: { text?: string; chat?: { id?: number | string } } };

export async function POST(req: Request): Promise<Response> {
  if (!secretOk(req.headers.get("x-telegram-bot-api-secret-token"))) return new Response("forbidden", { status: 401 });
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return Response.json({ ok: true });
  }
  const text = update.message?.text?.trim() ?? "";
  const chatId = update.message?.chat?.id;
  const m = /^\/start(?:@\w+)?\s+([a-f0-9]{32})$/i.exec(text);
  if (!m || chatId == null) return Response.json({ ok: true });
  const linked = await completeTelegramLink(db, m[1].toLowerCase(), String(chatId), now());
  await sendTelegram(String(chatId), linked
    ? "Quest Meals: Telegram is connected. You will get your notifications here."
    : "Quest Meals: this link has expired or was already used. Open your profile in the app and tap \"Connect Telegram\" again.");
  return Response.json({ ok: true, linked });
}
