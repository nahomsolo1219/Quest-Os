import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Deadline } from "@/components/shell/deadline";
import { BackToPlan } from "@/components/client/plan-links";
import { PayForm } from "@/components/client/pay-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { myInvoices } from "@/server/services/client-app";
import { formatBirr } from "@/domain/money";
import { formatDate } from "@/domain/time";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { T } from "../strings";
import { StatusBadge } from "@/components/shell/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const invoices = await myInvoices(ctx);
  // issued first (earliest due first), then the rest newest first
  const toPay = invoices.filter((i) => i.status === "issued").sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const rest = invoices.filter((i) => i.status !== "issued");
  return (
    <div className="space-y-4">
      <div>
        <BackToPlan />
        <PageHeader title={T.payments.title} description={T.payments.how} />
      </div>
      {invoices.length === 0 ? <EmptyState title={T.payments.none}>{T.payments.noneHint}</EmptyState> : null}
      {[...toPay, ...rest].map((inv) => {
        const waiting = inv.payments.find((p) => p.status === "submitted");
        const last = inv.payments[0];
        return (
          <article key={inv.id} className={cn("space-y-3 rounded-2xl border bg-card p-4", inv.status === "issued" && "border-primary/40")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{T.payments.kinds[inv.kind]} · {T.payments.period(formatDate(inv.periodStart), formatDate(inv.periodEnd))}</p>
                <p className="stat-number text-3xl">{formatBirr(inv.amountBirr)}</p>
                <p className="text-xs text-muted-foreground">{inv.serviceDays} service days{inv.creditAppliedBirr ? ` · credit ${formatBirr(inv.creditAppliedBirr)} applied` : ""}</p>
              </div>
              <StatusBadge status={inv.status} tone={inv.status === "issued" && inv.dueAt < ctx.now ? "bad" : undefined}>{T.payments.status[inv.status]}</StatusBadge>
            </div>
            {inv.status === "issued" ? <Deadline cutoff={inv.dueAt} now={ctx.now} verb={T.payments.payBy} passedLabel={T.payments.overdue} /> : null}
            {last ? (
              <p className={cn("rounded-lg p-2 text-sm", last.status === "rejected" ? "bg-danger-soft text-danger" : last.status === "confirmed" ? "bg-success-soft text-success" : "bg-accent")}>
                {T.payments.payment[last.status]} · {T.payments.methods[last.method]}{last.reference ? ` · ${last.reference}` : ""}
                {last.status === "rejected" && last.rejectionReason ? ` — ${last.rejectionReason}` : ""}
              </p>
            ) : null}
            {inv.status === "issued" && !waiting ? (
              <details className="group rounded-xl border p-3" open={toPay[0]?.id === inv.id}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-primary">{T.payments.pay}<ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" /></summary>
                <div className="pt-2"><PayForm invoiceId={inv.id} /></div>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
