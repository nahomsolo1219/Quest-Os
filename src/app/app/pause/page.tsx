import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PauseForm } from "@/components/client/pause-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { pauseOptions } from "@/server/services/client-app";
import { addDays, formatAddisDateTime, formatDate } from "@/domain/time";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pause" };

export default async function PausePage() {
  const actor = await requirePageActor("client");
  const o = await pauseOptions(await serviceCtx(actor));
  return (
    <div className="space-y-4">
      <PageHeader title={T.pause.title} description={T.pause.intro} />
      {!o.subscription || o.weeks.length === 0 ? (
        <EmptyState title={T.pause.none}>{T.pause.noneHint}</EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{T.pause.cutoff(formatAddisDateTime(o.cutoff))}</p>
          <PauseForm weeks={o.weeks} endDate={o.subscription.endDate} />
        </>
      )}
      {o.pauses.length ? (
        <section className="space-y-2">
          <h2 className="font-bold">{T.pause.existing}</h2>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {o.pauses.map((p) => (
              <li key={p.id} className="p-3">{formatDate(p.startWeek, "long")} – {formatDate(addDays(p.startWeek, 7 * p.weeks - 1), "long")} ({p.weeks} week{p.weeks > 1 ? "s" : ""})</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
