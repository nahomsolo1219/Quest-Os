import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ToneBadge, type Tone } from "@/components/ops/badges";
import { DELIVERY_LABEL } from "@/components/ops/labels";
import { requirePageActor, serviceCtx } from "@/server/session";
import { quickStartQueue } from "@/server/services/ops";
import { formatBirr } from "@/domain/money";
import { profileLabel } from "@/domain/format";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "./strings";

export const dynamic = "force-dynamic";

const STAGE_TONE: Record<string, Tone> = { pending_payment: "warn", receipt_waiting: "info", paid: "good", added: "good" };

export default async function QuickStartsPage() {
  const actor = await requirePageActor("owner", "operations");
  const q = await quickStartQueue(await serviceCtx(actor));
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={S.title} description={S.description(q.cutoffTime)} />
      <Card data-tour="quickstarts-capacity">
        <CardHeader><CardTitle>{S.capacityTitle}</CardTitle></CardHeader>
        <CardContent>
          {q.capacity.length === 0 ? <p className="text-sm text-muted-foreground">{S.capacityEmpty} Daily maximum: {q.dailyCapacity}.</p> : (
            <ul className="space-y-3">
              {q.capacity.map((c) => (
                <li key={c.date} className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="font-medium">{formatDate(c.date, "long")}</span>
                    <span className={c.taken >= c.capacity ? "font-semibold text-danger" : ""}>{c.taken} / {c.capacity}{c.taken >= c.capacity ? ` · ${S.full}` : ""}</span></div>
                  <Progress value={Math.min(100, (100 * c.taken) / Math.max(1, c.capacity))} aria-label={`${c.taken} of ${c.capacity}`} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div data-tour={q.items.length === 0 ? "quickstarts-list" : undefined}>
      {q.items.length === 0 ? (
        <EmptyState title={S.emptyTitle} action={<Button asChild className="h-11"><Link href="/staff/clients">Open clients</Link></Button>}>{S.emptyBody}</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.items.map((i, n) => (
            <Card key={i.subscriptionId} data-tour={n === 0 ? "quickstarts-list" : undefined}>
              <CardContent className="space-y-2 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/staff/clients/${i.clientId}`} className="font-semibold underline-offset-2 hover:underline">{i.name}</Link>
                    <p className="text-sm text-muted-foreground">{i.packageName} · {DELIVERY_LABEL[i.deliveryOption]}{i.profile ? ` · ${profileLabel(i.profile)}` : ""}</p>
                  </div>
                  <ToneBadge tone={STAGE_TONE[i.stage]}>{S.stage[i.stage]}</ToneBadge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{S.start}</dt><dd className="font-medium">{formatDate(i.startDate, "long")}</dd>
                  <dt className="text-muted-foreground">{S.period}</dt><dd className="font-medium">{i.periodEnd ? formatDate(i.periodEnd, "long") : "—"}{i.serviceDays ? ` (${i.serviceDays} days)` : ""}</dd>
                  <dt className="text-muted-foreground">{S.amount}</dt><dd className="font-medium">{i.amountBirr != null ? formatBirr(i.amountBirr) : "—"}</dd>
                  {i.stage === "pending_payment" && i.dueAt ? (<><dt className="text-muted-foreground">{S.dueBy}</dt><dd className="font-medium">{formatAddisDateTime(i.dueAt)}</dd></>) : null}
                </dl>
                {i.provisional ? <ToneBadge tone="warn" className="whitespace-normal">{S.provisional}{i.confirmBy ? ` · ${S.confirmBy(formatAddisDateTime(i.confirmBy))}` : ""}</ToneBadge> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
