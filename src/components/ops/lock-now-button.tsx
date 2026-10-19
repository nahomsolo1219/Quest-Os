"use client";

import { Button } from "@/components/ui/button";
import { lockNowAction } from "@/app/staff/orders/actions";
import { S } from "@/app/staff/orders/strings";
import { useAction } from "./use-action";

export function LockNowButton({ weekStart }: { weekStart: string }) {
  const { run, pending } = useAction();
  return (
    <Button className="h-11" disabled={pending} onClick={() => { if (window.confirm(S.lockConfirm)) run(() => lockNowAction({ weekStart })); }}>
      {S.lockNow}
    </Button>
  );
}
