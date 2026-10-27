"use client";

import { useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setIngredientNutritionAction, setPriceAction } from "@/app/staff/settings/actions";
import { useAction } from "./use-action";
import type { ActionResult } from "@/server/actions";
import { StatusBadge } from "@/components/shell/status-badge";

const priceSchema = z.object({
  costPerUnitBirr: z.number().int("Price: whole birr only.").positive("Price must be above 0.").nullable(),
  supplier: z.string().max(120),
});
const nutSchema = z.object({ kcal: z.number().min(0).max(1000), proteinG: z.number().min(0).max(1000), carbG: z.number().min(0).max(1000), fatG: z.number().min(0).max(1000) });

type Ing = {
  id: string; name: string; foodGroup: string; purchaseUnit: string; nutritionBasis: string; costPerUnitBirr: number | null; supplier: string | null;
  kcal: number; proteinG: number; carbG: number; fatG: number; needsPrice: boolean; history: { cost: number; source: string; at: string; by: string | null }[];
};

/** One ingredient: price per purchase unit + supplier, and nutrition values (per 100 g or per piece). */
export function IngredientRow({ ing, canPrice, canSupplier, canNutrition }: { ing: Ing; canPrice: boolean; canSupplier: boolean; canNutrition: boolean }) {
  const { pending, run } = useAction();
  const [price, setPrice] = useState(ing.costPerUnitBirr?.toString() ?? "");
  const [supplier, setSupplier] = useState(ing.supplier ?? "");
  const [nut, setNut] = useState({ kcal: String(ing.kcal), proteinG: String(ing.proteinG), carbG: String(ing.carbG), fatG: String(ing.fatG) });
  const [error, setError] = useState<string | null>(null);
  const unit = ing.purchaseUnit === "piece" ? "piece" : ing.purchaseUnit;
  const basis = ing.nutritionBasis === "per_piece" ? "per piece" : "per 100 g";
  const p = (k: string) => `ing-${ing.id}-${k}`;

  const priceDirty = ing.needsPrice && canPrice && (price.trim() !== (ing.costPerUnitBirr?.toString() ?? "") || (canSupplier && supplier.trim() !== (ing.supplier ?? "")));
  const nutDirty = canNutrition && (["kcal", "proteinG", "carbG", "fatG"] as const).some((k) => Number(nut[k]) !== ing[k] || nut[k].trim() === "");
  const canSave = (ing.needsPrice && canPrice) || canNutrition;

  /** One Save per row: saves the price (and supplier) and/or the nutrition values, whichever changed. */
  const save = () => {
    const pr = priceSchema.safeParse({ costPerUnitBirr: price.trim() === "" ? null : Number(price), supplier: supplier.trim() });
    if (priceDirty && !pr.success) return setError(pr.error.issues[0].message);
    const nv = nutSchema.safeParse({ kcal: Number(nut.kcal), proteinG: Number(nut.proteinG), carbG: Number(nut.carbG), fatG: Number(nut.fatG) });
    if (nutDirty && (!nv.success || (["kcal", "proteinG", "carbG", "fatG"] as const).some((k) => nut[k].trim() === ""))) {
      return setError("Nutrition values must be numbers from 0 to 1000.");
    }
    setError(null);
    run(async (): Promise<ActionResult<undefined>> => {
      const messages: string[] = [];
      if (priceDirty && pr.success) {
        const r = await setPriceAction({ id: ing.id, costPerUnitBirr: pr.data.costPerUnitBirr, supplier: canSupplier ? pr.data.supplier : undefined });
        if (!r.ok) return r;
        if (r.message) messages.push(r.message);
      }
      if (nutDirty && nv.success) {
        const r = await setIngredientNutritionAction({ id: ing.id, ...nv.data });
        if (!r.ok) return r;
        if (r.message) messages.push(r.message);
      }
      return { ok: true, data: undefined, message: messages.join(" ") || "Saved." };
    });
  };

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{ing.name}</h3>
        <Badge variant="outline" className="capitalize">{ing.foodGroup}</Badge>
        {ing.needsPrice && ing.costPerUnitBirr === null ? <StatusBadge tone="warn">Price missing</StatusBadge> : null}
        {!ing.needsPrice ? <Badge variant="secondary">Costed as eggs</Badge> : null}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {ing.needsPrice ? (
          <div className="flex gap-2 lg:flex-1">
            <div className="w-28 shrink-0 space-y-1">
              <label htmlFor={p("price")} className="text-sm font-medium">ETB per {unit}</label>
              <Input id={p("price")} type="number" inputMode="numeric" className="h-11 bg-card" value={price} disabled={!canPrice} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor={p("sup")} className="text-sm font-medium">Supplier</label>
              <Input id={p("sup")} className="h-11 bg-card" value={supplier} disabled={!canSupplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
          </div>
        ) : <p className="text-sm text-muted-foreground lg:flex-1 lg:pt-8">Uses one egg per piece: price and stock come from Eggs.</p>}
        <fieldset className="min-w-0 lg:w-80">
          <legend className="sr-only">Nutrition {basis}</legend>
          <div className="grid grid-cols-4 gap-2">
            {(["kcal", "proteinG", "carbG", "fatG"] as const).map((k) => (
              <div key={k} className="min-w-0 space-y-1">
                <label htmlFor={p(k)} className="whitespace-nowrap text-sm font-medium">{k === "kcal" ? "kcal" : k === "proteinG" ? "Prot. g" : k === "carbG" ? "Carb g" : "Fat g"}</label>
                <Input id={p(k)} type="number" step="any" inputMode="decimal" className="h-11 bg-card px-2" value={nut[k]} disabled={!canNutrition}
                  onChange={(e) => setNut({ ...nut, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Nutrition {basis}</p>
        </fieldset>
        {canSave ? (
          <div className="flex items-center gap-3 lg:mt-6">
            <Button type="button" className="h-11 min-w-24" disabled={pending || !(priceDirty || nutDirty)} onClick={save}>Save</Button>
            {priceDirty || nutDirty ? <span className="text-xs text-muted-foreground lg:hidden">Unsaved changes</span> : null}
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {ing.history.length ? (
        <p className="text-xs text-muted-foreground">Price history: {ing.history.map((h) => `${h.cost} ETB (${h.source}, ${h.at}${h.by ? `, ${h.by}` : ""})`).join(" · ")}</p>
      ) : null}
    </li>
  );
}
