import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { WasteForm } from "@/components/kitchen/waste-form";
import { units } from "@/components/kitchen/format";
import { addisDate, formatDate } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { stockIngredients, wasteEntries } from "@/server/services/inventory";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waste log" };

export default async function WastePage() {
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const ctx = await serviceCtx(actor);
  const [ingredients, entries] = await Promise.all([stockIngredients(ctx), wasteEntries(ctx)]);
  const canWrite = actor.roles.some((r) => r === "operations" || r === "kitchen");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={S.wasteTitle} description={S.wasteDescription} />
      {canWrite ? <WasteForm ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))} today={addisDate(ctx.now)} /> : null}
      <h2 className="mb-2 mt-6 text-lg font-bold">Recent waste</h2>
      {entries.length === 0 ? <EmptyState title={S.noWaste}>{S.noWasteBody}</EmptyState> : (
        <ul className="divide-y rounded-xl border">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-semibold">{e.ingredientName} · {units(e.qtyUnits, e.unit)}</p>
                <p className="text-muted-foreground">{e.reason}</p>
              </div>
              <p className="text-muted-foreground">{formatDate(e.date)}{e.byName ? ` · ${e.byName}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
