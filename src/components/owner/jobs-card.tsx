import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { formatAddisDateTime } from "@/domain/time";
import type { JobHealth } from "@/server/services/jobs-health";

/** Owner Dashboard: last run of each scheduled job; red when a job missed its schedule. */
export function JobsCard({ jobs }: { jobs: JobHealth[] }) {
  const overdue = jobs.filter((j) => j.overdue).length;
  return (
    <Card>
      <CardHeader data-tour="dashboard-jobs" className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Scheduled jobs</CardTitle>
        {overdue ? <StatusBadge tone="bad">{overdue} overdue</StatusBadge> : <StatusBadge tone="good">All on time</StatusBadge>}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {jobs.map((j) => {
            const last = j.finished ?? j.started;
            return (
              <li key={j.name} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0">
                  <span className="font-mono text-sm">{j.name}</span>
                  <span className="block text-xs text-muted-foreground">{j.addis} Addis</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="tabular text-muted-foreground">{last ? `Last run ${formatAddisDateTime(new Date(last))}` : "Never ran"}</span>
                  <StatusBadge tone={j.overdue ? "bad" : j.ok ? "good" : "paused"}>{j.overdue ? "Overdue" : j.ok ? "OK" : "Not due yet"}</StatusBadge>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Overdue: the last scheduled time (plus 30 min) passed without a run. Check the Railway cron service (CRON.md). Public status: <Link className="underline" href="/api/jobs/health" prefetch={false}>/api/jobs/health</Link></p>
      </CardContent>
    </Card>
  );
}
