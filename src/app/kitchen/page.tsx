import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { addDays, formatDate } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { cookDays } from "@/server/services/kitchen";
import { cn } from "@/lib/utils";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kitchen" };

export default async function KitchenHome() {
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const { today, days } = await cookDays(await serviceCtx(actor));
  const label = (d: string) => (d === today ? S.today : d === addDays(today, 1) ? S.tomorrow : null);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={S.pickerTitle} description={S.pickerDescription} actions={
        <>
          <Link href="/kitchen/stock" className="inline-flex h-11 items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted">{S.stock}</Link>
          <Link href="/kitchen/waste" className="inline-flex h-11 items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted">{S.waste}</Link>
        </>
      } />
      <ul className="grid gap-3 sm:grid-cols-2">
        {days.map((d) => (
          <li key={d.date} className={cn("rounded-xl border bg-card p-4", d.date === today && "border-primary/40 ring-1 ring-primary/30")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                {label(d.date) ? <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label(d.date)}</p> : null}
                <h2 className="text-lg font-bold">{formatDate(d.date, "long")}</h2>
              </div>
              {d.quickStartMeals > 0 ? <Badge variant="secondary">{S.quickStart}: {d.quickStartMeals}</Badge> : null}
            </div>
            {d.meals > 0 ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground"><span className="stat-number text-2xl text-foreground">{d.meals}</span> meals · {d.clients} clients</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(["production", "recipes", "packing", "labels"] as const).map((k) => (
                    <Link key={k} href={`/kitchen/${k}/${d.date}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border bg-background px-2 text-center text-sm font-medium hover:bg-muted">
                      {S[k]}
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{S.noMeals}. {S.noMealsBody}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
