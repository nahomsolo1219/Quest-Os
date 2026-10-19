"use client";

import { Button } from "@/components/ui/button";
import { markReadAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { useAction } from "./use-action";

export function MarkReadButton({ ids }: { ids: string[] | "all" }) {
  const { pending, run } = useAction();
  return (
    <Button type="button" variant={ids === "all" ? "outline" : "ghost"} className="h-11" disabled={pending}
      onClick={() => run(() => markReadAction({ ids }))}>{ids === "all" ? T.notifications.markAll : T.notifications.markOne}</Button>
  );
}
