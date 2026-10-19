import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Stat } from "@/components/shell/stat";
import { RouteBoard } from "@/components/delivery/route-board";
import { toCard } from "@/components/delivery/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, addisDate, formatDate, isDateStr } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { dropsForDate, pickupList, riders } from "@/server/services/delivery";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delivery" };

export default async function StaffDeliveryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requirePageActor("owner", "operations");
  const ctx = await serviceCtx(actor);
  const sp = await searchParams;
  const today = addisDate(ctx.now);
  const date = sp.date && isDateStr(sp.date) ? sp.date : today;
  const canManage = actor.roles.includes("operations");
  const [{ groups, counts }, pickups, riderList] = await Promise.all([
    dropsForDate(ctx, date), pickupList(ctx, date), canManage ? riders(ctx) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`${S.title} · ${formatDate(date, "long")}`} description={S.description} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="drop-date">Date</Label>
          <Input id="drop-date" name="date" type="date" defaultValue={date} className="h-11 w-44" />
        </div>
        <Button type="submit" variant="outline" className="h-11">Show</Button>
        <Link href={`/staff/delivery?date=${addDays(date, -1)}`} className="inline-flex h-11 items-center rounded-md border px-3 text-sm">← {formatDate(addDays(date, -1))}</Link>
        <Link href={`/staff/delivery?date=${addDays(date, 1)}`} className="inline-flex h-11 items-center rounded-md border px-3 text-sm">{formatDate(addDays(date, 1))} →</Link>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Drops" value={counts.total} />
        <Stat label="Delivered" value={counts.delivered} tone="good" />
        <Stat label="Failed" value={counts.failed} tone={counts.failed ? "bad" : "default"} />
        <Stat label="Pending" value={counts.pending} />
      </div>
      {pickups.drops.length ? (
        <p className="mb-4 text-sm">
          Pick-ups at the cafe: {pickups.counts.delivered} of {pickups.counts.total} handed over · <Link href="/delivery/pickup" className="text-primary underline">Pick-up list</Link>
        </p>
      ) : null}
      {counts.total === 0 ? <EmptyState title={S.empty}>{S.emptyBody}</EmptyState> : (
        <RouteBoard key={date} date={date} canManage={canManage} riders={riderList}
          groups={groups.map((g) => ({ areaId: g.areaId, areaName: g.areaName, drops: g.drops.map(toCard) }))} />
      )}
    </div>
  );
}
