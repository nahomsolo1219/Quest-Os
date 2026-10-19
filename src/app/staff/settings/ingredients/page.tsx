import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { IngredientRow } from "@/components/owner/ingredient-row";
import { serviceCtx } from "@/server/session";
import { listIngredients } from "@/server/services/catalog";
import { formatAddisDateTime } from "@/domain/time";
import { cn } from "@/lib/utils";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingredients" };

export default async function IngredientsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const actor = await requireSettingsTab("ingredients.read");
  const { show } = await searchParams;
  const d = await listIngredients(await serviceCtx(actor));
  const list = show === "missing" ? d.ingredients.filter((i) => i.needsPrice && i.costPerUnitBirr === null) : d.ingredients;
  return (
    <div>
      <PageHeader title={S.tabs.ingredients} description={S.ingredientsIntro} />
      <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4", d.missingCount ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50")}>
        <p className="stat-number text-xl">{S.missing(d.missingCount)}</p>
        <nav aria-label="Filter" className="flex gap-2">
          <Link href="/staff/settings/ingredients" className={cn("inline-flex min-h-11 items-center rounded-full border bg-background px-4 text-sm", show !== "missing" && "border-primary font-semibold")}>All ({d.ingredients.length})</Link>
          <Link href="/staff/settings/ingredients?show=missing" className={cn("inline-flex min-h-11 items-center rounded-full border bg-background px-4 text-sm", show === "missing" && "border-primary font-semibold")}>Missing price ({d.missingCount})</Link>
        </nav>
      </div>
      {list.length === 0 ? <EmptyState title="Nothing to show.">Every ingredient has a price. Show all to edit nutrition values.</EmptyState> : (
        <ul className="divide-y rounded-xl border px-4">
          {list.map((i) => (
            <IngredientRow key={i.id} canPrice={d.canPrice} canSupplier={d.canSupplier} canNutrition={d.canNutrition}
              ing={{ id: i.id, name: i.name, foodGroup: i.foodGroup, purchaseUnit: i.purchaseUnit, nutritionBasis: i.nutritionBasis, costPerUnitBirr: i.costPerUnitBirr,
                supplier: i.supplier, kcal: i.kcal, proteinG: i.proteinG, carbG: i.carbG, fatG: i.fatG, needsPrice: i.needsPrice,
                history: i.history.map((h) => ({ cost: h.cost, source: h.source, at: formatAddisDateTime(h.at), by: h.by })) }} />
          ))}
        </ul>
      )}
    </div>
  );
}
