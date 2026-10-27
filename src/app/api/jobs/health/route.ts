import { NextResponse } from "next/server";
import { db } from "@db/client";
import { now } from "@/server/clock";
import { jobsHealth } from "@/server/services/jobs-health";

export const dynamic = "force-dynamic";

/** GET /api/jobs/health: last run per scheduled job (no secret needed; names and times only). */
export async function GET() {
  const at = now();
  const jobs = await jobsHealth(db, at);
  return NextResponse.json(
    { now: at.toISOString(), ok: jobs.every((j) => !j.overdue), jobs },
    { headers: { "cache-control": "no-store" } },
  );
}
