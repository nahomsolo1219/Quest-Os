"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updatePackageAction } from "@/app/staff/settings/actions";
import { useAction } from "./use-action";

const OPTIONS = ["daily", "three_drops", "every_3_days", "weekly", "pickup"] as const;
const schema = z.object({
  name: z.string().trim().min(1, "Give the package a name."),
  swapLimit: z.number({ error: "Enter a number." }).int("Whole numbers only.").min(0).max(30, "At most 30."),
  checkinIntervalDays: z.number({ error: "Enter a number." }).int().min(1, "1 to 90 days.").max(90, "1 to 90 days."),
  coaching: z.string().max(300),
  deliveryOptions: z.array(z.enum(OPTIONS)).min(1, "Pick at least one delivery option."),
  serviceFeeMonthBirr: z.number({ error: "Enter a number." }).int("Whole birr.").min(0, "Cannot be negative."),
  prioritySlot: z.boolean(), active: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function PackageForm({ id, values, labels, enabled }: { id: string; values: Values; labels: Record<string, string>; enabled: string[] }) {
  const { pending, run } = useAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: values });
  const { register, handleSubmit, formState: { errors, isDirty } } = form;
  const p = (k: string) => `pk-${id}-${k}`;
  const err = (m?: string) => (m ? <p className="text-sm text-danger">{m}</p> : null);
  const num = { valueAsNumber: true } as const;
  return (
    <form className="space-y-3" onSubmit={handleSubmit((v) => run(() => updatePackageAction({ id, ...v }), () => form.reset(v)))}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5"><Label htmlFor={p("name")}>Name</Label><Input id={p("name")} className="h-11" {...register("name")} />{err(errors.name?.message)}</div>
        <div className="space-y-1.5"><Label htmlFor={p("swap")}>Swap limit</Label><Input id={p("swap")} type="number" className="h-11" {...register("swapLimit", num)} />{err(errors.swapLimit?.message)}</div>
        <div className="space-y-1.5"><Label htmlFor={p("ci")}>Check-in every (days)</Label><Input id={p("ci")} type="number" className="h-11" {...register("checkinIntervalDays", num)} />{err(errors.checkinIntervalDays?.message)}</div>
        <div className="col-span-2 space-y-1.5"><Label htmlFor={p("fee")}>Service fee per month (ETB)</Label><Input id={p("fee")} type="number" className="h-11" {...register("serviceFeeMonthBirr", num)} />{err(errors.serviceFeeMonthBirr?.message)}</div>
        <div className="col-span-2 space-y-1.5"><Label htmlFor={p("coach")}>Coaching</Label><Textarea id={p("coach")} rows={2} {...register("coaching")} /></div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Delivery options</legend>
        <div className="flex flex-wrap gap-x-4">
          {OPTIONS.map((o) => (
            <label key={o} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" value={o} className="size-5 accent-primary" disabled={!enabled.includes(o) && !values.deliveryOptions.includes(o)} {...register("deliveryOptions")} />{labels[o]}
            </label>
          ))}
        </div>
        {err(errors.deliveryOptions?.message)}
      </fieldset>
      <div className="flex flex-wrap gap-x-6">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-primary" {...register("prioritySlot")} />Priority delivery slot</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-primary" {...register("active")} />Offered to new clients</label>
      </div>
      <Button type="submit" className="h-11" disabled={pending || !isDirty}>Save package</Button>
    </form>
  );
}
