"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markHandedOverAction } from "@/app/delivery/actions";
import { StatusChip } from "./status-chip";
import { toastWithUndo } from "./undo-toast";
import type { DropCardData } from "./types";

/** Cafe counter line: name, meals count, one tap "Handed over". */
export function PickupRow({ drop, first = false }: { drop: DropCardData; first?: boolean }) {
  const [pending, start] = useTransition();
  const done = drop.status === "delivered";
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">{drop.name} <StatusChip status={drop.status} pickup /></p>
        <p className="text-sm text-muted-foreground">{drop.mealsCount} meals</p>
      </div>
      <Button type="button" data-tour={first ? "pickup-hand-over" : undefined} className="h-12 min-w-36 text-base" disabled={pending || done} onClick={() => start(async () => {
        const r = await markHandedOverAction({ dropId: drop.id });
        if (r.ok) toastWithUndo(`${drop.name}: handed over`, drop.id, "delivered"); else toast.error(r.error);
      })}>{done ? "Handed over" : "Hand over"}</Button>
    </li>
  );
}
