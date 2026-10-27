"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addDays, formatDate } from "@/domain/time";
import { pauseAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

export function PauseForm({ weeks, endDate }: { weeks: string[]; endDate: string }) {
  const [startWeek, setStartWeek] = useState(weeks[0]);
  const [n, setN] = useState(1);
  const { pending, run } = useAction();
  const newEnd = addDays(endDate, 7 * n);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => pauseAction({ startWeek, weeks: n }), undefined, T.pause.done(formatDate(newEnd, "long"))); }}>
      <div className="space-y-1.5">
        <Label htmlFor="startWeek">{T.pause.startWeek}</Label>
        <NativeSelect id="startWeek" value={startWeek} onChange={(e) => setStartWeek(e.target.value)}>
          {weeks.map((w) => <option key={w} value={w}>Week of {formatDate(w, "long")}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="weeks">{T.pause.weeks}</Label>
        <NativeSelect id="weeks" value={n} onChange={(e) => setN(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => <option key={k} value={k}>{k} week{k > 1 ? "s" : ""}</option>)}
        </NativeSelect>
      </div>
      <div className="rounded-xl bg-accent p-3">
        <p className="text-sm text-muted-foreground">{T.pause.currentEnd(formatDate(endDate, "long"))}</p>
        <p className="text-lg font-semibold">{T.pause.newEnd(formatDate(newEnd, "long"))}</p>
      </div>
      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>{T.pause.confirm}</Button>
    </form>
  );
}
