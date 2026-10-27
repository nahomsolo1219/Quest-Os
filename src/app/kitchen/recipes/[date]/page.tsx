import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PrintButton } from "@/components/kitchen/print-button";
import { SheetNav } from "@/components/kitchen/sheet-nav";
import { KitchenSheet, More, PhoneCards, WideTable } from "@/components/kitchen/sheet";
import { TickBox } from "@/components/kitchen/tick-box";
import { qty, SLOT_LABEL } from "@/components/kitchen/format";
import { profileLabel } from "@/domain/format";
import { formatDate } from "@/domain/time";
import { cn } from "@/lib/utils";
import { requirePageActor, serviceCtx } from "@/server/session";
import { recipeCards } from "@/server/services/kitchen";
import { cookDateParam } from "../../params";
import { S } from "../../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recipe cards" };

// Screen sizes first, then the unchanged print sizes (print:*).
const CELL = "px-3 py-3 print:p-2";
const STICKY = "sticky left-0 z-[1] bg-white print:static print:bg-transparent";

export default async function RecipesPage({ params }: { params: Promise<{ date: string }> }) {
  const date = await cookDateParam(params);
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const cards = await recipeCards(await serviceCtx(actor), date);

  return (
    <div className="mx-auto max-w-5xl">
      <SheetNav date={date} current="recipes" />
      <PageHeader title={`${S.recipes} · ${formatDate(date, "long")}`}
        description={cards.length ? <span className="text-base print:text-sm">{cards.length} meals</span> : undefined}
        actions={cards.length ? <PrintButton /> : null} />
      {cards.length === 0 ? <EmptyState title={S.emptyDay}>{S.emptyDayBody}</EmptyState> : (
        <div className="space-y-6">
          {cards.map((c, i) => (
            <KitchenSheet key={c.mealId} className={cn("print:rounded-xl print:border print:p-4", i > 0 && "print-break")}>
              <article aria-label={c.mealName}>
                <header className="mb-4 print:mb-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary print:text-xs">{SLOT_LABEL[c.slot]}</p>
                  <h2 className="text-2xl font-bold print:text-xl">{c.mealName}</h2>
                  <p className="text-base text-muted-foreground print:text-sm">{c.description}</p>
                  <p className="mt-2 text-lg print:text-sm">
                    <span className="font-semibold">{c.portions} portions:</span>{" "}
                    {c.countByProfile.map((p) => `${profileLabel(p.profile)} × ${p.count}`).join(" · ")}
                  </p>
                </header>

                <PhoneCards label={`${c.mealName} parts`}>
                  {c.parts.map((p) => (
                    <li key={p.partId} className="flex items-start gap-2 rounded-xl border p-3 has-[input:checked]:bg-success-soft">
                      <TickBox id={`recipes:${date}:${c.mealId}:${p.partId}`} label={`Done: ${p.name}`} className="-ml-2 -mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold leading-snug">{p.name}<span className="block text-sm font-normal text-muted-foreground">{p.category}</span></p>
                          <p className="shrink-0 text-right tabular-nums"><span className="block text-sm text-muted-foreground">Base</span>{qty(p.baseQty, p.unit)}</p>
                        </div>
                        <p className="mt-1 text-base">{p.ingredients.map((x) => `${x.name} ${qty(x.qty, p.unit)}`).join(", ")}</p>
                        <More summary="Per profile">
                          <ul className="space-y-1">
                            {p.perProfile.map((pp) => (
                              <li key={pp.profile} className="flex justify-between gap-2 tabular-nums">
                                <span>{profileLabel(pp.profile)}</span><span className="font-semibold">{pp.qty == null ? "–" : qty(pp.qty, p.unit)}</span>
                              </li>
                            ))}
                          </ul>
                        </More>
                      </div>
                    </li>
                  ))}
                </PhoneCards>

                <WideTable className="rounded-lg">
                  <table className="w-full min-w-[560px] text-base lg:text-lg print:text-sm">
                    <thead className="bg-muted text-left print:bg-muted/60">
                      <tr>
                        <th scope="col" className={cn(CELL, STICKY, "bg-muted")}>Part</th>
                        <th scope="col" className={CELL}>Ingredients (base recipe)</th>
                        <th scope="col" className={cn(CELL, "text-right")}>Base</th>
                        {c.countByProfile.map((p) => <th key={p.profile} scope="col" className={cn(CELL, "whitespace-nowrap text-right print:whitespace-normal")}>{profileLabel(p.profile)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {c.parts.map((p) => (
                        <tr key={p.partId} className="border-t align-top has-[input:checked]:bg-success-soft">
                          <td className={cn("py-1 pr-3 pl-1 font-medium print:p-2", STICKY, "has-[input:checked]:bg-success-soft")}>
                            <div className="flex items-start gap-1 print:gap-1.5">
                              <TickBox id={`recipes:${date}:${c.mealId}:${p.partId}`} label={`Done: ${p.name}`} />
                              <span className="pt-2 print:pt-0">{p.name}<span className="block text-sm text-muted-foreground print:text-xs">{p.category}</span></span>
                            </div>
                          </td>
                          <td className={CELL}>{p.ingredients.map((x) => `${x.name} ${qty(x.qty, p.unit)}`).join(", ")}</td>
                          <td className={cn(CELL, "whitespace-nowrap text-right tabular-nums")}>{qty(p.baseQty, p.unit)}</td>
                          {p.perProfile.map((pp) => <td key={pp.profile} className={cn(CELL, "whitespace-nowrap text-right font-semibold tabular-nums")}>{pp.qty == null ? "–" : qty(pp.qty, p.unit)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </WideTable>

                <dl className="mt-4 grid gap-3 text-lg sm:grid-cols-2 print:mt-3 print:gap-2 print:text-sm">
                  <div><dt className="font-semibold">{S.seasonings}</dt><dd>{c.seasonings.length ? c.seasonings.join(", ") : "None"}</dd></div>
                  <div><dt className="font-semibold">{S.pantry}</dt><dd>{c.pantry.length ? `${c.pantry.join(", ")} (pantry)` : "None"}</dd></div>
                </dl>
                {c.swaps.length ? (
                  <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft p-3 text-lg print:mt-3 print:text-sm">
                    <p className="font-semibold">{S.swapsToday}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {c.swaps.map((s) => <li key={`${s.partName}|${s.qty}|${s.profile}`}>{s.partName}: {qty(s.qty, s.unit)} × {s.count} ({profileLabel(s.profile)})</li>)}
                    </ul>
                  </div>
                ) : null}
              </article>
            </KitchenSheet>
          ))}
        </div>
      )}
    </div>
  );
}
