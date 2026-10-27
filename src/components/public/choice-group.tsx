"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Big tappable radio buttons (≥ 44 px), a native radio group underneath for accessibility.
 * The chosen option is filled Deep Forest with a check, so it is clear at a glance.
 */
export function ChoiceGroup<T extends string>({ name, legend, value, onChange, options, columns = 2 }: {
  name: string; legend: string; value: T | undefined; onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[]; columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-3")}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label key={o.value} className={cn(
              "relative flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
              "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring",
              on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-input bg-card hover:border-primary/40 hover:bg-accent",
            )}>
              <input type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
              <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border",
                on ? "border-lime bg-lime text-forest" : "border-input bg-card")}>
                {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{o.label}</span>
                {o.hint ? <span className={cn("text-xs", on ? "text-primary-foreground/85" : "text-muted-foreground")}>{o.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
