import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PrintButton } from "@/components/kitchen/print-button";
import { SheetNav } from "@/components/kitchen/sheet-nav";
import { qty, SLOT_LABEL, units } from "@/components/kitchen/format";
import { Badge } from "@/components/ui/badge";
import { profileLabel } from "@/domain/format";
import { formatDate } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { productionForDate } from "@/server/services/kitchen";
import { cookDateParam } from "../../params";
import { S } from "../../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production sheet" };

export default async function ProductionPage({ params }: { params: Promise<{ date: string }> }) {
  const date = await cookDateParam(params);
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const sheet = await productionForDate(await serviceCtx(actor), date);
  const meals = [...new Map(sheet.rows.map((r) => [r.mealId, { mealId: r.mealId, mealName: r.mealName, slot: r.slot }])).values()];

  return (
    <div className="mx-auto max-w-6xl">
      <SheetNav date={date} current="production" />
      <PageHeader title={`${S.production} · ${formatDate(date, "long")}`}
        description={sheet.mealsCount ? <>{sheet.mealsCount} meals for {sheet.clientsCount} clients{sheet.quickStartMeals ? <> · includes {sheet.quickStartMeals} quick-start meals ({sheet.quickStartClients} clients)</> : null}</> : undefined}
        actions={sheet.mealsCount ? <PrintButton /> : null} />
      {sheet.mealsCount === 0 ? (
        <EmptyState title={S.emptyDay}>{S.emptyDayBody}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th scope="col" className="p-2">Part</th>
                  {sheet.profiles.map((p) => <th key={p} scope="col" className="p-2 text-right">{profileLabel(p)}</th>)}
                  <th scope="col" className="p-2 text-right">Total</th>
                </tr>
              </thead>
              {meals.map((m) => {
                const rows = sheet.rows.filter((r) => r.mealId === m.mealId);
                return (
                  <tbody key={m.mealId} className="print-avoid-break border-t">
                    <tr className="bg-primary/5">
                      <th colSpan={sheet.profiles.length + 2} scope="colgroup" className="p-2 text-left">
                        <span className="text-xs font-semibold uppercase tracking-wide text-primary">{SLOT_LABEL[m.slot]}</span>{" "}
                        <span className="font-bold">{m.mealName}</span>
                      </th>
                    </tr>
                    {rows.map((r) => (
                      <tr key={`${r.partName}|${r.unit}`} className="border-t align-top">
                        <td className="p-2">
                          <span className={r.partName.includes("→") || r.partName.startsWith("Extra") ? "font-semibold text-warning" : ""}>{r.partName}</span>
                          {r.quickStartCount > 0 ? <Badge variant="secondary" className="ml-2">QS {r.quickStartCount}</Badge> : null}
                        </td>
                        {sheet.profiles.map((p) => {
                          const cells = r.perProfile.filter((c) => c.profile === p);
                          return (
                            <td key={p} className="whitespace-nowrap p-2 text-right tabular-nums">
                              {cells.length === 0 ? <span className="text-muted-foreground">–</span> : cells.map((c) => (
                                <div key={c.qty}>{qty(c.qty, r.unit)} × {c.count}</div>
                              ))}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap p-2 text-right font-bold tabular-nums">{qty(r.total, r.unit, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>

          <section className="mt-6 print-break">
            <h2 className="text-lg font-bold">{S.ingredientTotals}</h2>
            <p className="mb-2 text-sm text-muted-foreground">{S.ingredientTotalsBody}</p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr><th scope="col" className="p-2">Ingredient</th><th scope="col" className="p-2 text-right">As weighed</th><th scope="col" className="p-2 text-right">Purchase units</th></tr>
                </thead>
                <tbody>
                  {sheet.ingredients.map((i) => (
                    <tr key={i.ingredientId} className="border-t">
                      <td className="p-2">{i.name}</td>
                      <td className="p-2 text-right tabular-nums">{qty(i.qty, i.unit)}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{units(i.purchaseQty, i.purchaseUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
