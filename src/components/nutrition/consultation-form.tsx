"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/owner/use-action";
import { recordConsultationAction } from "@/app/staff/nutrition/actions";

const schema = z.object({ heldAt: z.string().min(1, "Enter when it was held."), mode: z.enum(["in_person", "phone"]), notes: z.string().max(2000).optional() });
type Values = z.infer<typeof schema>;

/** heldAt default is an Addis wall time "YYYY-MM-DDTHH:mm" from the server. */
export function ConsultationForm({ clientId, nowLocal }: { clientId: string; nowLocal: string }) {
  const { pending, run } = useAction();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { heldAt: nowLocal, mode: "in_person", notes: "" } });
  const { register, handleSubmit, formState: { errors } } = form;
  return (
    <form className="space-y-3" onSubmit={handleSubmit((v) => run(() => recordConsultationAction({ clientId, ...v }), () => form.reset({ ...v, notes: "" })))}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cf-at">When (Addis time)</Label>
          <Input id="cf-at" type="datetime-local" className="h-11" {...register("heldAt")} />
          {errors.heldAt ? <p className="text-sm text-danger">{errors.heldAt.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-mode">How</Label>
          <select id="cf-mode" className="h-11 w-full rounded-md border bg-background px-3" {...register("mode")}>
            <option value="in_person">In person</option><option value="phone">Phone</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-notes">Notes</Label>
        <Textarea id="cf-notes" rows={3} {...register("notes")} />
      </div>
      <Button type="submit" className="h-11" disabled={pending}>Log consultation</Button>
    </form>
  );
}
