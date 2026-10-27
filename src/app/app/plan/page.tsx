import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { MacroRow, Stat } from "@/components/shell/stat";
import { SizeRequestForm } from "@/components/client/size-request-form";
import { DELIVERY_LABELS, SIZE_LABELS } from "@/components/public/labels";
import { requirePageActor, serviceCtx } from "@/server/session";
import { myPlan } from "@/server/services/client-app";
import { formatBirr } from "@/domain/money";
import { formatDate } from "@/domain/time";
import { T } from "../strings";
import { StatusBadge } from "@/components/shell/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "My plan" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b py-2.5 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{children}</span></div>;
}

export default async function PlanPage() {
  const actor = await requirePageActor("client");
  const p = await myPlan(await serviceCtx(actor));
  const sub = p.subscription;
  return (
    <div className="space-y-4">
      <PageHeader title={T.plan.title} description={`${p.client.firstName} ${p.client.lastName}`} />
      {p.profile ? (
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{T.plan.macros}</h2>
            {p.profile.provisional ? <Badge variant="secondary">{T.plan.provisional}</Badge> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={T.plan.size} value={p.profile.size} unit={`${SIZE_LABELS[p.profile.size]} · ${p.profile.goal === "lean" ? "Lean" : "Build"}`} />
            <Stat label={T.plan.target} value={p.profile.kcal.toLocaleString("en-US")} unit="kcal" />
          </div>
          <MacroRow kcal={p.profile.kcal} proteinG={p.profile.proteinG} carbG={p.profile.carbG} fatG={p.profile.fatG} />
          {p.profile.provisional ? <p className="text-sm text-muted-foreground">{T.plan.provisionalHint}</p> : null}
        </section>
      ) : null}
      {sub && p.package ? (
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-bold">{p.package.name}</h2>
            <StatusBadge status={sub.status}>{T.plan.status[sub.status] ?? sub.status}</StatusBadge>
          </div>
          <Row label={T.plan.price}>{formatBirr(sub.planPriceBirr - sub.discountMonthBirr)} / month</Row>
          <Row label="">{T.plan.priceLock(formatDate(sub.priceLockedUntil, "long"))}</Row>
          <Row label={T.plan.delivery}>{DELIVERY_LABELS[sub.deliveryOption]}</Row>
          <Row label={T.plan.billing}>{sub.billingPeriod === "weekly" ? "Weekly" : "Monthly"}</Row>
          <Row label={T.plan.dates}>{formatDate(sub.startDate)} – {formatDate(sub.endDate)}</Row>
          <Row label="Swaps">{T.plan.swaps(p.swapsUsed, p.swapLimit)}</Row>
          <Row label="Coaching">{p.package.coaching}</Row>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="h-11"><Link href="/app/swaps">Swaps</Link></Button>
            <Button asChild variant="outline" className="h-11"><Link href="/app/pause">Pause</Link></Button>
          </div>
        </section>
      ) : (
        <EmptyState title={T.plan.noPlan} action={<Button asChild className="h-11"><Link href="/app/payments">Payments</Link></Button>}>{T.plan.noPlanHint}</EmptyState>
      )}
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">{T.plan.sizeChange}</h2>
        <p className="text-sm text-muted-foreground">{T.plan.sizeChangeHint}</p>
        <SizeRequestForm />
      </section>
    </div>
  );
}
