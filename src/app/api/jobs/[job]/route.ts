import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@db/client";
import { JOB_NAMES, runJob, type JobName } from "@/server/jobs";
import { now } from "@/server/clock";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const given = request.headers.get("x-cron-secret") ?? "";
  if (!expected) return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Railway cron calls POST /api/jobs/<name> with header x-cron-secret (SEC-12). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  if (!(JOB_NAMES as readonly string[]).includes(job)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  const result = await runJob(db, job as JobName, now());
  return NextResponse.json(result);
}
