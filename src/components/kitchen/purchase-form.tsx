"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logPurchaseAction } from "@/app/staff/purchasing/actions";
import { formatBirr } from "@/domain/money";
import type { PurchaseUnit } from "@/domain/types";

const schema = z.object({
  ingredientId: z.string().min(1, "Pick an ingredient."),
  qty: z.number({ error: "Enter the quantity bought." }).positive("Enter the quantity bought."),
  totalPriceBirr: z.number({ error: "Enter the total price." }).int("Whole birr only.").positive("Enter the total price."),
  supplier: z.string().max(120).optional(),
  purchasedOn: z.string().min(1, "Enter the purchase date."),
});
type Values = z.infer<typeof schema>;

const UNIT_WORD: Record<PurchaseUnit, string> = { kg: "kg", litre: "litres", piece: "pieces" };

/** Log purchase: ingredient, quantity in purchase units, total price, supplier, date. Shows the new unit cost. */
export function PurchaseForm({ ingredients, today }: {
  ingredients: { id: string; name: string; unit: PurchaseUnit; costPerUnitBirr: number | null }[]; today: string;
}) {
  const [last, setLast] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { ingredientId: "", supplier: "", purchasedOn: today } });
  const selected = ingredients.find((i) => i.id === form.watch("ingredientId"));
  const err = form.formState.errors;
  return (
    <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" onSubmit={form.handleSubmit(async (v) => {
      const r = await logPurchaseAction({ ...v, supplier: v.supplier || undefined });
      if (r.ok) {
        const msg = `${r.data.ingredientName}: new unit cost ${formatBirr(r.data.unitCostBirr)} per ${r.data.unit}`;
        setLast(msg);
        toast.success(msg);
        form.reset({ ingredientId: "", supplier: v.supplier, purchasedOn: v.purchasedOn });
      } else toast.error(r.error);
    })}>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="p-ingredient">Ingredient</Label>
        <select id="p-ingredient" className="h-11 w-full rounded-md border bg-background px-3" {...form.register("ingredientId")}>
          <option value="">Pick an ingredient</option>
          {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit}){i.costPerUnitBirr == null ? " · price missing" : ""}</option>)}
        </select>
        {err.ingredientId ? <p className="text-sm text-danger">{err.ingredientId.message}</p> : null}
        {selected ? <p className="text-sm text-muted-foreground">Current price: {selected.costPerUnitBirr == null ? "price missing" : `${formatBirr(selected.costPerUnitBirr)} per ${selected.unit}`}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-qty">Quantity{selected ? ` (${UNIT_WORD[selected.unit]})` : ""}</Label>
        <Input id="p-qty" type="number" inputMode="decimal" min={0} step={selected?.unit === "piece" ? 1 : 0.1} className="h-11"
          {...form.register("qty", { valueAsNumber: true })} />
        {err.qty ? <p className="text-sm text-danger">{err.qty.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-price">Total price (ETB)</Label>
        <Input id="p-price" type="number" inputMode="numeric" min={1} step={1} className="h-11" {...form.register("totalPriceBirr", { valueAsNumber: true })} />
        {err.totalPriceBirr ? <p className="text-sm text-danger">{err.totalPriceBirr.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-supplier">Supplier</Label>
        <Input id="p-supplier" className="h-11" maxLength={120} placeholder="e.g. Shola market" {...form.register("supplier")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-date">Purchase date</Label>
        <Input id="p-date" type="date" max={today} defaultValue={today} className="h-11" {...form.register("purchasedOn")} />
        {err.purchasedOn ? <p className="text-sm text-danger">{err.purchasedOn.message}</p> : null}
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={form.formState.isSubmitting}>Log purchase</Button>
        {last ? <p role="status" className="mt-2 text-sm font-semibold text-success">{last}</p> : null}
      </div>
    </form>
  );
}
