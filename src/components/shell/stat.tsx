import { cn } from "@/lib/utils";

/** Large number tile used for macros, money and KPIs. */
export function Stat({ label, value, unit, tone, className }: {
  label: string; value: string | number; unit?: string; tone?: "default" | "good" | "warn" | "bad"; className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-3", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("stat-number mt-1 text-2xl",
        tone === "good" && "text-success", tone === "warn" && "text-warning", tone === "bad" && "text-danger")}>
        {value}
        {unit ? <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

/** kcal / P / C / F row. */
export function MacroRow({ kcal, proteinG, carbG, fatG, compact }: { kcal: number; proteinG: number; carbG: number; fatG: number; compact?: boolean }) {
  const items = [
    { label: "kcal", value: Math.round(kcal) },
    { label: "Protein", value: `${Math.round(proteinG)} g` },
    { label: "Carbs", value: `${Math.round(carbG)} g` },
    { label: "Fat", value: `${Math.round(fatG)} g` },
  ];
  return (
    <div className={cn("grid grid-cols-4 gap-2", compact && "gap-1")}>
      {items.map((i) => (
        <div key={i.label} className="rounded-lg bg-muted px-2 py-1.5 text-center">
          <p className={cn("stat-number", compact ? "text-base" : "text-xl")}>{i.value}</p>
          <p className="text-[11px] text-muted-foreground">{i.label}</p>
        </div>
      ))}
    </div>
  );
}
