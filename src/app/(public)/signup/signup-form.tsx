"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChoiceGroup } from "@/components/public/choice-group";
import { TagInput } from "@/components/public/tag-input";
import { PhoneInput } from "@/components/public/phone-input";
import { ACTIVITY_LABELS, DELIVERY_LABELS, GOAL_LABELS, SEX_LABELS } from "@/components/public/labels";
import { NativeSelect } from "@/components/client/native-select";
import { FieldError } from "@/components/client/field-error";
import { authClient } from "@/lib/auth-client";
import { suggestNutrition } from "@/domain/nutrition";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { formatBirr } from "@/domain/money";
import { formatDate } from "@/domain/time";
import type { NutritionSettings } from "@/domain/settings";
import { ACTIVITIES, GOALS, SEXES, type Activity, type DeliveryOption, type Goal, type Sex } from "@/domain/types";
import { cn } from "@/lib/utils";
import { quoteAction, signUpAction } from "./actions";
import { S } from "./strings";

export type Prefill = { sex?: Sex; age?: number; weightKg?: number; heightCm?: number; activity?: Activity; goal?: Goal };
type Options = {
  packages: { id: string; code: string; name: string; swapLimit: number; checkinIntervalDays: number; coaching: string; deliveryOptions: DeliveryOption[] }[];
  areas: { id: string; name: string }[];
  deliveryOptions: DeliveryOption[];
  quickStartCutoffTime: string;
};

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name."),
  lastName: z.string().trim().min(1, "Enter your last name."),
  phone: z.string().refine((v) => normalizeEthiopianPhone(v) !== null, S.phoneInvalid),
  password: z.string().min(8, "Password must be at least 8 characters."),
  sex: z.enum(SEXES, "Choose male or female."),
  age: z.number("Enter your age.").int("Whole years.").min(14, "Age 14 to 90.").max(90, "Age 14 to 90."),
  weightKg: z.number("Enter your weight.").min(30, "Weight 30 to 250 kg.").max(250, "Weight 30 to 250 kg."),
  heightCm: z.number("Enter your height.").min(120, "Height 120 to 230 cm.").max(230, "Height 120 to 230 cm."),
  activity: z.enum(ACTIVITIES),
  goal: z.enum(GOALS, "Choose Lean or Build."),
  allergies: z.array(z.string()),
  dislikes: z.array(z.string()),
  deliveryOption: z.string().min(1, "Choose delivery or pick-up."),
  address: z.string(),
  areaId: z.string(),
  landmark: z.string(),
  packageId: z.string().min(1, "Choose a package."),
  billingPeriod: z.enum(["weekly", "monthly"]),
  start: z.enum(["quick_start", "next_week"]),
}).superRefine((v, ctx) => {
  if (v.deliveryOption && v.deliveryOption !== "pickup") {
    if (!v.address.trim()) ctx.addIssue({ code: "custom", path: ["address"], message: "Enter your delivery address." });
    if (!v.areaId) ctx.addIssue({ code: "custom", path: ["areaId"], message: "Choose your area." });
  }
});
type Values = z.infer<typeof schema>;

const STEP_FIELDS: FieldPath<Values>[][] = [
  ["firstName", "lastName", "phone", "password"],
  ["sex", "age", "weightKg", "heightCm", "activity", "goal"],
  ["allergies", "dislikes"],
  ["deliveryOption", "address", "areaId", "landmark"],
  ["packageId", "billingPeriod", "start"],
];

type Quote = { ok: false } | { ok: true; planPrice: number; priceDay: number; quickStart: { startDate: string; serviceDays: number; amount: number; capacityShifted: boolean } | null };

