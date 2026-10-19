"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChoiceGroup } from "@/components/public/choice-group";
import { ACTIVITY_LABELS, GOAL_LABELS, SEX_LABELS, SIZE_LABELS } from "@/components/public/labels";
import { NativeSelect } from "@/components/client/native-select";
import { FieldError } from "@/components/client/field-error";
import { suggestNutrition, type NutritionSuggestion } from "@/domain/nutrition";
import { formatBirr } from "@/domain/money";
import type { NutritionSettings } from "@/domain/settings";
import { ACTIVITIES, GOALS, SEXES } from "@/domain/types";
import { indicativePriceAction } from "./actions";
import { S } from "./strings";

export const bodySchema = z.object({
  sex: z.enum(SEXES, "Choose male or female."),
  age: z.number("Enter your age.").int("Whole years.").min(14, "Age 14 to 90.").max(90, "Age 14 to 90."),
  weightKg: z.number("Enter your weight.").min(30, "Weight 30 to 250 kg.").max(250, "Weight 30 to 250 kg."),
  heightCm: z.number("Enter your height.").min(120, "Height 120 to 230 cm.").max(230, "Height 120 to 230 cm."),
  activity: z.enum(ACTIVITIES, "Choose how active you are."),
  goal: z.enum(GOALS, "Choose Lean or Build."),
});
type Body = z.infer<typeof bodySchema>;

export function CalculatorForm({ nutrition }: { nutrition: NutritionSettings }) {
  const form = useForm<Body>({ resolver: zodResolver(bodySchema), defaultValues: { activity: "moderate" } });
  const [result, setResult] = useState<{ body: Body; s: NutritionSuggestion } | null>(null);
  const [price, setPrice] = useState<number | null | "loading">(null);
  const [, start] = useTransition();
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((body) => {
    const s = suggestNutrition(body, nutrition);
    setResult({ body, s });
    setPrice("loading");
    start(async () => {
      const r = await indicativePriceAction({ profile: s.profile });
      setPrice(r.ok && r.data ? r.data.planPrice : null);
    });
  });

  const query = result ? new URLSearchParams({
    sex: result.body.sex, age: String(result.body.age), w: String(result.body.weightKg), h: String(result.body.heightCm),
    activity: result.body.activity, goal: result.body.goal,
  }).toString() : "";

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ChoiceGroup name="sex" legend={S.sex} value={form.watch("sex")} onChange={(v) => form.setValue("sex", v, { shouldValidate: true })}
          options={SEXES.map((v) => ({ value: v, label: SEX_LABELS[v] }))} />
        <FieldError message={e.sex?.message} />
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="age">{S.age}</Label>
            <Input id="age" type="number" inputMode="numeric" className="h-11" {...form.register("age", { valueAsNumber: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">{S.weight}</Label>
            <Input id="weightKg" type="number" inputMode="decimal" step="0.1" className="h-11" {...form.register("weightKg", { valueAsNumber: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="heightCm">{S.height}</Label>
            <Input id="heightCm" type="number" inputMode="numeric" className="h-11" {...form.register("heightCm", { valueAsNumber: true })} />
          </div>
        </div>
        <FieldError message={e.age?.message ?? e.weightKg?.message ?? e.heightCm?.message} />
        <div className="space-y-1.5">
          <Label htmlFor="activity">{S.activity}</Label>
          <NativeSelect id="activity" {...form.register("activity")}>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
          </NativeSelect>
        </div>
        <ChoiceGroup name="goal" legend={S.goal} value={form.watch("goal")} onChange={(v) => form.setValue("goal", v, { shouldValidate: true })}
          options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g].title, hint: GOAL_LABELS[g].hint }))} />
        <FieldError message={e.goal?.message} />
        <Button type="submit" className="h-12 w-full text-base">{S.calculate}</Button>
      </form>

      {result ? (
        <section aria-live="polite" className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{S.tdee}</p>
              <p className="stat-number text-3xl">{result.s.tdee.toLocaleString("en-US")}</p>
              <p className="text-xs text-muted-foreground">{S.tdeeUnit}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{S.target}</p>
              <p className="stat-number text-3xl">{result.s.targetKcal.toLocaleString("en-US")}</p>
              <p className="text-xs text-muted-foreground">kcal · {GOAL_LABELS[result.body.goal].title}</p>
            </div>
          </div>
          <div className="rounded-xl bg-primary p-4 text-primary-foreground">
            <p className="text-xs font-medium uppercase tracking-wide opacity-90">{S.size}</p>
            <p className="stat-number text-5xl">{result.s.size}<span className="ml-2 text-xl font-bold">{SIZE_LABELS[result.s.size]}</span></p>
            <p className="mt-1 text-sm">{S.sizeNote(result.s.sizeKcal)}</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{S.macros}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Protein", result.s.proteinG], ["Carbs", result.s.carbG], ["Fat", result.s.fatG]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-muted p-2">
                  <p className="stat-number text-2xl">{v} g</p>
                  <p className="text-xs text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{S.price}</p>
            {price === "loading" ? <p className="text-sm text-muted-foreground">{S.priceLoading}</p>
              : price == null ? <p className="text-sm">{S.priceMissing}</p>
                : <><p className="stat-number text-2xl">{formatBirr(price)}</p><p className="text-xs text-muted-foreground">{S.priceNote}</p></>}
          </div>
          <Button asChild className="h-12 w-full text-base"><Link href={`/signup?${query}`}>{S.cta}</Link></Button>
          <p className="text-center text-sm text-muted-foreground">{S.ctaNote}</p>
        </section>
      ) : null}
    </div>
  );
}
