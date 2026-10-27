import { Bike, Store, Truck } from "lucide-react";
import { StatusBadge } from "@/components/shell/status-badge";
import { addisTime, formatDate } from "@/domain/time";
import type { DateStr } from "@/domain/types";
import { T } from "@/app/app/strings";
import { CalorieRing } from "./calorie-ring";

export type HeroDrop = { status: "pending" | "delivered" | "failed"; kind: string; slot: string | null; failedReason: string | null; deliveredAt: Date | null };

/** "12:00" → "12 pm", "09:30" → "9:30 am" (a clock label from settings, not a time-zone computation). */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}\u00a0${h < 12 ? "am" : "pm"}`;
}

function DropLine({ d, deliverBy }: { d: HeroDrop; deliverBy: string }) {
  const pickup = d.kind === "pickup";
  const Icon = pickup ? Store : d.status === "delivered" ? Truck : Bike;
  const slot = d.slot ? T.today.dropSlot[d.slot] ?? null : null;
  const words = pickup ? T.today.pickup : T.today.drop;
  const title = d.status === "pending"
    ? (pickup ? T.today.pickupAt : T.today.arriving(clockLabel(deliverBy)))
    : d.status === "delivered" && d.deliveredAt ? T.today.doneAt(words.delivered, clockLabel(addisTime(d.deliveredAt))) : words[d.status];
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-lime"><Icon aria-hidden className="size-5" /></span>
      <div className="min-w-0 flex-1">
        {slot ? <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{slot}</p> : null}
        <p className="font-semibold leading-snug">{title}</p>
        {d.status === "failed" && d.failedReason ? <p className="text-sm text-danger">{d.failedReason}</p> : null}
      </div>
      <StatusBadge status={d.status} className="mt-0.5">{T.today.dropBadge(pickup)[d.status]}</StatusBadge>
    </li>
  );
}

/** Today hero: how the meals reach the client today, and a calorie ring of today's total against the target. */
export function TodayHero({ drops, deliverBy, mealsDropDate, today, total, kcalTarget }: {
  drops: HeroDrop[]; deliverBy: string; mealsDropDate: DateStr | null; today: DateStr;
  total: { kcal: number; p: number; c: number; f: number } | null; kcalTarget: number | null;
}) {
  return (
    <section aria-label={T.today.heroLabel} className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      {drops.length ? (
        <ul className="space-y-3">{drops.map((d, i) => <DropLine key={i} d={d} deliverBy={deliverBy} />)}</ul>
      ) : mealsDropDate && mealsDropDate !== today ? (
        <p className="flex items-center gap-3 font-semibold">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-lime"><Truck aria-hidden className="size-5" /></span>
          {T.today.cameWith(formatDate(mealsDropDate))}
        </p>
      ) : null}
      {total ? (
        <div className="flex items-center gap-4 border-t pt-4 first:border-0 first:pt-0">
          <CalorieRing kcal={Math.round(total.kcal)} target={kcalTarget} />
          <dl className="grid min-w-0 flex-1 gap-1.5 text-sm">
            {[["Protein", total.p], ["Carbs", total.c], ["Fat", total.f]].map(([label, g]) => (
              <div key={label} className="flex items-baseline justify-between gap-2 rounded-lg bg-muted px-3 py-1.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="stat-number text-base">{Math.round(Number(g))} g</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
