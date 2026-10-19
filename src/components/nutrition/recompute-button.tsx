"use client";

import { Button } from "@/components/ui/button";
import { useAction } from "@/components/owner/use-action";
import { recomputeAction } from "@/app/staff/nutrition/actions";

export function RecomputeButton() {
  const { pending, run } = useAction();
  return <Button type="button" className="h-11" disabled={pending} onClick={() => run(() => recomputeAction())}>{pending ? "Recomputing…" : "Recompute"}</Button>;
}
