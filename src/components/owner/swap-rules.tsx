"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSwapRuleAction, updateSwapRuleAction } from "@/app/staff/settings/actions";
import { useAction } from "./use-action";

const QTY = [["same", "Same grams"], ["fixed", "Fixed amount (g or pcs at base)"], ["multiply", "Multiply grams"], ["add", "Add extra (g at base)"]] as const;
const COST = [["zero", "No extra cost"], ["price_difference", "Price difference"]] as const;
const qtyValue = z.preprocess((v) => (v === "" || v == null || Number.isNaN(v) ? null : Number(v)), z.number().positive("Must be above 0.").max(1000).nullable());
const base = { qtyMode: z.enum(["same", "fixed", "multiply", "add"]), qtyValue, costMode: z.enum(["zero", "price_difference"]) };
const needsQty = (v: { qtyMode: string; qtyValue: unknown }) => v.qtyMode === "same" || v.qtyValue != null;
const editSchema = z.object({ label: z.string().trim().min(1, "Give the swap a label."), active: z.boolean(), ...base })
  .refine(needsQty, { message: "Enter the quantity for this mode.", path: ["qtyValue"] });
const newSchema = z.object({ label: z.string().trim().min(1, "Give the swap a label."), fromIngredientId: z.string().min(1, "Pick the ingredient to swap from."),
  fromMealCode: z.string(), toIngredientId: z.string().min(1, "Pick the ingredient to swap to."), ...base })
  .refine(needsQty, { message: "Enter the quantity for this mode.", path: ["qtyValue"] });

const sel = "h-11 w-full rounded-md border bg-background px-3 text-sm";
const err = (m?: unknown) => (m ? <p className="text-sm text-red-700">{String(m)}</p> : null);

export function SwapRuleRow({ rule, canEdit }: {
  rule: { id: string; label: string; active: boolean; qtyMode: string; qtyValue: number | null; costMode: string; fromKind: string; fromText: string; toText: string };
  canEdit: boolean;
}) {
  const { pending, run } = useAction();
  type In = z.input<typeof editSchema>; type Out = z.output<typeof editSchema>;
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(editSchema), defaultValues: {
    label: rule.label, active: rule.active, qtyMode: rule.qtyMode as Out["qtyMode"], qtyValue: rule.qtyValue ?? "", costMode: rule.costMode as Out["costMode"] } });
  const { register, handleSubmit, formState: { errors, isDirty } } = form;
  const id = (k: string) => `sr-${rule.id}-${k}`;
  return (
    <form className="space-y-3 rounded-xl border p-4" onSubmit={handleSubmit((v) => run(() => updateSwapRuleAction({ id: rule.id, ...v, qtyValue: v.qtyValue as number | null }), () => form.reset(form.getValues())))}>
      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{rule.fromText}</span> → {rule.toText}</p>
      <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="col-span-2 space-y-1.5"><Label htmlFor={id("label")}>Label</Label><Input id={id("label")} className="h-11" {...register("label")} />{err(errors.label?.message)}</div>
        <div className="space-y-1.5"><Label htmlFor={id("qm")}>Quantity</Label>
          <select id={id("qm")} className={sel} disabled={rule.fromKind === "slot"} {...register("qtyMode")}>{QTY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor={id("qv")}>Amount</Label><Input id={id("qv")} type="number" step="any" className="h-11" {...register("qtyValue")} />{err(errors.qtyValue?.message)}</div>
        <div className="space-y-1.5"><Label htmlFor={id("cm")}>Cost</Label>
          <select id={id("cm")} className={sel} {...register("costMode")}>{COST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </fieldset>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-[#c2410c]" {...register("active")} />Active (clients can pick it)</label>
          <Button type="submit" className="h-11" disabled={pending || !isDirty}>Save</Button>
        </div>
      ) : null}
    </form>
  );
}

export function NewSwapRule({ ingredients, meals }: { ingredients: { id: string; name: string }[]; meals: { code: string; name: string }[] }) {
  const { pending, run } = useAction();
  type In = z.input<typeof newSchema>; type Out = z.output<typeof newSchema>;
  const empty: In = { label: "", fromIngredientId: "", fromMealCode: "", toIngredientId: "", qtyMode: "same", qtyValue: "", costMode: "zero" };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(newSchema), defaultValues: empty });
  const { register, handleSubmit, formState: { errors } } = form;
  return (
    <form className="space-y-3" onSubmit={handleSubmit((v) => run(() => createSwapRuleAction({ ...v, fromMealCode: v.fromMealCode || undefined, qtyValue: v.qtyValue as number | null }), () => form.reset(empty)))}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="col-span-2 space-y-1.5 md:col-span-3"><Label htmlFor="ns-label">Label clients see</Label><Input id="ns-label" className="h-11" placeholder="Rice → sweet potato" {...register("label")} />{err(errors.label?.message)}</div>
        <div className="space-y-1.5"><Label htmlFor="ns-from">Swap from</Label>
          <select id="ns-from" className={sel} {...register("fromIngredientId")}><option value="">Pick an ingredient</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>{err(errors.fromIngredientId?.message)}</div>
        <div className="space-y-1.5"><Label htmlFor="ns-to">Swap to</Label>
          <select id="ns-to" className={sel} {...register("toIngredientId")}><option value="">Pick an ingredient</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>{err(errors.toIngredientId?.message)}</div>
        <div className="col-span-2 space-y-1.5 md:col-span-1"><Label htmlFor="ns-meal">Only in meal (optional)</Label>
          <select id="ns-meal" className={sel} {...register("fromMealCode")}><option value="">Any meal</option>{meals.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="ns-qm">Quantity</Label><select id="ns-qm" className={sel} {...register("qtyMode")}>{QTY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="ns-qv">Amount</Label><Input id="ns-qv" type="number" step="any" className="h-11" {...register("qtyValue")} />{err(errors.qtyValue?.message)}</div>
        <div className="space-y-1.5"><Label htmlFor="ns-cm">Cost</Label><select id="ns-cm" className={sel} {...register("costMode")}>{COST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <Button type="submit" className="h-11" disabled={pending}>Add swap rule</Button>
    </form>
  );
}
