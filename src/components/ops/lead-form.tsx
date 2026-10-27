"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { createLeadAction } from "@/app/staff/clients/actions";
import { S } from "@/app/staff/clients/strings";
import { SOURCE_LABEL } from "./labels";
import { useAction } from "./use-action";

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter the first name."),
  lastName: z.string().trim().min(1, "Enter the last name."),
  phone: z.string().refine((v) => normalizeEthiopianPhone(v) !== null, S.invalidPhone),
  source: z.enum(["instagram", "referral", "walk_in", "other"], "Choose where they heard about us."),
  notes: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function LeadForm() {
  const router = useRouter();
  const { run, pending } = useAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { firstName: "", lastName: "", phone: "", source: "instagram", notes: "" } });
  const err = form.formState.errors;
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((v) => run(() => createLeadAction(v), {
      refresh: false, onDone: (d) => router.push(`/staff/clients/${d.id}`),
    }))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">{S.firstName}</Label>
          <Input id="firstName" autoComplete="off" className="h-11" {...form.register("firstName")} />
          {err.firstName ? <p className="text-sm text-danger">{err.firstName.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">{S.lastName}</Label>
          <Input id="lastName" autoComplete="off" className="h-11" {...form.register("lastName")} />
          {err.lastName ? <p className="text-sm text-danger">{err.lastName.message}</p> : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">{S.phone}</Label>
        <Input id="phone" type="tel" inputMode="tel" placeholder={S.phoneHint} className="h-11" {...form.register("phone")} />
        {err.phone ? <p className="text-sm text-danger">{err.phone.message}</p> : null}
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{S.source}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["instagram", "referral", "walk_in", "other"] as const).map((src) => (
            <label key={src} htmlFor={`source-${src}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input id={`source-${src}`} type="radio" value={src} className="accent-primary" {...form.register("source")} />
              {SOURCE_LABEL[src]}
            </label>
          ))}
        </div>
        {err.source ? <p className="text-sm text-danger">{err.source.message}</p> : null}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="notes">{S.notes}</Label>
        <Textarea id="notes" rows={3} placeholder={S.notesHint} {...form.register("notes")} />
      </div>
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>{S.saveLead}</Button>
    </form>
  );
}
