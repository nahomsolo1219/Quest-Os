import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Stat } from "@/components/shell/stat";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConflictList, OrderStatusBadge, ToneBadge } from "@/components/ops/badges";
import { DELIVERY_LABEL } from "@/components/ops/labels";
import { LockNowButton } from "@/components/ops/lock-now-button";
import { requirePageActor, serviceCtx } from "@/server/session";
import { weekReview } from "@/server/services/ops";
import { loadSettings } from "@/server/services/settings";
import { nextLockableWeek } from "@/domain/schedule";
import { profileLabel } from "@/domain/format";
import { addDays, formatAddisDateTime, formatDate, isDateStr, weekStartOf } from "@/domain/time";
import type { Profile } from "@/domain/types";
import { S } from "./strings";

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requirePageActor("owner", "operations", "nutritionist", "kitchen");
  const ctx = await serviceCtx(actor);
  const { week: raw } = await searchParams;
  const settings = await loadSettings(ctx.db);
  const upcoming = nextLockableWeek(ctx.now, settings.schedule);
  const week = raw && isDateStr(raw) ? weekStartOf(raw) : upcoming;
  const r = await weekReview(ctx, week);
  const counts = { locked: 0, skipped_unpaid: 0, paused: 0 };
  for (const row of r.rows) counts[row.status]++;
  const lockedAt = r.rows.find((x) => x.lockedAt && !x.isQuickStart)?.lockedAt ?? r.rows.find((x) => x.lockedAt)?.lockedAt ?? null;
  const conflictRows = r.rows.filter((x) => x.conflicts.length).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={S.title} description={S.description} />
      <nav className="mb-4 grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap" aria-label="Week">
        <p className="col-span-2 text-center font-semibold sm:order-2 sm:min-w-40 sm:flex-1">{S.weekOf(formatDate(week, "long"))}</p>
        <Button asChild variant="outline" className="h-11 sm:order-1"><Link href={`/staff/orders?week=${addDays(week, -7)}`}>← {S.prev}</Link></Button>
        <Button asChild variant="outline" className="h-11 sm:order-3"><Link href={`/staff/orders?week=${addDays(week, 7)}`}>{S.next} →</Link></Button>
        {week !== upcoming ? <Button asChild variant="ghost" className="col-span-2 h-11 sm:order-4"><Link href="/staff/orders">{S.thisWeek}</Link></Button> : null}
      </nav>

      <div className={`mb-4 rounded-xl border p-4 ${r.locked ? "border-success/30 bg-success-soft" : "border-warning/30 bg-warning-soft"}`}>
        <p className="font-semibold">{r.locked ? S.lockedTitle : S.previewTitle}</p>
        <p className="text-sm">{r.locked ? S.lockedBody(lockedAt ? formatAddisDateTime(lockedAt) : "") : S.previewBody(formatAddisDateTime(r.cutoff))}</p>
        {!r.locked && r.cutoffPassed ? <p className="mt-1 text-sm font-medium text-danger">{S.cutoffPassedNotLocked}</p> : null}
        {r.canLock ? <div className="mt-3"><LockNowButton weekStart={week} /></div> : null}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={S.counts.locked} value={counts.locked} tone="good" />
        <Stat label={S.counts.skipped_unpaid} value={counts.skipped_unpaid} tone={counts.skipped_unpaid ? "bad" : "default"} />
        <Stat label={S.counts.paused} value={counts.paused} tone={counts.paused ? "warn" : "default"} />
        <Stat label={S.colConflicts} value={conflictRows} tone={conflictRows ? "bad" : "default"} />
      </div>

      {r.rows.length === 0 ? <EmptyState title={S.emptyTitle} action={<Button asChild className="h-11"><Link href="/staff/clients">Open clients</Link></Button>}>{S.emptyBody}</EmptyState> : (
        <>
        <ul className="space-y-2 md:hidden">
          {r.rows.map((row) => (
            <li key={row.clientId} className={`rounded-xl border p-3 ${row.conflicts.length ? "border-danger/30 bg-danger-soft/60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <Link className="min-h-11 font-semibold underline-offset-2 hover:underline" href={`/staff/clients/${row.clientId}?tab=orders`}>{row.name}</Link>
                <OrderStatusBadge status={row.status} />
              </div>
              <p className="text-sm text-muted-foreground">{profileLabel(row.profile as Profile)} · {DELIVERY_LABEL[row.deliveryOption]} · {row.days} days{row.isQuickStart ? " · quick start" : ""}</p>
              {row.reason && row.status !== "locked" ? <p className="text-sm text-muted-foreground">{row.reason}</p> : null}
              <ConflictList conflicts={row.conflicts} className="mt-1" />
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{S.colClient}</TableHead><TableHead>{S.colStatus}</TableHead><TableHead>{S.colProfile}</TableHead>
                <TableHead>{S.colDelivery}</TableHead><TableHead>{S.colDays}</TableHead><TableHead>{S.colConflicts}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.rows.map((row) => (
                <TableRow key={row.clientId} className={row.conflicts.length ? "bg-danger-soft/60" : undefined}>
                  <TableCell className="whitespace-nowrap font-medium">
                    <Link className="underline-offset-2 hover:underline" href={`/staff/clients/${row.clientId}?tab=orders`}>{row.name}</Link>
                    {row.isQuickStart ? <ToneBadge tone="info" className="ml-1">Quick start</ToneBadge> : null}
                  </TableCell>
                  <TableCell><OrderStatusBadge status={row.status} />{row.reason && row.status !== "locked" ? <p className="mt-1 text-xs text-muted-foreground">{row.reason}</p> : null}</TableCell>
                  <TableCell>{profileLabel(row.profile as Profile)}</TableCell>
                  <TableCell className="whitespace-nowrap">{DELIVERY_LABEL[row.deliveryOption]}</TableCell>
                  <TableCell>{row.days}</TableCell>
                  <TableCell className="min-w-56 whitespace-normal">{row.conflicts.length ? <ConflictList conflicts={row.conflicts} /> : <span className="text-muted-foreground">{S.none}</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </div>
  );
}
