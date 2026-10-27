"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/owner/use-action";
import { setNutritionAction } from "@/app/staff/nutrition/actions";

type Macro = { kcal: number; proteinG: number; carbG: number; fatG: number };
type Size = "S" | "M" | "L";
type Goal = "lean" | "build";

const n = (label: string, max: number) => z.number({ error: `${label}: enter a number.` }).int(`${label}: whole numbers only.`).min(1, `${label} must be above 0.`).max(max, `${label} is too high.`);
const schema = z.object({
  size: z.enum(["S", "M", "L"]), goal: z.enum(["lean", "build"]),
  kcalTarget: n("Calories", 6000), proteinG: n("Protein", 600), carbG: n("Carbs", 900), fatG: n("Fat", 400), note: z.string().max(500).optional(),
});
type Values = z.infer<typeof schema>;

/** Set / override form. Changing size or goal fills the standard targets for that profile; any edited number is an override. */
export function SetNutritionForm({ clientId, defaults, suggestion, presets, help }: {
  clientId: string;
  defaults: Values;
  suggestion: (Macro & { size: Size; goal: Goal }) | null;
  presets: Record<Goal, Record<Size, Macro>>;
  help: string;
}) {
  const { pending, run } = useAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { register, handleSubmit, setValue, getValues, formState: { errors } } = form;
  const fill = (size: Size, goal: Goal) => {
    const p = presets[goal][size];
    setValue("kcalTarget", p.kcal); setValue("proteinG", p.proteinG); setValue("carbG", p.carbG); setValue("fatG", p.fatG);
  };
  const num = { valueAsNumber: true } as const;
  const err = (m?: string) => (m ? <p className="text-sm text-danger">{m}</p> : null);

  return (
    <form className="space-y-4" onSubmit={handleSubmit((v) => run(() => setNutritionAction({ clientId, ...v }), () => form.reset(v)))}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nf-size">Size</Label>
          <select id="nf-size" className="h-11 w-full rounded-md border bg-background px-3" {...register("size", { onChange: (e) => fill(e.target.value, getValues("goal")) })}>
            <option value="S">S (Small)</option><option value="M">M (Medium)</option><option value="L">L (Large)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-goal">Goal</Label>
          <select id="nf-goal" className="h-11 w-full rounded-md border bg-background px-3" {...register("goal", { onChange: (e) => fill(getValues("size"), e.target.value) })}>
            <option value="lean">Lean</option><option value="build">Build</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["kcalTarget", "Calories (kcal)"], ["proteinG", "Protein (g)"], ["carbG", "Carbs (g)"], ["fatG", "Fat (g)"]] as const).map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`nf-${k}`}>{label}</Label>
            <Input id={`nf-${k}`} type="number" inputMode="numeric" className="h-11" {...register(k, num)} />
            {err(errors[k]?.message)}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nf-note">Reason or note (optional, saved in the change log)</Label>
        <Textarea id="nf-note" rows={2} {...register("note")} />
      </div>
      <p className="text-sm text-muted-foreground">{help}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={pending}>Save targets</Button>
        {suggestion ? (
          <Button type="button" variant="outline" className="h-11" onClick={() => {
            setValue("size", suggestion.size); setValue("goal", suggestion.goal);
            setValue("kcalTarget", suggestion.kcal); setValue("proteinG", suggestion.proteinG); setValue("carbG", suggestion.carbG); setValue("fatG", suggestion.fatG);
          }}>Use the calculator values</Button>
        ) : null}
      </div>
    </form>
  );
}
