import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PrintButton } from "@/components/kitchen/print-button";
import { SheetNav } from "@/components/kitchen/sheet-nav";
import { qty, SLOT_LABEL } from "@/components/kitchen/format";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shell/status-badge";
import { TickBox } from "@/components/kitchen/tick-box";
import { profileLabel } from "@/domain/format";
import { formatDate } from "@/domain/time";
import { cn } from "@/lib/utils";
import { requirePageActor, serviceCtx } from "@/server/session";
import { packingForDate } from "@/server/services/kitchen";
import { cookDateParam } from "../../params";
import { S } from "../../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Packing list" };

export default async function PackingPage({ params }: { params: Promise<{ date: string }> }) {
  const date = await cookDateParam(params);
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const list = await packingForDate(await serviceCtx(actor), date);
  const withConflicts = list.filter((c) => c.hasConflicts).length;

  return (
    <div className="mx-auto max-w-5xl">
      <SheetNav date={date} current="packing" />
      <PageHeader title={`${S.packing} · ${formatDate(date, "long")}`}
        description={list.length ? <span className="text-base print:text-sm">{list.length} clients{withConflicts ? <> · <span className="font-semibold text-danger">{withConflicts} with allergy or dislike conflicts</span></> : null}</span> : undefined}
        actions={list.length ? <PrintButton /> : null} />
      {list.length === 0 ? <EmptyState title={S.emptyDay}>{S.emptyDayBody}</EmptyState> : (
        <div className="grid gap-4 lg:grid-cols-2 print:block">
          {list.map((c, ci) => (
            <section key={c.clientId} aria-label={c.name}
              className={cn("print-avoid-break rounded-xl border bg-white p-4 text-lg text-charcoal sm:p-5 print:mb-3 print:p-4 print:text-[11pt] print:text-black", c.hasConflicts && "border-2 border-danger/60")}>
              <header className="flex flex-wrap items-start justify-between gap-2" data-tour={ci === 0 ? "packing-first-client" : undefined}>
                <div>
                  <h2 className="text-xl font-bold print:text-lg">{c.name}</h2>
                  <p className="text-base text-muted-foreground print:text-sm">
                    {c.delivery === "pickup" ? S.pickup : `${S.delivery}${c.areaName ? ` · ${c.areaName}` : ""}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.isQuickStart ? <Badge variant="secondary">{S.quickStart}</Badge> : null}
                  {c.injeraSeparate ? <StatusBadge tone="warn">{S.injera}</StatusBadge> : null}
                </div>
              </header>
              {c.allergies.length ? <p className="mt-1 text-base font-semibold text-danger print:text-sm">Allergies: {c.allergies.join(", ")}</p> : null}
              {c.hasConflicts ? (
                <div role="alert" className="mt-2 rounded-md bg-danger-soft p-3 text-base text-danger print:p-2 print:text-sm">
                  <p className="font-bold">{S.conflict}</p>
                  <ul className="list-disc pl-5">{c.conflicts.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ) : null}
              <ul className="mt-3 space-y-4 print:space-y-3">
                {c.meals.map((m) => (
                  <li key={`${m.serviceDate}|${m.slot}`} className="flex items-start gap-1 border-t pt-2 has-[input:checked]:bg-success-soft print:block">
                    <TickBox id={`packing:${date}:${c.clientId}:${m.serviceDate}|${m.slot}`} label={`Packed: ${SLOT_LABEL[m.slot]} for ${c.name}`} className="-ml-2" />
                    <div className="min-w-0 flex-1">
                    <p className="text-lg leading-snug print:text-sm print:leading-5">
                      <span className="font-semibold">{SLOT_LABEL[m.slot]}: {m.mealName}</span>{" "}
                      <span className="text-muted-foreground">· {profileLabel(m.profile)}{m.serviceDate !== date ? ` · for ${formatDate(m.serviceDate)}` : ""} · eat by {formatDate(m.eatBy)}</span>
                    </p>
                    <ul className="mt-1 space-y-1 text-lg print:space-y-0 print:text-sm">
                      {m.items.map((it) => (
                        <li key={it.partName} className={cn("flex justify-between gap-2", it.swapped && "font-semibold text-warning")}>
                          <span>{it.partName}{it.swapped && !it.partName.includes("→") ? " (swap)" : ""}</span>
                          <span className="tabular-nums">{qty(it.qty, it.unit)}</span>
                        </li>
                      ))}
                    </ul>
                    {m.conflicts.length ? <p className="mt-1 text-base font-semibold text-danger print:text-sm">{m.conflicts.join("; ")}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
