"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logWeightAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { useAction } from "./use-action";

export function WeightForm({ today }: { today: string }) {
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(today);
  const { pending, run } = useAction();
  return (
    <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => logWeightAction({ weightKg: Number(kg.replace(",", ".")), date }), () => setKg("")); }}>
      <div className="space-y-1.5">
        <Label htmlFor="weightKg">{T.progress.weight}</Label>
        <Input id="weightKg" inputMode="decimal" className="h-11" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="72.5" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="weightDate">{T.progress.date}</Label>
        <Input id="weightDate" type="date" max={today} className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Button type="submit" className="col-span-2 h-11" disabled={pending || !kg}>{T.progress.save}</Button>
    </form>
  );
}
