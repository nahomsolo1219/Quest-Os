import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { RiderDropCard } from "@/components/delivery/rider-drop-card";
import { toCard } from "@/components/delivery/types";
import { addisDate, formatDate } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { dropsForDate } from "@/server/services/delivery";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "My drops" };

export default async function RiderPage() {
  const actor = await requirePageActor("owner", "operations", "delivery");
  const ctx = await serviceCtx(actor);
  const today = addisDate(ctx.now);
  const { groups, counts } = await dropsForDate(ctx, today);
  const drops = groups.flatMap((g) => g.drops);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={S.riderTitle} description={<>{formatDate(today, "long")} · {counts.delivered} delivered · {counts.failed} failed · {counts.pending} to go</>}
        actions={<Link href="/delivery/pickup" className="inline-flex h-11 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Pick-up list</Link>} />
      {drops.length === 0 ? <EmptyState title={S.riderEmpty}>{S.riderEmptyBody}</EmptyState> : (
        <ol className="space-y-3">
          {drops.map((d, i) => <RiderDropCard key={d.id} drop={toCard(d)} position={i + 1} />)}
        </ol>
      )}
    </div>
  );
}
