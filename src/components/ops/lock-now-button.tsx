"use client";

import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/shell/confirm-button";
import { lockNowAction } from "@/app/staff/orders/actions";
import { S } from "@/app/staff/orders/strings";
import { useAction } from "./use-action";

export function LockNowButton({ weekStart }: { weekStart: string }) {
  const { run, pending } = useAction();
  return (
    <ConfirmButton
      trigger={<Button className="h-11" disabled={pending}>{S.lockNow}</Button>}
      title={S.lockNow}
      description={S.lockConfirm}
      confirmLabel={S.lockNow}
      onConfirm={() => run(() => lockNowAction({ weekStart }))}
    />
  );
}
