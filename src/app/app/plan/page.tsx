import Link from "next/link";
import { PauseCircle, CreditCard, Repeat, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Deadline } from "@/components/shell/deadline";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { MacroRow, Stat } from "@/components/shell/stat";
import { StatusBadge } from "@/components/shell/status-badge";
import { PlanLinkRow } from "@/components/client/plan-links";
import { SizeRequestForm } from "@/components/client/size-request-form";
import { DELIVERY_LABELS, SIZE_LABELS } from "@/components/public/labels";
import { requirePageActor, serviceCtx } from "@/server/session";
import { myInvoices, myPlan } from "@/server/services/client-app";
import { formatBirr } from "@/domain/money";
import { formatDate } from "@/domain/time";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "My plan" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  );
}

export default async function PlanPage() {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const [p, invoices] = await Promise.all([myPlan(ctx), myInvoices(ctx)]);
  const sub = p.subscription;
  const live = sub && ["active", "paused", "pending_payment"].includes(sub.status);
  const toPay = invoices.filter((i) => i.status === "issued");
  const overdue = toPay.some((i) => i.dueAt < ctx.now);
  return (
    <div className="space-y-4">
      <PageHeader title={T.plan.title} description={`${p.client.firstName} ${p.client.lastName}`} />

      {sub && p.package ? (
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{p.package.name}</h2>
            <StatusBadge status={sub.status}>{T.plan.status[sub.status] ?? sub.status}</StatusBadge>
          </div>
          <Row label={T.plan.price}><span className="tabular">{formatBirr(sub.planPriceBirr - sub.discountMonthBirr)}</span> / month</Row>
          <p className="border-b py-2 text-xs text-muted-foreground">{T.plan.priceLock(formatDate(sub.priceLockedUntil, "long"))}</p>
          <Row label={T.plan.delivery}>{DELIVERY_LABELS[sub.deliveryOption]}</Row>
          <Row label={T.plan.billing}>{sub.billingPeriod === "weekly" ? "Weekly" : "Monthly"}</Row>
          <Row label={T.plan.dates}>{formatDate(sub.startDate)} – {formatDate(sub.endDate)}</Row>
          <Row label="Coaching">{p.package.coaching}</Row>
        </section>
      ) : (
        <EmptyState title={T.plan.noPlan} action={<Button asChild className="h-11"><Link href="/app/payments">{T.plan.goPayments}</Link></Button>}>{T.plan.noPlanHint}</EmptyState>
      )}

      <section aria-labelledby="manage" className="space-y-2">
        <h2 id="manage" className="text-lg font-semibold">{T.plan.manage}</h2>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {live ? (
            <>
              <PlanLinkRow href="/app/swaps" icon={<Repeat className="size-5" />} title={T.plan.swapsTitle}>
                <span className="tabular">{T.plan.swaps(p.swapsUsed, p.swapLimit)}</span>
                <Deadline cutoff={p.cutoff} now={ctx.now} className="mt-0.5" />
              </PlanLinkRow>
              <PlanLinkRow href="/app/pause" icon={<PauseCircle className="size-5" />} title={T.plan.pauseTitle}
                aside={sub.status === "paused" ? <StatusBadge status="paused">Paused</StatusBadge> : null}>
                {T.plan.pauseHint(formatDate(p.nextWeek))}
              </PlanLinkRow>
            </>
          ) : null}
          <PlanLinkRow href="/app/payments" icon={<CreditCard className="size-5" />} title={T.plan.paymentsTitle}
            aside={toPay.length ? <StatusBadge tone={overdue ? "bad" : "warn"}>{overdue ? "Overdue" : `${toPay.length} to pay`}</StatusBadge>
              : invoices.length ? <StatusBadge tone="good">All paid</StatusBadge> : null}>
            {toPay[0] ? `${formatBirr(toPay[0].amountBirr)} · ${formatDate(toPay[0].periodStart)} – ${formatDate(toPay[0].periodEnd)}` : T.plan.paymentsHint}
          </PlanLinkRow>
          <PlanLinkRow href="/app/profile" icon={<UserRound className="size-5" />} title={T.profile.title}>{T.plan.profileHint}</PlanLinkRow>
        </ul>
      </section>

      {p.profile ? (
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{T.plan.macros}</h2>
            {p.profile.provisional ? <StatusBadge status="provisional">{T.plan.provisional}</StatusBadge> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={T.plan.size} value={p.profile.size} unit={`${SIZE_LABELS[p.profile.size]} · ${p.profile.goal === "lean" ? "Lean" : "Build"}`} />
            <Stat label={T.plan.target} value={p.profile.kcal.toLocaleString("en-US")} unit="kcal" />
          </div>
          <MacroRow kcal={p.profile.kcal} proteinG={p.profile.proteinG} carbG={p.profile.carbG} fatG={p.profile.fatG} />
          {p.profile.provisional ? <p className="text-sm text-muted-foreground">{T.plan.provisionalHint}</p> : null}
        </section>
      ) : null}

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-semibold">{T.plan.sizeChange}</h2>
        <p className="text-sm text-muted-foreground">{T.plan.sizeChangeHint}</p>
        <SizeRequestForm />
      </section>
    </div>
  );
}
