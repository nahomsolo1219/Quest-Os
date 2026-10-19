import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PayForm } from "@/components/client/pay-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { myInvoices } from "@/server/services/client-app";
import { formatBirr } from "@/domain/money";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { cn } from "@/lib/utils";
import { T } from "../strings";

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
      <PageHeader title={T.payments.title} description={T.payments.how} />
      {invoices.length === 0 ? <EmptyState title={T.payments.none}>{T.payments.noneHint}</EmptyState> : null}
      {[...toPay, ...rest].map((inv) => {
        const waiting = inv.payments.find((p) => p.status === "submitted");
        const last = inv.payments[0];
        const overdue = inv.status === "issued" && inv.dueAt < ctx.now;
        return (
          <article key={inv.id} className={cn("space-y-3 rounded-2xl border bg-card p-4", inv.status === "issued" && "border-primary/40")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{T.payments.kinds[inv.kind]} · {T.payments.period(formatDate(inv.periodStart), formatDate(inv.periodEnd))}</p>
                <p className="stat-number text-3xl">{formatBirr(inv.amountBirr)}</p>
                <p className="text-xs text-muted-foreground">{inv.serviceDays} service days{inv.creditAppliedBirr ? ` · credit ${formatBirr(inv.creditAppliedBirr)} applied` : ""}</p>
              </div>
              <Badge variant={inv.status === "paid" ? "default" : inv.status === "issued" ? "secondary" : "outline"}>{T.payments.status[inv.status]}</Badge>
            </div>
            {inv.status === "issued" ? <p className={cn("text-sm font-medium", overdue && "text-red-700")}>{T.payments.due(formatAddisDateTime(inv.dueAt))}</p> : null}
            {last ? (
              <p className={cn("rounded-lg p-2 text-sm", last.status === "rejected" ? "bg-red-50 text-red-900" : last.status === "confirmed" ? "bg-emerald-50 text-emerald-900" : "bg-accent")}>
                {T.payments.payment[last.status]} · {T.payments.methods[last.method]}{last.reference ? ` · ${last.reference}` : ""}
                {last.status === "rejected" && last.rejectionReason ? ` — ${last.rejectionReason}` : ""}
              </p>
            ) : null}
            {inv.status === "issued" && !waiting ? (
              <details className="group rounded-xl border p-3" open={toPay[0]?.id === inv.id}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center font-semibold text-primary">{T.payments.pay}</summary>
                <div className="pt-2"><PayForm invoiceId={inv.id} /></div>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
