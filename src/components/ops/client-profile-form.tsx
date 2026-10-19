"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClientAction } from "@/app/staff/clients/actions";
import { S } from "@/app/staff/clients/strings";
import { ACTIVITY_LABEL, GOAL_LABEL, SEX_LABEL, WEEKDAY_LABEL } from "./labels";
import { useAction } from "./use-action";

const optNum = (min: number, max: number, msg: string) =>
  z.string().trim().refine((v) => v === "" || (Number(v) >= min && Number(v) <= max), msg);

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter the first name."),
  lastName: z.string().trim().min(1, "Enter the last name."),
  address: z.string(),
  areaId: z.string(),
  landmark: z.string(),
  allergies: z.string(),
  dislikes: z.string(),
  sex: z.string(),
  age: optNum(12, 100, "Age must be 12 to 100 years."),
  weightKg: optNum(30, 300, "Weight must be 30 to 300 kg."),
  heightCm: optNum(120, 230, "Height must be 120 to 230 cm."),
  activity: z.string(),
  goal: z.string(),
  checkInWeekday: z.string(),
});
type Values = z.infer<typeof schema>;

export type ProfileDefaults = {
  firstName: string; lastName: string; address: string | null; areaId: string | null; landmark: string | null;
  allergies: string[]; dislikes: string[]; sex: string | null; age: number | null; weightG: number | null; heightCm: number | null;
  activity: string | null; goal: string | null; checkInWeekday: number | null;
};

const splitList = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const orNull = <T extends string>(v: string) => (v === "" ? null : (v as T));

/** Values sent to updateClient (also used by the onboarding intake step). */
export function toUpdateFields(v: Values) {
  return {
    firstName: v.firstName, lastName: v.lastName, address: v.address || null, areaId: v.areaId || null, landmark: v.landmark || null,
    allergies: splitList(v.allergies), dislikes: splitList(v.dislikes),
    sex: orNull<"male" | "female">(v.sex), age: v.age ? Math.round(Number(v.age)) : null,
    weightG: v.weightKg ? Math.round(Number(v.weightKg) * 1000) : null, heightCm: v.heightCm ? Math.round(Number(v.heightCm)) : null,
    activity: orNull<"sedentary" | "light" | "moderate" | "very_active" | "athlete">(v.activity), goal: orNull<"lean" | "build">(v.goal),
    checkInWeekday: v.checkInWeekday ? Number(v.checkInWeekday) : null,
  };
}

function Select({ id, label, options, placeholder, reg }: { id: string; label: string; options: [string, string][]; placeholder: string; reg: ReturnType<ReturnType<typeof useForm<Values>>["register"]> }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className="h-11 w-full rounded-md border bg-background px-3 text-sm" {...reg}>
        <option value="">{placeholder}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

/**
 * Client profile: contact, address, allergies, body stats. `mode="intake"` shows the onboarding subset with
 * required body stats and calls onSaved after a successful save.
 */
export function ClientProfileForm({ clientId, defaults, areas, mode = "full", submitLabel, onSaved }: {
  clientId: string; defaults: ProfileDefaults; areas: { id: string; name: string }[]; mode?: "full" | "intake"; submitLabel?: string; onSaved?: () => void;
}) {
  const { run, pending } = useAction();
  const intake = mode === "intake";
  const form = useForm<Values>({
    resolver: zodResolver(intake ? schema.refine((v) => v.sex && v.age && v.weightKg && v.heightCm && v.activity && v.goal, { message: "Fill in sex, age, weight, height, activity and goal.", path: ["goal"] }) : schema),
    defaultValues: {
      firstName: defaults.firstName, lastName: defaults.lastName, address: defaults.address ?? "", areaId: defaults.areaId ?? "", landmark: defaults.landmark ?? "",
      allergies: defaults.allergies.join(", "), dislikes: defaults.dislikes.join(", "), sex: defaults.sex ?? "", age: defaults.age?.toString() ?? "",
      weightKg: defaults.weightG ? String(defaults.weightG / 1000) : "", heightCm: defaults.heightCm?.toString() ?? "",
      activity: defaults.activity ?? "", goal: defaults.goal ?? "", checkInWeekday: defaults.checkInWeekday?.toString() ?? "",
    },
  });
  const err = form.formState.errors;
  const field = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pf-${name}`}>{label}</Label>
      <Input id={`pf-${name}`} className="h-11" {...props} {...form.register(name)} />
      {err[name] ? <p className="text-sm text-red-700">{err[name]?.message}</p> : null}
    </div>
  );
  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((v) => run(() => updateClientAction({ clientId, fields: toUpdateFields(v) }), { onDone: () => onSaved?.() }))}>
      {intake ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          {field("firstName", S.firstName)}
          {field("lastName", S.lastName)}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Select id="pf-sex" label={S.sex} placeholder={S.notSet} options={Object.entries(SEX_LABEL)} reg={form.register("sex")} />
        {field("age", S.age, { type: "number", inputMode: "numeric" })}
        {field("weightKg", S.weight, { type: "number", inputMode: "decimal", step: "0.1" })}
        {field("heightCm", S.height, { type: "number", inputMode: "numeric" })}
        <Select id="pf-activity" label={S.activity} placeholder={S.notSet} options={Object.entries(ACTIVITY_LABEL)} reg={form.register("activity")} />
        <div>
          <Select id="pf-goal" label={S.goal} placeholder={S.notSet} options={Object.entries(GOAL_LABEL)} reg={form.register("goal")} />
          {err.goal ? <p className="mt-1 text-sm text-red-700">{err.goal.message}</p> : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("allergies", S.allergies, { placeholder: S.listHint })}
        {field("dislikes", S.dislikes, { placeholder: S.listHint })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("address", S.address)}
        <Select id="pf-area" label={S.area} placeholder={S.chooseArea} options={areas.map((a) => [a.id, a.name])} reg={form.register("areaId")} />
        {field("landmark", S.landmark)}
        {intake ? null : <Select id="pf-checkin" label={S.checkInDay} placeholder={S.notSet} options={Object.entries(WEEKDAY_LABEL)} reg={form.register("checkInWeekday")} />}
      </div>
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>{submitLabel ?? S.saveProfile}</Button>
    </form>
  );
}
