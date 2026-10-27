"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/shell/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addContributionAction, deleteContributionAction } from "@/app/staff/partners/actions";
import { useAction } from "./use-action";

const optNum = z.preprocess((v) => (v === "" || v == null || Number.isNaN(v) ? null : Number(v)), z.number().positive("Must be above 0.").nullable());
const schema = z.object({
  partnerUserId: z.string().min(1, "Pick a partner."),
  contributedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date."),
  type: z.enum(["cash", "time", "equipment", "other"]),
  amountBirr: optNum.refine((v) => v === null || Number.isInteger(v), "Whole birr only."),
  hours: optNum,
  note: z.string().max(500).optional(),
}).refine((v) => v.type !== "cash" || v.amountBirr !== null, { message: "Enter the cash amount in birr.", path: ["amountBirr"] })
  .refine((v) => v.type !== "time" || v.hours !== null, { message: "Enter the hours given.", path: ["hours"] })
  .refine((v) => (v.type !== "equipment" && v.type !== "other") || !!v.note?.trim(), { message: "Describe what was contributed.", path: ["note"] });
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

export function ContributionForm({ partners, today }: { partners: { id: string; name: string }[]; today: string }) {
  const { pending, run } = useAction();
  const empty: In = { partnerUserId: "", contributedOn: today, type: "cash", amountBirr: "", hours: "", note: "" };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(schema), defaultValues: empty });
  const { register, handleSubmit, watch, formState: { errors } } = form;
  const type = watch("type");
  const err = (m?: string) => (m ? <p className="text-sm text-danger">{m}</p> : null);
  return (
    <form className="space-y-3" onSubmit={handleSubmit((v) => run(() => addContributionAction({ ...v, amountBirr: v.amountBirr as number | null, hours: v.hours as number | null }),
      () => form.reset({ ...empty, partnerUserId: v.partnerUserId })))}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pc-partner">Partner</Label>
          <select id="pc-partner" className="h-11 w-full rounded-md border bg-background px-3" {...register("partnerUserId")}>
            <option value="">Pick a partner</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {err(errors.partnerUserId?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pc-date">Date</Label>
          <Input id="pc-date" type="date" max={today} className="h-11" {...register("contributedOn")} />
          {err(errors.contributedOn?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pc-type">Type</Label>
          <select id="pc-type" className="h-11 w-full rounded-md border bg-background px-3" {...register("type")}>
            <option value="cash">Cash</option><option value="time">Time</option><option value="equipment">Equipment</option><option value="other">Other</option>
          </select>
        </div>
        {type === "time" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pc-hours">Hours</Label>
            <Input id="pc-hours" type="number" step="0.5" inputMode="decimal" className="h-11" {...register("hours")} />
            {err(errors.hours?.message)}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="pc-amount">Amount (ETB){type === "cash" ? "" : ", optional value"}</Label>
            <Input id="pc-amount" type="number" inputMode="numeric" className="h-11" {...register("amountBirr")} />
            {err(errors.amountBirr?.message)}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pc-note">Note</Label>
        <Textarea id="pc-note" rows={2} {...register("note")} />
        {err(errors.note?.message)}
      </div>
      <Button type="submit" className="h-11" disabled={pending}>Log contribution</Button>
    </form>
  );
}

export function DeleteContribution({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <ConfirmButton
      trigger={<Button type="button" variant="ghost" size="sm" className="h-11 text-danger" disabled={pending}>Remove</Button>}
      title="Remove this entry from the log?"
      description="The contribution disappears from the partner totals. This cannot be undone."
      confirmLabel="Remove"
      destructive
      onConfirm={() => run(() => deleteContributionAction({ id }))}
    />
  );
}
