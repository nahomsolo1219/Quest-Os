import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { IngredientRow } from "@/components/owner/ingredient-row";
import { serviceCtx } from "@/server/session";
import { listIngredients } from "@/server/services/catalog";
import { formatAddisDateTime } from "@/domain/time";
import { cn } from "@/lib/utils";
import { TONE_PANEL } from "@/components/shell/status-badge";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingredients" };

export default async function IngredientsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const actor = await requireSettingsTab("ingredients.read");
  const { show } = await searchParams;
  const d = await listIngredients(await serviceCtx(actor));
  // default to "Missing price" while any price is missing (UI refresh item 13); ?show=all shows everything
  const filter: "missing" | "all" = show === "all" || show === "missing" ? show : d.missingCount > 0 ? "missing" : "all";
  const list = filter === "missing" ? d.ingredients.filter((i) => i.needsPrice && i.costPerUnitBirr === null) : d.ingredients;
  const chip = (on: boolean) => cn("inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium",
    on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted");
  return (
    <div>
      <PageHeader title={S.tabs.ingredients} description={S.ingredientsIntro} />
      <div data-tour="settings-ingredients" className={cn("mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4", d.missingCount ? TONE_PANEL.warn : TONE_PANEL.good)}>
        <p className="stat-number text-xl">{S.missing(d.missingCount)}</p>
        <nav aria-label="Filter" className="flex flex-wrap gap-2">
          <Link href="/staff/settings/ingredients?show=missing" aria-current={filter === "missing" ? "page" : undefined} className={chip(filter === "missing")}>Missing price ({d.missingCount})</Link>
          <Link href="/staff/settings/ingredients?show=all" aria-current={filter === "all" ? "page" : undefined} className={chip(filter === "all")}>All ({d.ingredients.length})</Link>
        </nav>
      </div>
      {list.length === 0 ? <EmptyState title="Every ingredient has a price." action={<Link href="/staff/settings/ingredients?show=all" className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Show all ingredients</Link>}>Show all to edit prices or nutrition values.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card px-4">
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
