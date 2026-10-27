import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { PaymentCard } from "@/components/ops/payment-card";
import { INVOICE_KIND_LABEL, METHOD_LABEL } from "@/components/ops/labels";
import { requirePageActor, serviceCtx } from "@/server/session";
import { paymentQueue, receiptUrl } from "@/server/services/billing";
import { formatBirr } from "@/domain/money";
import { formatEthiopianPhone } from "@/domain/phone";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "./strings";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const actor = await requirePageActor("owner", "operations");
  const ctx = await serviceCtx(actor);
  const queue = await paymentQueue(ctx);
  const cards = await Promise.all(queue.map(async (q) => ({
    paymentId: q.payment.id,
    clientId: q.client.id,
    clientName: `${q.client.firstName} ${q.client.lastName}`,
    phone: formatEthiopianPhone(q.client.phone),
    amount: formatBirr(q.payment.amountBirr),
    method: METHOD_LABEL[q.payment.method],
    reference: q.payment.reference,
    kind: INVOICE_KIND_LABEL[q.invoice.kind],
    period: `${formatDate(q.invoice.periodStart)} – ${formatDate(q.invoice.periodEnd)}`,
    submitted: formatAddisDateTime(q.payment.submittedAt),
    receiptUrl: q.payment.receiptKey ? await receiptUrl(ctx, q.payment.receiptKey) : null,
  })));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={S.title} description={S.description} />
      <div data-tour="payments-queue">
        {cards.length === 0 ? <EmptyState title={S.emptyTitle}>{S.emptyBody}</EmptyState> : (
          <div className="space-y-3">{cards.map((c) => <PaymentCard key={c.paymentId} p={c} />)}</div>
        )}
      </div>
    </div>
  );
}
