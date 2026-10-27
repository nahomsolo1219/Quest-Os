import type { ReactNode } from "react";
import { MacroRow } from "@/components/shell/stat";
import { formatDate } from "@/domain/time";
import { SLOT_LABELS, T } from "@/app/app/strings";
import type { Slot } from "@/domain/types";

export type MealCardData = {
  mealId: string; mealName: string; slot: Slot; kcal: number; proteinG: number; carbG: number; fatG: number;
  eatBy: string | null; items: string[]; conflicts: string[];
};

/** One meal: slot, name, big macros, eat-by date, items; optional footer (rating). */
export function MealCard({ meal, compact, children }: { meal: MealCardData; compact?: boolean; children?: ReactNode }) {
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{SLOT_LABELS[meal.slot]}</p>
          <h3 className={compact ? "font-semibold" : "text-lg font-bold leading-tight"}>{meal.mealName}</h3>
        </div>
        {meal.eatBy ? <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold">{T.today.eatBy(formatDate(meal.eatBy))}</span> : null}
      </div>
      <MacroRow kcal={meal.kcal} proteinG={meal.proteinG} carbG={meal.carbG} fatG={meal.fatG} compact={compact} />
      {meal.items.length && !compact ? <p className="text-sm text-muted-foreground">{meal.items.join(" · ")}</p> : null}
      {meal.conflicts.length ? <p className="text-sm font-medium text-danger">{T.today.conflict} {meal.conflicts.join("; ")}</p> : null}
      {children}
    </article>
  );
}
