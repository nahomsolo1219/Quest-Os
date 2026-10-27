import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PrintButton } from "@/components/kitchen/print-button";
import { SheetNav } from "@/components/kitchen/sheet-nav";
import { KitchenSheet, More, PhoneCards, WideTable } from "@/components/kitchen/sheet";
import { TickBox } from "@/components/kitchen/tick-box";
import { qty, SLOT_LABEL, units } from "@/components/kitchen/format";
import { Badge } from "@/components/ui/badge";
import { profileLabel } from "@/domain/format";
import { formatDate } from "@/domain/time";
import { cn } from "@/lib/utils";
import { requirePageActor, serviceCtx } from "@/server/session";
import { productionForDate } from "@/server/services/kitchen";
import { cookDateParam } from "../../params";
import { S } from "../../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production sheet" };

// Screen sizes first, then the unchanged print sizes (print:*).
const CELL = "px-3 py-3 print:p-2";
const STICKY = "sticky left-0 z-[1] bg-white print:static print:bg-transparent";
const isSwapPart = (name: string) => name.includes("→") || name.startsWith("Extra");

export default async function ProductionPage({ params }: { params: Promise<{ date: string }> }) {
  const date = await cookDateParam(params);
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const sheet = await productionForDate(await serviceCtx(actor), date);
  const meals = [...new Map(sheet.rows.map((r) => [r.mealId, { mealId: r.mealId, mealName: r.mealName, slot: r.slot }])).values()];
  const tickId = (r: { mealId: string; partName: string; unit: string }) => `production:${date}:${r.mealId}|${r.partName}|${r.unit}`;

  return (
    <div className="mx-auto max-w-6xl">
      <SheetNav date={date} current="production" />
      <KitchenSheet>
        <PageHeader title={`${S.production} · ${formatDate(date, "long")}`}
          description={sheet.mealsCount ? <span className="text-base print:text-sm">{sheet.mealsCount} meals for {sheet.clientsCount} clients{sheet.quickStartMeals ? <> · includes {sheet.quickStartMeals} quick-start meals ({sheet.quickStartClients} clients)</> : null}</span> : undefined}
          actions={sheet.mealsCount ? <PrintButton tour="production-print" /> : null} />
        {sheet.mealsCount === 0 ? (
          <EmptyState title={S.emptyDay}>{S.emptyDayBody}</EmptyState>
        ) : (
          <>
            {/* Phones: one card per part, grouped by meal. */}
            <PhoneCards label={S.production}>
              {meals.map((m, mi) => (
                <li key={m.mealId} data-tour={mi === 0 ? "production-first-meal" : undefined}>
                  <h2 className="mb-2 text-lg font-bold leading-snug">
                    <span className="mr-1 text-sm font-semibold uppercase tracking-wide text-primary">{SLOT_LABEL[m.slot]}</span>{" "}{m.mealName}
                  </h2>
                  <ul className="divide-y rounded-xl border">
                    {sheet.rows.filter((r) => r.mealId === m.mealId).map((r) => {
                      const portions = r.perProfile.reduce((n, c) => n + c.count, 0);
                      return (
                        <li key={`${r.partName}|${r.unit}`} className="flex items-start gap-2 p-3 has-[input:checked]:bg-success-soft">
                          <TickBox id={tickId(r)} label={`Done: ${r.partName}`} className="-ml-2 -mt-1" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn("font-semibold leading-snug", isSwapPart(r.partName) && "text-warning")}>{r.partName}</p>
                              <p className="shrink-0 text-right font-bold tabular-nums">{qty(r.total, r.unit, true)}</p>
                            </div>
                            <p className="text-base text-muted-foreground">
                              {portions} {portions === 1 ? "portion" : "portions"}
                              {r.quickStartCount > 0 ? <Badge variant="secondary" className="ml-2">QS {r.quickStartCount}</Badge> : null}
                            </p>
                            <More summary="Per profile">
                              <ul className="space-y-1">
                                {r.perProfile.map((c) => (
                                  <li key={`${c.profile}|${c.qty}`} className="flex justify-between gap-2 tabular-nums">
                                    <span>{profileLabel(c.profile)}</span><span>{qty(c.qty, r.unit)} × {c.count}</span>
                                  </li>
                                ))}
                              </ul>
                            </More>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </PhoneCards>

            {/* md and up, and always in print: the full table. */}
            <WideTable>
              <table className="w-full min-w-[640px] text-base lg:text-lg print:text-sm">
                <thead className="bg-muted text-left print:bg-muted/60">
                  <tr>
                    <th scope="col" className={cn(CELL, STICKY, "bg-muted")}>Part</th>
                    {sheet.profiles.map((p) => <th key={p} scope="col" className={cn(CELL, "whitespace-nowrap text-right print:whitespace-normal")}>{profileLabel(p)}</th>)}
                    <th scope="col" className={cn(CELL, "text-right")}>Total</th>
                  </tr>
                </thead>
                {meals.map((m, mi) => {
                  const rows = sheet.rows.filter((r) => r.mealId === m.mealId);
                  return (
                    <tbody key={m.mealId} data-tour={mi === 0 ? "production-first-meal" : undefined} className="print-avoid-break border-t">
                      <tr className="bg-primary/5">
                        <th colSpan={sheet.profiles.length + 2} scope="colgroup" className={cn(CELL, "text-left")}>
                          <span className="sticky left-3 inline-block print:static print:inline">
                            <span className="text-sm font-semibold uppercase tracking-wide text-primary print:text-xs">{SLOT_LABEL[m.slot]}</span>{" "}
                            <span className="font-bold">{m.mealName}</span>
                          </span>
                        </th>
                      </tr>
                      {rows.map((r) => (
                        <tr key={`${r.partName}|${r.unit}`} className="border-t align-top has-[input:checked]:bg-success-soft">
                          <td className={cn("py-1 pr-3 pl-1 print:p-2", STICKY, "has-[input:checked]:bg-success-soft")}>
                            <div className="flex items-center gap-1 print:gap-1.5">
                              <TickBox id={tickId(r)} label={`Done: ${r.partName}`} />
                              <span className={isSwapPart(r.partName) ? "font-semibold text-warning" : ""}>{r.partName}</span>
                              {r.quickStartCount > 0 ? <Badge variant="secondary" className="ml-1">QS {r.quickStartCount}</Badge> : null}
                            </div>
                          </td>
                          {sheet.profiles.map((p) => {
                            const cells = r.perProfile.filter((c) => c.profile === p);
                            return (
                              <td key={p} className={cn(CELL, "whitespace-nowrap text-right tabular-nums")}>
                                {cells.length === 0 ? <span className="text-muted-foreground">–</span> : cells.map((c) => (
                                  <div key={c.qty}>{qty(c.qty, r.unit)} × {c.count}</div>
                                ))}
                              </td>
                            );
                          })}
                          <td className={cn(CELL, "whitespace-nowrap text-right font-bold tabular-nums")}>{qty(r.total, r.unit, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </WideTable>

            <section className="mt-8 print-break print:mt-6" data-tour="production-ingredients">
              <h2 className="text-xl font-bold print:text-lg">{S.ingredientTotals}</h2>
              <p className="mb-3 text-base text-muted-foreground print:mb-2 print:text-sm">{S.ingredientTotalsBody}</p>
              <ul aria-label={S.ingredientTotals} className="divide-y rounded-xl border md:hidden print:hidden">
                {sheet.ingredients.map((i) => (
                  <li key={i.ingredientId} className="flex items-baseline justify-between gap-3 p-3">
                    <span className="min-w-0">{i.name}<span className="block text-base text-muted-foreground tabular-nums">{qty(i.qty, i.unit)}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{units(i.purchaseQty, i.purchaseUnit)}</span>
                  </li>
                ))}
              </ul>
              <WideTable>
                <table className="w-full min-w-[420px] text-base lg:text-lg print:text-sm">
                  <thead className="bg-muted text-left print:bg-muted/60">
                    <tr>
                      <th scope="col" className={cn(CELL, STICKY, "bg-muted")}>Ingredient</th>
                      <th scope="col" className={cn(CELL, "text-right")}>As weighed</th>
                      <th scope="col" className={cn(CELL, "text-right")}>Purchase units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.ingredients.map((i) => (
                      <tr key={i.ingredientId} className="border-t">
                        <td className={cn(CELL, STICKY)}>{i.name}</td>
                        <td className={cn(CELL, "text-right tabular-nums")}>{qty(i.qty, i.unit)}</td>
                        <td className={cn(CELL, "text-right font-semibold tabular-nums")}>{units(i.purchaseQty, i.purchaseUnit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WideTable>
            </section>
          </>
        )}
      </KitchenSheet>
    </div>
  );
}
