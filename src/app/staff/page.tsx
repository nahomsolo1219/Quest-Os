import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToneBadge } from "@/components/ops/badges";
import { Countdown } from "@/components/ops/countdown";
import { timeLeftText } from "@/components/ops/time-left";
import { cn } from "@/lib/utils";
import { requirePageActor, serviceCtx } from "@/server/session";
import { todaySummary } from "@/server/services/ops";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "./strings";

export const dynamic = "force-dynamic";

function CountTile({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "bad" | "warn" }) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-3 transition-colors hover:bg-muted">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("stat-number mt-1 text-3xl", value > 0 && tone === "bad" && "text-red-700", value > 0 && tone === "warn" && "text-amber-700")}>{value}</p>
    </Link>
  );
}

export default async function TodayPage() {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const ctx = await serviceCtx(actor);
  const t = await todaySummary(ctx);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={S.title} description={formatDate(t.today, "long")} />

      {t.lockDue ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-800">{S.lockMissing(formatDate(t.lockedWeek, "long"))}</p>
          <Button asChild className="h-11"><Link href={`/staff/orders?week=${t.lockedWeek}`}>{S.openOrders}</Link></Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {t.canMoney ? <CountTile label={S.receipts} value={t.counts.receipts} href="/staff/payments" tone="bad" /> : null}
        <CountTile label={S.quickStarts} value={t.counts.quickStartsPending} href="/staff/quick-starts" tone="warn" />
        <CountTile label={S.provisional} value={t.counts.provisional} href="/staff/nutrition" tone="warn" />
        <CountTile label={S.leads} value={t.counts.leads} href="/staff/clients" />
        {t.canMoney ? <CountTile label={S.overdue} value={t.counts.overdue} href="/staff/clients" tone="bad" /> : null}
        {t.canMoney ? <CountTile label={S.unpaidNext} value={t.counts.unpaidNextWeek} href={`/staff/orders?week=${t.nextWeek}`} tone="warn" /> : null}
      </div>

      <Card>
        <CardHeader><CardTitle>{S.cutoffTitle(formatDate(t.nextWeek, "long"))}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-3xl"><Countdown to={t.cutoff.toISOString()} initial={timeLeftText(t.cutoff.getTime() - ctx.now.getTime()) ?? S.passed} passedLabel={S.passed} /></p>
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
