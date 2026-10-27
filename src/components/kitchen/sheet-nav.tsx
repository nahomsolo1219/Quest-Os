import Link from "next/link";
import { addDays, formatDate } from "@/domain/time";
import type { DateStr } from "@/domain/types";
import { cn } from "@/lib/utils";

const SHEETS = [
  { key: "production", label: "Production sheet" },
  { key: "recipes", label: "Recipe cards" },
  { key: "packing", label: "Packing list" },
  { key: "labels", label: "Labels" },
] as const;
export type SheetKey = (typeof SHEETS)[number]["key"];

/** Tabs between the four sheets of a cook day, plus previous / next day. Hidden in print. */
export function SheetNav({ date, current }: { date: DateStr; current: SheetKey }) {
  return (
    <nav aria-label="Kitchen sheets" className="no-print mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-sm sm:gap-2">
        <Link href="/kitchen" className="inline-flex min-h-11 items-center rounded-md px-1 font-medium text-primary underline-offset-4 hover:underline sm:px-2">← Cook days</Link>
        <span className="flex-1" />
        <Link href={`/kitchen/${current}/${addDays(date, -1)}`} className="inline-flex min-h-11 items-center rounded-md border bg-background px-2.5 hover:bg-muted sm:px-3">← {formatDate(addDays(date, -1))}</Link>
        <Link href={`/kitchen/${current}/${addDays(date, 1)}`} className="inline-flex min-h-11 items-center rounded-md border bg-background px-2.5 hover:bg-muted sm:px-3">{formatDate(addDays(date, 1))} →</Link>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {SHEETS.map((s) => (
          <Link key={s.key} href={`/kitchen/${s.key}/${date}`} aria-current={s.key === current ? "page" : undefined}
            className={cn("inline-flex min-h-11 shrink-0 items-center rounded-md border px-3 text-sm font-medium",
              s.key === current ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
            {s.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
