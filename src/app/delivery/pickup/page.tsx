import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { PickupRow } from "@/components/delivery/pickup-row";
import { toCard } from "@/components/delivery/types";
import { addisDate, formatDate } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { pickupList } from "@/server/services/delivery";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pick-up list" };

export default async function PickupPage() {
  const actor = await requirePageActor("owner", "operations", "delivery");
  const ctx = await serviceCtx(actor);
  const today = addisDate(ctx.now);
  const { drops, counts } = await pickupList(ctx, today);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={S.pickupTitle} description={<>{formatDate(today, "long")} · {counts.delivered} of {counts.total} handed over. {S.pickupDescription}</>} />
      <div data-tour="pickup-list">
        {drops.length === 0 ? <EmptyState title={S.pickupEmpty}>{S.pickupEmptyBody}</EmptyState> : (
          <ul className="divide-y rounded-xl border bg-card">{drops.map((d, i) => <PickupRow key={d.id} drop={toCard(d)} first={i === 0} />)}</ul>
        )}
      </div>
    </div>
  );
}