export function SignupForm({ options, nutrition, prefill, source }: { options: Options; nutrition: NutritionSettings; prefill: Prefill; source: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState<Quote | null | "loading">(null);
  const [submitting, startSubmit] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      firstName: "", lastName: "", phone: "", password: "", activity: prefill.activity ?? "moderate", sex: prefill.sex, goal: prefill.goal,
      age: prefill.age, weightKg: prefill.weightKg, heightCm: prefill.heightCm,
      allergies: [], dislikes: [], deliveryOption: options.deliveryOptions.includes("daily") ? "daily" : options.deliveryOptions[0], address: "", areaId: "", landmark: "",
      packageId: "", billingPeriod: "weekly", start: "quick_start",
    },
  });
  const v = form.watch();
  const e = form.formState.errors;
  const bodyOk = SEXES.includes(v.sex) && GOALS.includes(v.goal) && v.age >= 14 && v.age <= 90 && v.weightKg >= 30 && v.weightKg <= 250 && v.heightCm >= 120 && v.heightCm <= 230;
  const suggestion = bodyOk ? suggestNutrition({ sex: v.sex, age: v.age, weightKg: v.weightKg, heightCm: v.heightCm, activity: v.activity, goal: v.goal }, nutrition) : null;
  const pkg = options.packages.find((p) => p.id === v.packageId);

  useEffect(() => {
    if (step !== 4 || !suggestion || !v.packageId || !v.deliveryOption) return;
    let live = true;
    setQuote("loading");
    quoteAction({ profile: suggestion.profile, packageId: v.packageId, deliveryOption: v.deliveryOption }).then((r) => {
      if (live) setQuote(r.ok ? (r.data as Quote) : { ok: false });
    });
    return () => { live = false; };
  }, [step, suggestion?.profile, v.packageId, v.deliveryOption]); // eslint-disable-line react-hooks/exhaustive-deps

  // a package that does not offer the chosen delivery option is deselected
  useEffect(() => {
    if (pkg && !pkg.deliveryOptions.includes(v.deliveryOption as DeliveryOption)) form.setValue("packageId", "");
  }, [v.deliveryOption, pkg, form]);

  async function next() {
    if (await form.trigger(STEP_FIELDS[step])) setStep((s) => Math.min(s + 1, 4));
  }

  const onSubmit = form.handleSubmit((data) => {
    startSubmit(async () => {
      const r = await signUpAction({
        firstName: data.firstName, lastName: data.lastName, phone: data.phone, password: data.password,
        sex: data.sex, age: data.age, weightKg: data.weightKg, heightCm: data.heightCm, activity: data.activity, goal: data.goal,
        allergies: data.allergies, dislikes: data.dislikes, address: data.address, areaId: data.areaId || null, landmark: data.landmark,
        deliveryOption: data.deliveryOption, plan: { packageId: data.packageId, billingPeriod: data.billingPeriod, start: data.start }, source,
      });
      if (!r.ok) {
        toast.error(r.error);
        if (/phone/i.test(r.error)) setStep(0);
        return;
      }
      const plan = r.data.plan;
      const message = plan.status === "created" ? (plan.capacityShifted ? S.doneShifted(formatDate(plan.startDate, "long")) : S.doneCreated)
        : plan.status === "price_missing" ? S.donePriceMissing : plan.status === "failed" ? `${S.doneNoPlan} ${plan.error}` : S.doneNoPlan;
      const { error } = await authClient.signIn.phoneNumber({ phoneNumber: r.data.phone, password: data.password });
      if (error) {
        toast.success(S.signInFailed);
        router.replace("/login");
        return;
      }
      toast.success(message, { duration: 8000 });
      router.replace("/app/payments");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <ol className="grid grid-cols-5 gap-1" aria-label={S.step(step + 1, 5)}>
        {S.steps.map((label, i) => (
          <li key={label} className="space-y-1">
            <div className={cn("h-1.5 rounded-full", i < step ? "bg-primary" : i === step ? "bg-lime" : "bg-muted")} />
            <p className={cn("text-center text-xs", i === step ? "font-semibold text-primary" : "text-muted-foreground")} aria-current={i === step ? "step" : undefined}>{label}</p>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">{S.firstName}</Label>
              <Input id="firstName" autoComplete="given-name" className="h-11" {...form.register("firstName")} />
              <FieldError message={e.firstName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{S.lastName}</Label>
              <Input id="lastName" autoComplete="family-name" className="h-11" {...form.register("lastName")} />
              <FieldError message={e.lastName?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{S.phone}</Label>
            <PhoneInput id="phone" placeholder={S.phoneHint} aria-invalid={e.phone ? true : undefined} {...form.register("phone")} />
            <p className="text-xs text-muted-foreground">{S.phoneNote}</p>
            <FieldError message={e.phone?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{S.password}</Label>
            <Input id="password" type="password" autoComplete="new-password" className="h-11" {...form.register("password")} />
            <p className="text-xs text-muted-foreground">{S.passwordHint}</p>
            <FieldError message={e.password?.message} />
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <ChoiceGroup name="sex" legend="Sex" value={v.sex} onChange={(x) => form.setValue("sex", x, { shouldValidate: true })}
            options={SEXES.map((x) => ({ value: x, label: SEX_LABELS[x] }))} />
          <FieldError message={e.sex?.message} />
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="age">Age</Label>
              <Input id="age" type="number" inputMode="numeric" className="h-11" {...form.register("age", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weightKg">Weight kg</Label>
              <Input id="weightKg" type="number" step="0.1" inputMode="decimal" className="h-11" {...form.register("weightKg", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="heightCm">Height cm</Label>
              <Input id="heightCm" type="number" inputMode="numeric" className="h-11" {...form.register("heightCm", { valueAsNumber: true })} />
            </div>
          </div>
          <FieldError message={e.age?.message ?? e.weightKg?.message ?? e.heightCm?.message} />
          <div className="space-y-1.5">
            <Label htmlFor="activity">How active are you?</Label>
            <NativeSelect id="activity" className="bg-card" {...form.register("activity")}>
              {ACTIVITIES.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
            </NativeSelect>
          </div>
          <ChoiceGroup name="goal" legend="Your goal" value={v.goal} onChange={(x) => form.setValue("goal", x, { shouldValidate: true })}
            options={GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g].title, hint: GOAL_LABELS[g].hint }))} />
          <FieldError message={e.goal?.message} />
          {suggestion ? <p className="rounded-lg border border-primary/15 bg-accent p-3 text-sm text-accent-foreground">{S.sizeLive(suggestion.size, suggestion.sizeKcal)}</p> : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="allergies">{S.allergies}</Label>
            <TagInput id="allergies" value={v.allergies} onChange={(x) => form.setValue("allergies", x)} placeholder={S.allergiesHint} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dislikes">{S.dislikes}</Label>
            <TagInput id="dislikes" value={v.dislikes} onChange={(x) => form.setValue("dislikes", x)} placeholder={S.dislikesHint} />
          </div>
          <p className="text-sm text-muted-foreground">{S.foodNote}</p>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <ChoiceGroup name="deliveryOption" legend={S.howGet} columns={1} value={v.deliveryOption as DeliveryOption}
            onChange={(x) => form.setValue("deliveryOption", x, { shouldValidate: true })}
            options={options.deliveryOptions.map((d) => ({ value: d, label: DELIVERY_LABELS[d] }))} />
          {v.deliveryOption === "pickup" ? <p className="text-sm text-muted-foreground">{S.pickupNote}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="address">{S.address}</Label>
            <Input id="address" autoComplete="street-address" placeholder={S.addressHint} className="h-11" {...form.register("address")} />
            <FieldError message={e.address?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="areaId">{S.area}</Label>
            <NativeSelect id="areaId" className="bg-card" {...form.register("areaId")}>
              <option value="">{S.chooseArea}</option>
              {options.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </NativeSelect>
            <FieldError message={e.areaId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="landmark">{S.landmark}</Label>
            <Input id="landmark" placeholder={S.landmarkHint} className="h-11" {...form.register("landmark")} />
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">{S.package}</legend>
            {options.packages.map((p) => {
              const allowed = p.deliveryOptions.includes(v.deliveryOption as DeliveryOption);
              return (
                <label key={p.id} className={cn("relative block cursor-pointer rounded-xl border p-3 pr-11 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring",
                  v.packageId === p.id ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-input bg-card hover:border-primary/40 hover:bg-accent",
                  !allowed && "cursor-not-allowed opacity-50 hover:border-input hover:bg-card")}>
                  {v.packageId === p.id ? (
                    <span aria-hidden className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-lime text-forest"><Check className="size-4" strokeWidth={3} /></span>
                  ) : <span aria-hidden className="absolute right-3 top-3 size-6 rounded-full border border-input" />}
                  <input type="radio" name="packageId" value={p.id} disabled={!allowed} checked={v.packageId === p.id}
                    onChange={() => form.setValue("packageId", p.id, { shouldValidate: true })} className="sr-only" />
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold">{p.name}</span>
                    <span className={cn("text-sm font-semibold", v.packageId === p.id ? "text-lime" : "text-primary")}>{S.swaps(p.swapLimit)}</span>
                  </span>
                  <span className={cn("mt-1 block text-sm", v.packageId === p.id ? "text-primary-foreground/85" : "text-muted-foreground")}>
                    {S.checkins(p.checkinIntervalDays)} · {p.coaching} · {p.deliveryOptions.map((d) => DELIVERY_LABELS[d].split(" (")[0]).join(" or ")}
                  </span>
                  {!allowed ? <span className="mt-1 block text-xs">{S.notForDelivery}</span> : null}
                </label>
              );
            })}
            <FieldError message={e.packageId?.message} />
          </fieldset>
          <ChoiceGroup name="billingPeriod" legend={S.billing} value={v.billingPeriod} onChange={(x) => form.setValue("billingPeriod", x)}
            options={[{ value: "weekly", label: S.weekly }, { value: "monthly", label: S.monthly }]} />
          <ChoiceGroup name="start" legend={S.start} value={v.start} onChange={(x) => form.setValue("start", x)}
            options={[
              { value: "quick_start", label: S.startTomorrow(options.quickStartCutoffTime === "18:00" ? "6 pm" : options.quickStartCutoffTime), hint: S.startTomorrowHint },
              { value: "next_week", label: S.startMonday, hint: S.startMondayHint },
            ]} />
          {v.packageId ? (
            <section aria-live="polite" className="rounded-xl border border-primary/15 bg-accent p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{S.quote}</p>
              {quote === "loading" || quote === null ? <p className="text-sm text-muted-foreground">{S.quoteLoading}</p>
                : !quote.ok ? <p className="mt-1 text-sm font-medium text-warning">{S.priceMissing}</p>
                  : (
                    <div className="space-y-1">
                      <p className="stat-number text-3xl">{formatBirr(quote.planPrice)} <span className="text-sm font-semibold text-muted-foreground">{S.planMonth}</span></p>
                      {v.start === "quick_start" && quote.quickStart ? (
                        <>
                          <p className="text-sm">{S.firstPayment(formatBirr(quote.quickStart.amount), quote.quickStart.serviceDays, formatDate(quote.quickStart.startDate, "long"))}</p>
                          {quote.quickStart.capacityShifted ? <p className="text-sm font-medium text-warning">{S.capacity(formatDate(quote.quickStart.startDate, "long"))}</p> : null}
                        </>
                      ) : <p className="text-sm text-muted-foreground">{S.mondayNote}</p>}
                    </div>
                  )}
            </section>
          ) : null}
        </div>
      ) : null}

      {/* mousedown does not take focus: blurring a field would re-validate it and move these buttons under the finger */}
      <div className="flex gap-3" onMouseDown={(ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); }}>
        {step > 0 ? <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setStep((s) => s - 1)}>{S.back}</Button> : null}
        {step < 4
          ? <Button type="button" className="h-12 flex-1 text-base" onClick={next}>{S.next}</Button>
          : <Button type="submit" className="h-12 flex-1 text-base" disabled={submitting || quote === "loading"}>{submitting ? S.submitting : S.submit}</Button>}
      </div>
    </form>
  );
}
