import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { WeightChart } from "@/components/client/weight-chart";
import { WeightForm } from "@/components/client/weight-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { myProgress } from "@/server/services/client-app";
import { progressSummary } from "@/domain/community";
import { signed } from "@/domain/format";
import { addisDate, formatDate } from "@/domain/time";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress" };

export default async function ProgressPage() {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const rows = await myProgress(ctx);
  // one point per day (the latest entry of the day)
  const byDay = new Map<string, number>();
  for (const r of rows) if (r.weightG) byDay.set(r.date, r.weightG);
  const points = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, g]) => ({ date, kg: Math.round(g / 100) / 10, label: formatDate(date) }));
  const summary = progressSummary(rows.map((r) => ({ checkinDate: r.date, weightG: r.weightG })));
  const notes = rows.filter((r) => r.source === "nutritionist" && r.notes).reverse();
  return (
    <div className="space-y-5">
      <PageHeader title={T.progress.title} />
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">{T.progress.log}</h2>
        <WeightForm today={addisDate(ctx.now)} />
      </section>
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-bold">{T.progress.chart}</h2>
          {summary ? <p className="stat-number text-lg text-primary">{T.progress.change(signed(summary.kgChange), summary.weeks)}</p> : null}
        </div>
        {points.length ? <WeightChart points={points} /> : <EmptyState title={T.progress.none}>{T.progress.noneHint}</EmptyState>}
        {points.length ? (
          <ul className="divide-y text-sm">
            {points.slice(-5).reverse().map((p) => <li key={p.date} className="flex justify-between py-2"><span>{formatDate(p.date, "long")}</span><span className="font-semibold tabular">{p.kg} kg</span></li>)}
          </ul>
        ) : null}
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">{T.progress.notes}</h2>
        {notes.length ? (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl border bg-card p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">{formatDate(n.date, "long")}{n.adherencePct != null ? ` · adherence ${n.adherencePct}%` : ""}</p>
                <p className="mt-1">{n.notes}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{T.progress.noNotes}</p>}
      </section>
    </div>
  );
}
