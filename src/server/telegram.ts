// Minimal Telegram Bot API client. Without TELEGRAM_BOT_TOKEN every call is a no-op that
// reports "skipped", so the app keeps working with in-app notifications only.
export type TelegramResult = "sent" | "skipped" | "failed";

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegram(chatId: string, text: string): Promise<TelegramResult> {
  // Demo copy: nothing leaves the app; the message is logged instead (STAFF_TOUR.md Part B).
  if (process.env.DEMO_MODE === "true") {
    console.log(`[demo] Telegram not sent to ${chatId}: ${text.split("\n")[0].slice(0, 120)}`);
    return "skipped";
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return "skipped";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export function telegramDeepLink(token: string): string | null {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  return bot ? `https://t.me/${bot}?start=${token}` : null;
}
