"use client";

import { cn } from "@/lib/utils";

/** Big tappable radio buttons (≥ 44 px), a native radio group underneath for accessibility. */
export function ChoiceGroup<T extends string>({ name, legend, value, onChange, options, columns = 2 }: {
  name: string; legend: string; value: T | undefined; onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[]; columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-3")}>
        {options.map((o) => (
          <label key={o.value} className={cn("flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            value === o.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent")}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="font-semibold">{o.label}</span>
            {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
