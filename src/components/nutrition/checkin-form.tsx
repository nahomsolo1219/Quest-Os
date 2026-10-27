"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/owner/use-action";
import { logCheckinAction } from "@/app/staff/nutrition/actions";

const optNum = z.preprocess((v) => (v === "" || v == null || Number.isNaN(v) ? null : Number(v)), z.number().nullable());
const schema = z.object({
  clientId: z.string().min(1, "Pick a client."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date."),
  weightKg: optNum.refine((v) => v === null || (v >= 25 && v <= 300), "Weight must be 25 to 300 kg."),
  adherencePct: optNum.refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100), "Adherence is a whole number from 0 to 100."),
  notes: z.string().max(2000).optional(),
}).refine((v) => v.weightKg !== null || v.adherencePct !== null || !!v.notes?.trim(), { message: "Enter a weight, adherence or a note.", path: ["notes"] });
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

/** Nutritionist check-in. With `clients`, shows a client picker (check-ins screen); otherwise fixed to clientId. */
export function CheckinForm({ clientId, today, clients }: { clientId?: string; today: string; clients?: { id: string; name: string }[] }) {
  const { pending, run } = useAction();
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(schema), defaultValues: { clientId: clientId ?? "", date: today, weightKg: "", adherencePct: "", notes: "" } });
  const { register, handleSubmit, formState: { errors } } = form;
  const err = (m?: string) => (m ? <p className="text-sm text-danger">{m}</p> : null);
  return (
    <form className="space-y-3" onSubmit={handleSubmit((v) => run(() => logCheckinAction({ ...v, weightKg: v.weightKg as number | null, adherencePct: v.adherencePct as number | null }),
      () => form.reset({ clientId: clientId ?? "", date: today, weightKg: "", adherencePct: "", notes: "" })))}>
      {clients ? (
        <div className="space-y-1.5">
          <Label htmlFor="ck-client">Client</Label>
          <select id="ck-client" className="h-11 w-full rounded-md border bg-card px-3" {...register("clientId")}>
            <option value="">Pick a client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {err(errors.clientId?.message)}
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-3 [&>*]:min-w-0">
        <div className="space-y-1.5">
          <Label htmlFor="ck-date">Date</Label>
          <Input id="ck-date" type="date" max={today} className="h-11" {...register("date")} />
          {err(errors.date?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ck-weight">Weight (kg)</Label>
          <Input id="ck-weight" type="number" step="0.1" inputMode="decimal" className="h-11" {...register("weightKg")} />
          {err(errors.weightKg?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ck-adh">Adherence %</Label>
          <Input id="ck-adh" type="number" inputMode="numeric" className="h-11" {...register("adherencePct")} />
          {err(errors.adherencePct?.message)}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ck-notes">Notes</Label>
        <Textarea id="ck-notes" rows={2} {...register("notes")} />
        {err(errors.notes?.message)}
      </div>
      <Button type="submit" className="h-11" disabled={pending}>Log check-in</Button>
    </form>
  );
}
