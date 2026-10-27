import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Stat } from "@/components/shell/stat";
import { requirePageActor, serviceCtx } from "@/server/session";
import { intakeQueue } from "@/server/services/nutrition";
import { displayName } from "@/domain/format";
import { formatAddisDateTime } from "@/domain/time";
import { S } from "./strings";
import { StatusBadge } from "@/components/shell/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nutrition" };

const goalLabel = (g: string) => (g === "lean" ? "Lean" : "Build");

export default async function NutritionQueuePage() {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const q = await intakeQueue(await serviceCtx(actor));
  const overdue = q.provisional.filter((p) => p.overdue).length;
  return (
    <div className="space-y-6">
      <PageHeader title={S.title} description={S.queueIntro} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={S.provisionalTitle} value={q.provisional.length} tone={overdue ? "bad" : q.provisional.length ? "warn" : "default"} />
        <Stat label={S.noProfileTitle} value={q.noProfile.length} tone={q.noProfile.length ? "warn" : "default"} />
        <Link href="/staff/nutrition/profiles" className="rounded-xl focus-visible:outline-2"><Stat label={S.flaggedTitle} value={q.flaggedDays} tone={q.flaggedDays ? "warn" : "good"} /></Link>
        <Link href="/staff/nutrition/swaps" className="rounded-xl focus-visible:outline-2"><Stat label={S.swapRequestsTitle} value={q.swapRequests} tone={q.swapRequests ? "warn" : "default"} /></Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{S.provisionalTitle}</h2>
        <p className="text-sm text-muted-foreground">{S.provisionalBody(q.confirmHours)}</p>
        {q.provisional.length === 0 ? <EmptyState title={S.provisionalEmpty} /> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {q.provisional.map((p) => (
              <li key={p.clientId}>
                <Link href={`/staff/nutrition/clients/${p.clientId}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border p-3 hover:bg-muted bg-card">
                  <div className="min-w-0">
                    <p className="font-semibold">{displayName(p.firstName, p.lastName)}</p>
                    <p className="text-sm text-muted-foreground">{p.size} {goalLabel(p.goal)} · {p.kcalTarget} kcal · signed up {formatAddisDateTime(p.setAt)}</p>
                  </div>
                  <StatusBadge tone={p.overdue ? "bad" : "warn"}>{S.hoursLeft(p.hoursLeft)}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{S.noProfileTitle}</h2>
        {q.noProfile.length === 0 ? <EmptyState title={S.noProfileEmpty} /> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {q.noProfile.map((c) => (
              <li key={c.id}>
                <Link href={`/staff/nutrition/clients/${c.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border p-3 hover:bg-muted bg-card">
                  <span className="font-semibold">{displayName(c.firstName, c.lastName)}</span>
                  <span className="flex gap-1">
                    <StatusBadge status={c.status} />
                    {c.statsComplete ? null : <StatusBadge tone="warn">{S.statsMissing}</StatusBadge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader><CardTitle>{S.allClientsTitle}</CardTitle></CardHeader>
        <CardContent>
          {q.clients.length === 0 ? <EmptyState title={S.allClientsEmpty} /> : (
            <ul className="divide-y">
              {q.clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/staff/nutrition/clients/${c.id}`} className="flex min-h-11 items-center justify-between gap-2 py-2 hover:text-primary">
                    <span className="font-medium">{displayName(c.firstName, c.lastName)} <span className="text-sm font-normal text-muted-foreground">· {c.status}</span></span>
                    <span className="text-right text-sm text-muted-foreground">
                      {c.profile ? `${c.profile.size} ${goalLabel(c.profile.goal)} · ${c.profile.kcalTarget} kcal` : "No targets"}
                      {c.profile?.provisional ? <StatusBadge tone="warn" className="ml-2">{S.provisional}</StatusBadge> : null}
                      {c.profile?.isOverride ? <Badge variant="outline" className="ml-2">{S.override}</Badge> : null}
                    </span>
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
