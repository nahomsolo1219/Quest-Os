import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { CheckinForm } from "@/components/nutrition/checkin-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { can } from "@/server/authz";
import { checkinList } from "@/server/services/nutrition";
import { displayName } from "@/domain/format";
import { daysBetween, formatDate } from "@/domain/time";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-ins" };

export default async function CheckinsPage() {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const d = await checkinList(await serviceCtx(actor));
  return (
    <div className="space-y-6">
      <PageHeader title={S.tabs.checkins} description={S.checkinsIntro} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{S.overdueTitle} ({d.overdue.length})</CardTitle></CardHeader>
          <CardContent>
            {d.overdue.length === 0 ? <EmptyState title={S.overdueEmpty} /> : (
              <ul className="divide-y">
                {d.overdue.map((c) => (
                  <li key={c.id}>
                    <Link href={`/staff/nutrition/clients/${c.id}`} className="flex min-h-11 items-center justify-between py-2 hover:text-primary">
                      <span className="font-medium">{displayName(c.firstName, c.lastName)}</span>
                      <span className="text-sm text-warning">{c.last ? `Last ${formatDate(c.last)} (${daysBetween(c.last, d.today)} days)` : "Never checked in"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {can(actor, "checkins.write") ? (
          <Card>
            <CardHeader><CardTitle>{S.logCheckin}</CardTitle></CardHeader>
            <CardContent>
              {d.clients.length === 0 ? <EmptyState title="No active clients to check in." /> :
                <CheckinForm today={d.today} clients={d.clients.map((c) => ({ id: c.id, name: displayName(c.firstName, c.lastName) }))} />}
            </CardContent>
          </Card>
        ) : null}
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{S.recentTitle}</h2>
        {d.recent.length === 0 ? <EmptyState title={S.recentEmpty} /> : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Weight</TableHead><TableHead>Adherence</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.recent.map((r) => (
                  <TableRow key={r.c.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.c.checkinDate)}</TableCell>
                    <TableCell><Link className="font-medium hover:text-primary" href={`/staff/nutrition/clients/${r.c.clientId}`}>{displayName(r.firstName, r.lastName)}</Link></TableCell>
                    <TableCell className="tabular-nums">{r.c.weightG != null ? `${(r.c.weightG / 1000).toFixed(1)} kg` : "–"}</TableCell>
                    <TableCell className="tabular-nums">{r.c.adherencePct != null ? `${r.c.adherencePct}%` : "–"}</TableCell>
                    <TableCell className="max-w-64 text-sm text-muted-foreground">{r.c.source === "client" ? "Client" : r.byName ?? "Nutritionist"}{r.c.notes ? ` · ${r.c.notes}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
