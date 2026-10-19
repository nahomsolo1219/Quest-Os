"use client";

import { Button } from "@/components/ui/button";
import { markReadAction } from "@/app/staff/notifications/actions";
import { S } from "@/app/staff/notifications/strings";
import { useAction } from "./use-action";

export function MarkReadButton({ id }: { id: string }) {
  const { run, pending } = useAction();
  return <Button variant="ghost" className="h-11" disabled={pending} onClick={() => run(() => markReadAction({ ids: [id] }))}>{S.markRead}</Button>;
}

export function MarkAllReadButton() {
  const { run, pending } = useAction();
  return <Button variant="outline" className="h-11" disabled={pending} onClick={() => run(() => markReadAction({ ids: "all" }))}>{S.markAll}</Button>;
}
