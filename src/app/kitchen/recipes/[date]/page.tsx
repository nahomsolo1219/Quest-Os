import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PrintButton } from "@/components/kitchen/print-button";
import { SheetNav } from "@/components/kitchen/sheet-nav";
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

export default async function RecipesPage({ params }: { params: Promise<{ date: string }> }) {
  const date = await cookDateParam(params);
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const cards = await recipeCards(await serviceCtx(actor), date);

  return (
    <div className="mx-auto max-w-5xl">
      <SheetNav date={date} current="recipes" />
      <PageHeader title={`${S.recipes} · ${formatDate(date, "long")}`} description={cards.length ? `${cards.length} meals` : undefined}
        actions={cards.length ? <PrintButton /> : null} />
      {cards.length === 0 ? <EmptyState title={S.emptyDay}>{S.emptyDayBody}</EmptyState> : (
        <div className="space-y-6">
          {cards.map((c, i) => (
            <article key={c.mealId} className={cn("rounded-xl border bg-card p-4", i > 0 && "print-break")}>
              <header className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{SLOT_LABEL[c.slot]}</p>
                <h2 className="text-xl font-bold">{c.mealName}</h2>
                <p className="text-sm text-muted-foreground">{c.description}</p>
                <p className="mt-2 text-sm">
                  <span className="font-semibold">{c.portions} portions:</span>{" "}
                  {c.countByProfile.map((p) => `${profileLabel(p.profile)} × ${p.count}`).join(" · ")}
                </p>
              </header>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th scope="col" className="p-2">Part</th>
                      <th scope="col" className="p-2">Ingredients (base recipe)</th>
                      <th scope="col" className="p-2 text-right">Base</th>
                      {c.countByProfile.map((p) => <th key={p.profile} scope="col" className="p-2 text-right">{profileLabel(p.profile)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {c.parts.map((p) => (
                      <tr key={p.partId} className="border-t align-top">
                        <td className="p-2 font-medium">{p.name}<span className="block text-xs text-muted-foreground">{p.category}</span></td>
                        <td className="p-2">{p.ingredients.map((x) => `${x.name} ${qty(x.qty, p.unit)}`).join(", ")}</td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">{qty(p.baseQty, p.unit)}</td>
                        {p.perProfile.map((pp) => <td key={pp.profile} className="whitespace-nowrap p-2 text-right font-semibold tabular-nums">{pp.qty == null ? "–" : qty(pp.qty, p.unit)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="font-semibold">{S.seasonings}</dt><dd>{c.seasonings.length ? c.seasonings.join(", ") : "None"}</dd></div>
                <div><dt className="font-semibold">{S.pantry}</dt><dd>{c.pantry.length ? `${c.pantry.join(", ")} (pantry)` : "None"}</dd></div>
              </dl>
              {c.swaps.length ? (
                <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
                  <p className="font-semibold">{S.swapsToday}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {c.swaps.map((s) => <li key={`${s.partName}|${s.qty}|${s.profile}`}>{s.partName}: {qty(s.qty, s.unit)} × {s.count} ({profileLabel(s.profile)})</li>)}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
