"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStockCountAction } from "@/app/kitchen/actions";
import type { PurchaseUnit } from "@/domain/types";
import { cn } from "@/lib/utils";
import { units } from "./format";

export type StockLineData = {
  ingredientId: string;
  name: string;
  unit: PurchaseUnit;
  expectedUnits: number;
  countedUnits: number | null;
};

/** One stock line: expected on hand, a number input with Save, or one tap "Matches". */
export function StockLine({ line, date }: { line: StockLineData; date: string }) {
  const [value, setValue] = useState(line.countedUnits == null ? "" : String(line.countedUnits));
  const [pending, start] = useTransition();
  const id = `count-${line.ingredientId}`;
  const counted = line.countedUnits != null;

  const save = (matchesExpected: boolean) => start(async () => {
    const qty = value.trim() === "" ? undefined : Number(value);
    if (!matchesExpected && (qty == null || Number.isNaN(qty))) { toast.error("Enter the amount counted, or tap Matches."); return; }
    const r = await saveStockCountAction({ ingredientId: line.ingredientId, countDate: date, qty: matchesExpected ? undefined : qty, matchesExpected });
    if (r.ok) {
      if (matchesExpected) setValue(String(r.data.qtyUnits));
      toast.success(`${line.name}: ${units(r.data.qtyUnits, r.data.unit)} saved`);
    } else toast.error(r.error);
  });

  return (
    <li className={cn("flex flex-wrap items-end gap-2 border-b px-1 py-3", counted && "bg-success-soft/60")}>
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        <Label htmlFor={id} className="text-base font-semibold">
          {counted ? <Check aria-label="Counted" className="size-4 text-success" /> : null}{line.name}
        </Label>
        <p className="text-sm text-muted-foreground">Expected {units(line.expectedUnits, line.unit)}</p>
      </div>
      <div className="flex flex-1 items-center gap-1 sm:flex-none">
        <Input id={id} type="number" inputMode="decimal" min={0} step={line.unit === "piece" ? 1 : 0.1} value={value}
          onChange={(e) => setValue(e.target.value)} className="h-11 w-24 text-right text-base" aria-describedby={`${id}-unit`} />
        <span id={`${id}-unit`} className="w-6 text-sm text-muted-foreground">{line.unit === "piece" ? "pc" : line.unit === "kg" ? "kg" : "L"}</span>
      </div>
      <Button type="button" className="h-11" disabled={pending} onClick={() => save(false)}>Save</Button>
      <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => save(true)}>Matches</Button>
    </li>
  );
}
