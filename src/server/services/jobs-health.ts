// Read-only: last run per scheduled job, and whether a job is overdue by its schedule.
// Public on purpose (GET /api/jobs/health) so anyone can see whether the crons fire; it exposes
// only job names and times, never results.
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@db/client";
import { JOB_NAMES, type JobName } from "@/server/jobs";
import { JOB_GRACE_MS, JOB_SCHEDULES, lastScheduledAt } from "@/server/jobs/schedule";

export type JobHealth = {
  name: JobName;
  schedule: string; // UTC cron
  addis: string; // human schedule in Addis time
  started: string | null;
  finished: string | null;
  ok: boolean | null; // null = never ran
  lastScheduled: string;
  overdue: boolean; // the last scheduled run (plus grace) has passed without a run since
};

export async function jobsHealth(db: DbOrTx, now: Date): Promise<JobHealth[]> {
  const rows = (await db.execute(sql`
    select distinct on (job) job, started_at, finished_at
    from job_runs
    order by job, coalesce(finished_at, started_at) desc
  `)) as unknown as { job: string; started_at: Date | string; finished_at: Date | string | null }[];
  const byJob = new Map(rows.map((r) => [r.job, r]));
  const iso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString());
  return JOB_NAMES.map((name) => {
    const r = byJob.get(name);
    const { cron, addis } = JOB_SCHEDULES[name];
    const due = lastScheduledAt(cron, now);
    const last = r ? new Date(r.finished_at ?? r.started_at) : null;
    const overdue = now.getTime() - due.getTime() > JOB_GRACE_MS && (!last || last.getTime() < due.getTime());
    return {
      name, schedule: cron, addis,
      started: iso(r?.started_at ?? null), finished: iso(r?.finished_at ?? null),
      ok: r ? r.finished_at != null : null,
      lastScheduled: due.toISOString(), overdue,
    };
  });
}
