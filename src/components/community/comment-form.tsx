"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addCommentAction } from "@/app/app/community/actions";
import { S } from "@/app/app/community/strings";

const schema = z.object({ body: z.string().trim().min(1, "Write a comment first.").max(1000, "Comments can be at most 1,000 characters.") });

export function CommentForm({ postId }: { postId: string }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { body: "" } });
  const len = form.watch("body").length;
  return (
    <form className="space-y-2" onSubmit={form.handleSubmit(async (v) => {
      const r = await addCommentAction({ postId, body: v.body });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.message ?? S.commentSent);
      form.reset();
      router.refresh();
    })}>
      <Label htmlFor="comment">{S.commentLabel}</Label>
      <Textarea id="comment" rows={3} maxLength={1000} placeholder={S.commentPlaceholder} {...form.register("body")} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{S.chars(len, 1000)}</span>
        <Button type="submit" className="h-11" disabled={form.formState.isSubmitting}>{S.commentSend}</Button>
      </div>
      {form.formState.errors.body ? <p className="text-sm text-danger">{form.formState.errors.body.message}</p> : null}
    </form>
  );
}
