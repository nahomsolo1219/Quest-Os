"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkInAction } from "@/app/app/community/actions";
import { S } from "@/app/app/community/strings";

/** The big "Yes, I did it today" button (once per Addis day; the server decides). */
export function ChallengeCheckIn({ challengeId, canCheckIn, checkedInToday, reason }: {
  challengeId: string; canCheckIn: boolean; checkedInToday: boolean; reason?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (checkedInToday) {
    return (
      <div role="status" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-success-soft text-lg font-bold text-success">
        <Check className="size-6" aria-hidden />{S.alreadyToday}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button className="h-16 w-full rounded-2xl text-lg font-bold" disabled={!canCheckIn || pending} onClick={() => start(async () => {
        const r = await checkInAction({ challengeId });
        if (!r.ok) { toast.error(r.error); return; }
        toast.success(r.message ?? S.checkedIn);
        router.refresh();
      })}>
        {S.yes}
      </Button>
      {!canCheckIn && reason ? <p className="text-center text-sm text-muted-foreground">{reason}</p> : null}
    </div>
  );
}
