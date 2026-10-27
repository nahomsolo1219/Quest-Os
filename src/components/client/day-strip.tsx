import Link from "next/link";
import { formatDate } from "@/domain/time";
import type { DateStr } from "@/domain/types";
import { cn } from "@/lib/utils";

/** Mon–Sun of the menu week as links (?day=YYYY-MM-DD), so the server renders the chosen day; no client JS. */
export function DayStrip({ days, selected, today, hasMeals, hrefFor }: {
  days: DateStr[]; selected: DateStr; today: DateStr; hasMeals: Set<DateStr>; hrefFor: (d: DateStr) => string;
}) {
  return (
    <nav aria-label="Days of the week" className="grid grid-cols-7 gap-1 rounded-2xl border bg-card p-1">
      {days.map((d) => {
        const [weekday, dayNum] = formatDate(d).split(" ");
        const isSel = d === selected;
        const isToday = d === today;
        const empty = !hasMeals.has(d);
        return (
          <Link key={d} href={hrefFor(d)} scroll={false} aria-label={`${formatDate(d, "long")}${isToday ? " (today)" : ""}${empty ? ", no meals" : ""}`}
            aria-current={isSel ? "date" : undefined}
            className={cn("relative flex min-h-14 flex-col items-center justify-center rounded-xl text-xs font-medium transition-colors",
              isSel ? "bg-primary text-primary-foreground" : empty ? "text-muted-foreground/70 hover:bg-accent" : "hover:bg-accent",
              isToday && !isSel && "ring-2 ring-inset ring-lime")}>
            <span>{weekday}</span>
            <span className={cn("stat-number text-lg leading-tight", empty && !isSel && "font-normal")}>{dayNum}</span>
            {isToday ? <span aria-hidden className={cn("absolute bottom-1 size-1.5 rounded-full", isSel ? "bg-lime" : "bg-primary")} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
