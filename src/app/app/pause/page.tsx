import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Deadline } from "@/components/shell/deadline";
import { BackToPlan } from "@/components/client/plan-links";
import { PauseForm } from "@/components/client/pause-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { pauseOptions } from "@/server/services/client-app";
import { addDays, formatDate } from "@/domain/time";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pause" };

export default async function PausePage() {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const o = await pauseOptions(ctx);
  return (
    <div className="space-y-4">
      <div>
        <BackToPlan />
        <PageHeader title={T.pause.title} description={T.pause.intro} />
      </div>
      {!o.subscription || o.weeks.length === 0 ? (
        <EmptyState title={T.pause.none}>{T.pause.noneHint}</EmptyState>
      ) : (
        <section className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="space-y-1 border-b pb-3">
            <p className="text-sm">{T.pause.cutoff(formatDate(o.weeks[0], "long"))}</p>
            <Deadline cutoff={o.cutoff} now={ctx.now} />
          </div>
          <PauseForm weeks={o.weeks} endDate={o.subscription.endDate} />
        </section>
      )}
      {o.pauses.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{T.pause.existing}</h2>
          <ul className="divide-y rounded-2xl border bg-card text-sm">
            {o.pauses.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center px-4 py-3">{formatDate(p.startWeek, "long")} – {formatDate(addDays(p.startWeek, 7 * p.weeks - 1), "long")} ({p.weeks} week{p.weeks > 1 ? "s" : ""})</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
