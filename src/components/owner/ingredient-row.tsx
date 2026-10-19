"use client";

import { useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setIngredientNutritionAction, setPriceAction } from "@/app/staff/settings/actions";
import { useAction } from "./use-action";

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

  const savePrice = () => {
    const parsed = priceSchema.safeParse({ costPerUnitBirr: price.trim() === "" ? null : Number(price), supplier });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    run(() => setPriceAction({ id: ing.id, ...parsed.data, supplier: canSupplier ? parsed.data.supplier : undefined }));
  };
  const saveNut = () => {
    const parsed = nutSchema.safeParse({ kcal: Number(nut.kcal), proteinG: Number(nut.proteinG), carbG: Number(nut.carbG), fatG: Number(nut.fatG) });
    if (!parsed.success) return setError("Nutrition values must be numbers from 0 to 1000.");
    setError(null);
    run(() => setIngredientNutritionAction({ id: ing.id, ...parsed.data }));
  };

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{ing.name}</h3>
        <Badge variant="outline" className="capitalize">{ing.foodGroup}</Badge>
        {ing.needsPrice && ing.costPerUnitBirr === null ? <Badge className="bg-amber-100 text-amber-900" variant="secondary">Price missing</Badge> : null}
        {!ing.needsPrice ? <Badge variant="secondary">Costed as eggs</Badge> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {ing.needsPrice ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-32 space-y-1">
              <label htmlFor={p("price")} className="text-sm font-medium">ETB per {unit}</label>
              <Input id={p("price")} type="number" inputMode="numeric" className="h-11" value={price} disabled={!canPrice} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="min-w-32 flex-1 space-y-1">
              <label htmlFor={p("sup")} className="text-sm font-medium">Supplier</label>
              <Input id={p("sup")} className="h-11" value={supplier} disabled={!canSupplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            {canPrice ? <Button type="button" className="h-11" disabled={pending} onClick={savePrice}>Save price</Button> : null}
          </div>
        ) : <p className="text-sm text-muted-foreground">Uses one egg per piece: price and stock come from Eggs.</p>}
        <div className="flex flex-wrap items-end gap-2">
          {(["kcal", "proteinG", "carbG", "fatG"] as const).map((k) => (
            <div key={k} className="w-20 space-y-1">
              <label htmlFor={p(k)} className="text-sm font-medium">{k === "kcal" ? "kcal" : k === "proteinG" ? "Prot. g" : k === "carbG" ? "Carb g" : "Fat g"}</label>
              <Input id={p(k)} type="number" step="any" inputMode="decimal" className="h-11" value={nut[k]} disabled={!canNutrition}
                onChange={(e) => setNut({ ...nut, [k]: e.target.value })} />
            </div>
          ))}
          {canNutrition ? <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={saveNut}>Save {basis}</Button> : <span className="pb-3 text-xs text-muted-foreground">{basis}</span>}
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {ing.history.length ? (
        <p className="text-xs text-muted-foreground">Price history: {ing.history.map((h) => `${h.cost} ETB (${h.source}, ${h.at}${h.by ? `, ${h.by}` : ""})`).join(" · ")}</p>
      ) : null}
    </li>
  );
}
