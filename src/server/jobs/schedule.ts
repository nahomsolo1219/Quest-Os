// Railway cron schedules (UTC) for the eight jobs — the same table as CRON.md. Used by
// GET /api/jobs/health and the owner Dashboard to flag a job that has not run when it should have.
import type { JobName } from "./index";

/** "minute hour * * weekday|*" in UTC. Only the shapes we use (fixed minute and hour, optional weekday). */
export const JOB_SCHEDULES: Record<JobName, { cron: string; addis: string }> = {
  "tuesday-reminder": { cron: "0 7 * * 2", addis: "Tue 10:00" },
  "thursday-last-call": { cron: "0 13 * * 4", addis: "Thu 16:00" },
  "thursday-lock": { cron: "0 15 * * 4", addis: "Thu 18:00" },
  "friday-shopping": { cron: "0 5 * * 5", addis: "Fri 08:00" },
  "daily-quick-start": { cron: "0 15 * * *", addis: "Daily 18:00" },
  "daily-morning": { cron: "0 3 * * *", addis: "Daily 06:00" },
  "sunday-stock": { cron: "0 14 * * 0", addis: "Sun 17:00" },
  "daily-renewals": { cron: "0 6 * * *", addis: "Daily 09:00" },
};

/** A run counts as on time if it finished within this long after the scheduled minute. */
export const JOB_GRACE_MS = 30 * 60 * 1000;

/** Most recent scheduled instant at or before `now` for a cron of the shape above. */
export function lastScheduledAt(cron: string, now: Date): Date {
  const [min, hour, , , dow] = cron.split(" ");
  const t = new Date(now);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(Number(min));
  t.setUTCHours(Number(hour));
  if (t > now) t.setUTCDate(t.getUTCDate() - 1);
  if (dow !== "*") {
    while (t.getUTCDay() !== Number(dow)) t.setUTCDate(t.getUTCDate() - 1);
  }
  return t;
}
