"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { announcementAction, createChallengeAction } from "@/app/staff/community/actions";
import { T } from "@/app/staff/community/strings";

const challengeSchema = z.object({
  title: z.string().trim().min(1, "Give the challenge a title.").max(120),
  question: z.string().trim().min(1, "Write the daily check-in question.").max(200),
  startsOn: z.string().min(1, "Pick a start date."),
  endsOn: z.string().min(1, "Pick an end date."),
}).refine((v) => v.endsOn >= v.startsOn, { message: "The end date must be on or after the start date.", path: ["endsOn"] });

const err = (m?: string) => (m ? <p className="text-sm text-danger">{m}</p> : null);

export function ChallengeForm({ today, weekEnd }: { today: string; weekEnd: string }) {
  const form = useForm<z.infer<typeof challengeSchema>>({ resolver: zodResolver(challengeSchema), defaultValues: { title: "", question: "", startsOn: today, endsOn: weekEnd } });
  const e = form.formState.errors;
  return (
    <form className="space-y-3" onSubmit={form.handleSubmit(async (v) => {
      const r = await createChallengeAction(v);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.message ?? T.challengeCreated);
      form.reset({ title: "", question: "", startsOn: today, endsOn: weekEnd });
    })}>
      <div className="space-y-1.5">
        <Label htmlFor="ch-title">{T.challengeName}</Label>
        <Input id="ch-title" className="h-11" placeholder="8,000 steps" {...form.register("title")} />
        {err(e.title?.message)}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ch-q">{T.challengeQuestion}</Label>
        <Input id="ch-q" className="h-11" placeholder={T.challengeQuestionPh} {...form.register("question")} />
        {err(e.question?.message)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ch-start">{T.startsOn}</Label>
          <Input id="ch-start" type="date" className="h-11" min={today} {...form.register("startsOn")} />
          {err(e.startsOn?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ch-end">{T.endsOn}</Label>
          <Input id="ch-end" type="date" className="h-11" min={today} {...form.register("endsOn")} />
          {err(e.endsOn?.message)}
        </div>
      </div>
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={form.formState.isSubmitting}>{T.createChallenge}</Button>
    </form>
  );
}

const announceSchema = z.object({ body: z.string().trim().min(1, "Write the announcement.").max(2000, "Posts can be at most 2,000 characters.") });

export function AnnouncementForm() {
  const form = useForm<z.infer<typeof announceSchema>>({ resolver: zodResolver(announceSchema), defaultValues: { body: "" } });
  return (
    <form className="space-y-3" onSubmit={form.handleSubmit(async (v) => {
      const r = await announcementAction(v);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.message ?? T.announced);
      form.reset();
    })}>
      <div className="space-y-1.5">
        <Label htmlFor="announce">{T.announceBody}</Label>
        <Textarea id="announce" rows={4} maxLength={2000} placeholder={T.announcePh} {...form.register("body")} />
        {err(form.formState.errors.body?.message)}
        <p className="text-xs text-muted-foreground">{T.announcePhotos}</p>
      </div>
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={form.formState.isSubmitting}>{T.announce}</Button>
    </form>
  );
}
