"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logWasteAction } from "@/app/kitchen/actions";
import type { PurchaseUnit } from "@/domain/types";
import { units } from "./format";

const REASONS = ["Spoiled", "Burnt", "Dropped", "Past eat-by", "Returned by client", "Other"];

const schema = z.object({
  ingredientId: z.string().min(1, "Pick an ingredient."),
  qty: z.number({ error: "Enter the amount wasted." }).positive("Enter the amount wasted (above zero)."),
  reason: z.string().min(1, "Pick a reason."),
  note: z.string().max(150).optional(),
  date: z.string().min(1, "Pick a date."),
});
type Values = z.infer<typeof schema>;

export function WasteForm({ ingredients, today }: { ingredients: { id: string; name: string; unit: PurchaseUnit }[]; today: string }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { ingredientId: "", reason: "", note: "", date: today } });
  const selected = ingredients.find((i) => i.id === form.watch("ingredientId"));
  const err = form.formState.errors;
  return (
    <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" onSubmit={form.handleSubmit(async (v) => {
      const reason = v.reason === "Other" || v.note ? [v.reason, v.note].filter(Boolean).join(": ") : v.reason;
      const r = await logWasteAction({ ingredientId: v.ingredientId, qty: v.qty, reason, date: v.date });
      if (r.ok) {
        toast.success(`${r.data.ingredientName}: ${units(r.data.qtyUnits, r.data.unit)} logged as waste`);
        form.reset({ ingredientId: "", reason: "", note: "", date: v.date });
      } else toast.error(r.error);
    })}>
      <div className="space-y-1.5">
        <Label htmlFor="waste-ingredient">Ingredient</Label>
        <select id="waste-ingredient" className="h-11 w-full rounded-md border bg-background px-3" {...form.register("ingredientId")}>
          <option value="">Pick an ingredient</option>
          {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {err.ingredientId ? <p className="text-sm text-danger">{err.ingredientId.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="waste-qty">Amount{selected ? ` (${selected.unit === "piece" ? "pieces" : selected.unit})` : ""}</Label>
        <Input id="waste-qty" type="number" inputMode="decimal" min={0} step={selected?.unit === "piece" ? 1 : 0.05} className="h-11"
          {...form.register("qty", { valueAsNumber: true })} />
        {err.qty ? <p className="text-sm text-danger">{err.qty.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="waste-reason">Reason</Label>
        <select id="waste-reason" className="h-11 w-full rounded-md border bg-background px-3" {...form.register("reason")}>
          <option value="">Pick a reason</option>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {err.reason ? <p className="text-sm text-danger">{err.reason.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="waste-note">Note (optional)</Label>
        <Input id="waste-note" className="h-11" maxLength={150} {...form.register("note")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="waste-date">Date</Label>
        <Input id="waste-date" type="date" max={today} defaultValue={today} className="h-11" {...form.register("date")} />
        {err.date ? <p className="text-sm text-danger">{err.date.message}</p> : null}
      </div>
      <div className="flex items-end">
        <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>Log waste</Button>
      </div>
    </form>
  );
}
