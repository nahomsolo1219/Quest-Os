import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { resetDemoDatabase } from "@db/seed";
import { addisDate } from "@/domain/time";
import { now } from "@/server/clock";

export const dynamic = "force-dynamic";
// The reset reseeds a whole demo week through the real services; give it time.
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const given = request.headers.get("x-cron-secret") ?? "";
  if (!expected) return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Demo copy only (DEMO_MODE=true): wipe the demo database and reseed it for today, including
 * everyone's tour progress (STAFF_TOUR.md Part B). 404 on any other app, before the secret is checked.
 */
export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });
  const at = now();
  const result = await resetDemoDatabase(url, { today: addisDate(at), now: at });
  return NextResponse.json({ ok: true, today: addisDate(at), demo: result.demo, tour: "tour" in result ? result.tour : undefined });
}
