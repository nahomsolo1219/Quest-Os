import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Stat } from "@/components/shell/stat";
import { ContributionForm, DeleteContribution } from "@/components/owner/contribution-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { listContributions } from "@/server/services/partners";
import { formatBirr } from "@/domain/money";
import { addisDate, formatDate } from "@/domain/time";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partners" };

const TYPE: Record<string, string> = { cash: "Cash", time: "Time", equipment: "Equipment", other: "Other" };

export default async function PartnersPage() {
  const actor = await requirePageActor("owner");
  const ctx = await serviceCtx(actor);
  const d = await listContributions(ctx);
  return (
    <div className="space-y-6">
      <PageHeader title={S.title} description={S.intro} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{S.totals}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {d.totals.map((t, i) => (
            <Card key={t.partnerUserId} data-tour={i === 0 ? "partners-totals" : undefined}>
              <CardHeader><CardTitle>{t.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Cash" value={formatBirr(t.cashBirr)} />
                  <Stat label="Time" value={t.hours} unit="h" />
                </div>
                <p className="text-sm text-muted-foreground">{t.count} {t.count === 1 ? "entry" : "entries"} · {Object.entries(t.byType).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${TYPE[k].toLowerCase()}`).join(", ") || "none yet"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card data-tour="partners-add">
          <CardHeader><CardTitle>{S.add}</CardTitle></CardHeader>
          <CardContent><ContributionForm partners={d.partners} today={addisDate(ctx.now)} /></CardContent>
        </Card>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{S.log}</h2>
          {d.entries.length === 0 ? <EmptyState title={S.empty} /> : (
            <ul className="divide-y rounded-xl border px-3 bg-card">
              {d.entries.map(({ c, partnerName }) => (
                <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{partnerName} <Badge variant="outline" className="ml-1">{TYPE[c.type]}</Badge></p>
                    <p className="text-sm">
                      {c.amountBirr != null ? formatBirr(c.amountBirr) : null}{c.amountBirr != null && c.hours != null ? " · " : null}{c.hours != null ? `${c.hours} h` : null}
                      {c.note ? <span className="text-muted-foreground">{c.amountBirr != null || c.hours != null ? " · " : ""}{c.note}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(c.contributedOn, "long")}</p>
                  </div>
                  <DeleteContribution id={c.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
