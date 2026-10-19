import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Stat } from "@/components/shell/stat";
import { requirePageActor, serviceCtx } from "@/server/session";
import { ATTENTION_LABELS, ownerDashboard } from "@/server/services/dashboard";
import { displayName } from "@/domain/format";
import { formatBirr } from "@/domain/money";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function DashboardPage() {
  const actor = await requirePageActor("owner");
  const d = await ownerDashboard(await serviceCtx(actor));
  const k = d.kpis;
  const [y, m] = d.monthStart.split("-");
  const collectedShare = k.invoiced > 0 ? k.collected / k.invoiced : null;
  return (
    <div className="space-y-6">
      <PageHeader title={S.title} description={S.intro(`${MONTHS[Number(m) - 1]} ${y}`)} />
      <section aria-label={S.clients} className="space-y-2">
        <h2 className="text-lg font-semibold">{S.clients}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={S.active} value={k.activeClients} />
          <Stat label={S.newMonth} value={k.newThisMonth} tone={k.newThisMonth ? "good" : "default"} />
          <Stat label={S.churned} value={k.churnedThisMonth} tone={k.churnedThisMonth ? "bad" : "default"} unit={k.churnedThisMonth ? `(${pct(k.churnRate)})` : undefined} />
          <Stat label={S.mrr} value={formatBirr(k.mrr)} />
        </div>
      </section>
      <section aria-label={S.money} className="space-y-2">
        <h2 className="text-lg font-semibold">{S.money}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <Stat label={S.collected} value={formatBirr(k.collected)} />
            {collectedShare !== null ? <p className="mt-1 text-xs text-muted-foreground">{pct(collectedShare)} of invoiced</p> : null}
          </div>
          <Stat label={S.invoiced} value={formatBirr(k.invoiced)} />
          <div>
            <Stat label={S.foodCost} value={pct(k.foodCostPct)} tone={k.foodCostPct !== null && k.foodCostPct > 0.45 ? "bad" : "default"} />
            <p className="mt-1 text-xs text-muted-foreground">{S.foodCostHelp}: {formatBirr(k.foodCost)}</p>
          </div>
          <div>
            <Stat label={S.margin} value={formatBirr(k.marginEstimate).replace("-", "−")} tone={k.marginEstimate < 0 ? "bad" : "good"} />
            <p className="mt-1 text-xs text-muted-foreground">{S.marginHelp}</p>
          </div>
        </div>
      </section>
      <section aria-label={S.ops} className="space-y-2">
        <h2 className="text-lg font-semibold">{S.ops}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <Stat label={S.onTime} value={pct(k.onTimePct)} tone={k.onTimePct !== null && k.onTimePct < 0.9 ? "warn" : "default"} />
            <p className="mt-1 text-xs text-muted-foreground">{S.onTimeHelp(d.deliveryDeadlineTime)}</p>
          </div>
          <Stat label={S.quickStarts} value={k.quickStartsThisWeek} />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{S.attention} ({d.attention.length})</CardTitle></CardHeader>
          <CardContent>
            {d.attention.length === 0 ? <EmptyState title={S.attentionEmpty} /> : (
              <ul className="divide-y">
                {d.attention.map((a) => (
                  <li key={a.clientId}>
                    <Link href={`/staff/clients/${a.clientId}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:text-primary">
                      <span className="font-medium">{displayName(a.firstName, a.lastName)}</span>
                      <span className="flex flex-wrap gap-1">
                        {a.reasons.map((r) => (
                          <Badge key={r} variant="secondary" className={r === "allergy_conflict" || r === "unpaid" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}>{ATTENTION_LABELS[r]}</Badge>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{S.ratings}</CardTitle></CardHeader>
          <CardContent>
            {d.ratings.length === 0 ? <EmptyState title={S.ratingsEmpty} /> : (
              <ul className="divide-y">
                {d.ratings.map((r) => (
                  <li key={r.mealId} className="flex min-h-11 items-center justify-between gap-2 py-2">
                    <span className="min-w-0">{r.meal?.name ?? "Meal"} <span className="text-sm capitalize text-muted-foreground">· {r.meal?.menu ? `Menu ${r.meal.menu} ` : ""}{r.meal?.slot}</span></span>
                    <span className="whitespace-nowrap"><span className="stat-number text-lg">{r.avg.toFixed(1)}</span> <span className="text-sm text-muted-foreground">/ 5 · {r.count}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
