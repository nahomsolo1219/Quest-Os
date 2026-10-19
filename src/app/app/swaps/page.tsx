import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { AddonButton, AddSwapButton, CustomSwapForm, EndSwapButton } from "@/components/client/swap-controls";
import { requirePageActor, serviceCtx } from "@/server/session";
import { mySwaps } from "@/server/services/client-app";
import { formatBirr } from "@/domain/money";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { SLOT_LABELS, T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Swaps" };

export default async function SwapsPage() {
  const actor = await requirePageActor("client");
  const s = await mySwaps(await serviceCtx(actor));
  if (!s.hasPlan) return (
    <div className="space-y-4">
      <PageHeader title={T.swaps.title} />
      <EmptyState title={T.swaps.noPlan}>Your first invoice is on the Payments screen.</EmptyState>
    </div>
  );
  const full = s.used >= s.swapLimit;
  return (
    <div className="space-y-5">
      <PageHeader title={T.swaps.title} description={T.swaps.effective(formatDate(s.week, "long"), formatAddisDateTime(s.cutoff))} />
      <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
        <p className="stat-number text-4xl">{s.used}<span className="text-xl"> / {s.swapLimit}</span></p>
        <p className="text-sm">{T.swaps.count(s.used, s.swapLimit, s.packageName ?? "")}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">{T.swaps.current}</h2>
        {s.current.length === 0 ? <EmptyState title={T.swaps.none}>{T.swaps.noneHint}</EmptyState> : (
          <ul className="space-y-2">
            {s.current.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <Badge variant={c.status === "approved" ? "default" : "secondary"} className="mr-1">{T.swaps.status[c.status]}</Badge>
                    {T.swaps.from(formatDate(c.effectiveWeekStart))}{c.endedWeekStart ? ` · ${T.swaps.until(formatDate(c.endedWeekStart))}` : ""}
                  </p>
                </div>
                {!c.endedWeekStart ? <EndSwapButton id={c.id} label={c.custom && c.status === "requested" ? T.swaps.withdraw : T.swaps.end} /> : null}
              </li>
            ))}
          </ul>
        )}
        {s.history.length ? (
          <div className="text-sm text-muted-foreground">
            <p className="font-medium">{T.swaps.rejectedNotes}</p>
            <ul className="list-disc pl-5">{s.history.map((h) => <li key={h.id}>{h.label}{h.note ? ` — ${h.note}` : ""}</li>)}</ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">{T.swaps.table}</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {s.rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.extraCost ? T.swaps.extraCost : T.swaps.free}</p>
              </div>
              {r.standing ? <span className="text-xs font-semibold text-emerald-700">{T.swaps.standing}</span> : <AddSwapButton ruleId={r.id} disabled={full} />}
            </li>
          ))}
        </ul>
        {full ? <p className="text-sm text-amber-800">Your {s.packageName} plan allows {s.swapLimit} standing swaps. End one to add another.</p> : null}
      </section>

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">{T.swaps.custom}</h2>
        <p className="text-sm text-muted-foreground">{T.swaps.customHint}</p>
        <CustomSwapForm />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">{T.swaps.addon}</h2>
        <p className="text-sm text-muted-foreground">{T.swaps.addonHint}</p>
        <ul className="divide-y rounded-xl border bg-card">
          {s.addons.map((a) => (
            <li key={a.slot} className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium">{SLOT_LABELS[a.slot]}</p>
                <p className="text-xs text-muted-foreground">
                  {a.active ? `${formatBirr(a.active.pricePerPortionBirr)} per portion · from ${formatDate(a.active.effectiveWeekStart)}`
                    : a.priceBirr != null ? `${formatBirr(a.priceBirr)} per portion` : T.swaps.addonMissing}
                </p>
              </div>
              {a.active || a.priceBirr != null ? <AddonButton slot={a.slot} activeId={a.active?.id ?? null} /> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
