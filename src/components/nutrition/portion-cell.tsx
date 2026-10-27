"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAction } from "@/components/owner/use-action";
import { setPortionCellAction } from "@/app/staff/nutrition/actions";

type Profile = "S_LEAN" | "S_BUILD" | "M_LEAN" | "M_BUILD" | "L_LEAN" | "L_BUILD";

/** One profile-table cell: tap to edit (becomes manual), or clear the manual value back to the computed one. */
export function PortionCell({ partId, profile, qty, computedQty, isManual, unit, canEdit, label }: {
  partId: string; profile: Profile; qty: number | null; computedQty: number | null; isManual: boolean; unit: "g" | "piece"; canEdit: boolean; label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(qty ?? ""));
  const { pending, run } = useAction();
  const shown = qty === null ? "–" : unit === "piece" ? `${qty} pc` : `${qty}`;
  const cls = cn("min-h-11 w-full rounded-md px-2 text-right tabular-nums", isManual && "bg-warning-soft font-semibold text-warning ring-1 ring-warning/30");
  if (!canEdit || qty === null) return <div className={cn(cls, "flex items-center justify-end")} title={isManual ? `Manual (computed ${computedQty})` : undefined}>{shown}</div>;
  if (!editing) {
    return (
      <button type="button" className={cn(cls, "hover:bg-muted")} aria-label={`${label}: ${shown}${isManual ? ", manual" : ""}. Tap to edit`}
        title={isManual ? `Manual (computed ${computedQty})` : "Tap to edit"} onClick={() => { setValue(String(qty)); setEditing(true); }}>
        {shown}
      </button>
    );
  }
  const id = `cell-${partId}-${profile}`;
  return (
    <form className="flex min-w-36 flex-col gap-1" onSubmit={(e) => {
      e.preventDefault();
      const n = Number(value);
      run(() => setPortionCellAction({ partId, profile, qty: Number.isFinite(n) ? n : -1 }), () => setEditing(false));
    }}>
      <label htmlFor={id} className="sr-only">{label} ({unit === "piece" ? "pieces" : "grams"})</label>
      <input id={id} type="number" inputMode="numeric" min={0} max={2000} autoFocus value={value} onChange={(e) => setValue(e.target.value)}
        className="h-11 w-full rounded-md border bg-card px-2 text-right tabular-nums" />
      <div className="flex gap-1">
        <Button type="submit" size="sm" className="h-11 flex-1" disabled={pending}>Save</Button>
        <Button type="button" size="sm" variant="ghost" className="h-11" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      {isManual ? (
        <Button type="button" size="sm" variant="outline" className="h-11" disabled={pending}
          onClick={() => run(() => setPortionCellAction({ partId, profile, qty: null }), () => setEditing(false))}>Clear manual ({computedQty})</Button>
      ) : null}
    </form>
  );
}
