"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAnswerAction, pinAction } from "@/app/app/community/actions";
import { S } from "@/app/app/community/strings";

export function PinButton({ postId, pinned, size = "sm" }: { postId: string; pinned: boolean; size?: "sm" | "default" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size={size} className="h-11 gap-1.5" disabled={pending} onClick={() => start(async () => {
      const r = await pinAction({ postId, pinned: !pinned });
      if (!r.ok) toast.error(r.error); else { toast.success(r.message ?? (pinned ? S.unpinned : S.pinned_)); router.refresh(); }
    })}>
      {pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}{pinned ? S.unpin : S.pin}
    </Button>
  );
}

export function AnswerButton({ postId, commentId, isAnswer }: { postId: string; commentId: string; isAnswer: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant={isAnswer ? "outline" : "secondary"} size="sm" className="h-11 gap-1.5" disabled={pending} onClick={() => start(async () => {
      const r = await markAnswerAction({ postId, commentId: isAnswer ? null : commentId });
      if (!r.ok) toast.error(r.error); else { toast.success(r.message ?? S.answerMarked); router.refresh(); }
    })}>
      <CheckCircle2 className="size-4" aria-hidden />{isAnswer ? S.unmarkAnswer : S.markAnswer}
    </Button>
  );
}
