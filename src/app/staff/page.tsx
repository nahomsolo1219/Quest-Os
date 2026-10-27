import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Deadline } from "@/components/shell/deadline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToneBadge } from "@/components/ops/badges";
import { requirePageActor, serviceCtx } from "@/server/session";
import { todaySummary, todayTasks } from "@/server/services/ops";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "./strings";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const ctx = await serviceCtx(actor);
  const [t, tasks] = await Promise.all([todaySummary(ctx), todayTasks(ctx)]);
  const open = tasks.filter((x) => x.count > 0);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={S.title} description={formatDate(t.today, "long")} />

      {t.lockDue ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-danger/30 bg-danger-soft p-4">
          <p className="font-semibold text-danger">{S.lockMissing(formatDate(t.lockedWeek, "long"))}</p>
          <Button asChild className="h-11"><Link href={`/staff/orders?week=${t.lockedWeek}`}>{S.openOrders}</Link></Button>
        </div>
      ) : null}

      <section aria-labelledby="todo-h" className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 id="todo-h" className="text-lg font-semibold">{S.todoTitle}</h2>
          {open.length ? <p className="text-sm text-muted-foreground">{S.todoHint}</p> : null}
        </div>
        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <CheckCircle2 aria-hidden className="size-10 text-success" />
            <p className="text-xl font-semibold">{S.allClear}</p>
            <p className="text-sm text-muted-foreground">{S.allClearBody}</p>
            <Deadline cutoff={t.cutoff} now={ctx.now} verb={S.cutoffVerb} passedLabel={S.passed} className="justify-center" />
          </div>
        ) : (
          <ul className="divide-y">
            {open.map((task) => {
              const s = S.tasks[task.key];
              return (
                <li key={task.key} className="flex min-h-16 items-center gap-3 px-4 py-2">
                  <span className="stat-number w-10 shrink-0 text-center text-2xl text-primary">{task.count}</span>
                  <span className="min-w-0 flex-1 font-medium">{s.label}</span>
                  <Button asChild className="h-11 shrink-0">
                    <Link href={task.href} aria-label={`${s.action}: ${s.label}`}>{s.action}<ChevronRight aria-hidden className="size-4" /></Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader><CardTitle>{S.cutoffTitle(formatDate(t.nextWeek, "long"))}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Deadline cutoff={t.cutoff} now={ctx.now} verb={S.cutoffVerb} passedLabel={S.passed} className="text-base" />
          <p className="text-sm text-muted-foreground">{S.cutoffAt(formatAddisDateTime(t.cutoff))}</p>
          {t.lockedWeekDone ? <ToneBadge tone="good">{S.lockedOk(formatDate(t.lockedWeek, "long"))}</ToneBadge> : null}
          <div><Button asChild variant="outline" className="h-11"><Link href={`/staff/orders?week=${t.nextWeek}`}>{S.previewNext}</Link></Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{S.attentionTitle}</CardTitle></CardHeader>
        <CardContent>
          {t.attention.length === 0 ? <EmptyState title={S.attentionEmpty} /> : (
            <ul className="divide-y">
              {t.attention.map((a, i) => (
                <li key={`${a.clientId}-${i}`}>
                  <Link href={`/staff/clients/${a.clientId}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:bg-muted/50">
                    <span className="font-medium">{a.name}</span>
                    <ToneBadge tone={a.tone}>{a.reason}</ToneBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
