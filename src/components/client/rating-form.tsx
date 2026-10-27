"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { rateMealAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { useAction } from "./use-action";

/** 1–5 rating buttons with an optional comment, per meal and service date (COM-08). */
export function RatingForm({ mealId, serviceDate, initial }: { mealId: string; serviceDate: string; initial?: { rating: number; comment: string | null } }) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  const id = `c-${mealId}-${serviceDate}`;
  const save = (r: number, c: string) => run(() => rateMealAction({ mealId, serviceDate, rating: r, comment: c || undefined }));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{initial ? T.today.rated(initial.rating) : T.today.rate}</p>
      <div className="flex gap-1" role="group" aria-label={T.today.rate}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" disabled={pending} aria-label={`${n} of 5`} aria-pressed={rating === n}
            onClick={() => { setRating(n); setOpen(true); save(n, comment); }}
            className={cn("flex size-11 items-center justify-center rounded-lg border", rating >= n ? "border-primary bg-primary text-lime" : "bg-card text-muted-foreground hover:bg-accent")}>
            <Star className={cn("size-5", rating >= n && "fill-current")} />
          </button>
        ))}
      </div>
      {open || initial?.comment ? (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{T.today.commentLabel}</Label>
          <Textarea id={id} rows={2} maxLength={500} placeholder={T.today.commentHint} value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button type="button" variant="outline" className="h-11" disabled={pending || rating === 0} onClick={() => save(rating, comment)}>{T.today.save}</Button>
        </div>
      ) : null}
    </div>
  );
}
