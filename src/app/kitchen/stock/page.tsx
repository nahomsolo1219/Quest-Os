import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { StockLine } from "@/components/kitchen/stock-line";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { addisDate, formatDate, isDateStr } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { stockSheet } from "@/server/services/inventory";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock count" };

const GROUP_LABEL: Record<string, string> = {
  chicken: "Chicken", beef: "Beef", fish: "Fish", eggs: "Eggs", dairy: "Dairy", vegetables: "Vegetables", fruit: "Fruit",
  grains: "Grains", legumes: "Legumes", oil: "Oil", other: "Other",
};

export default async function StockPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const ctx = await serviceCtx(actor);
  const today = addisDate(ctx.now);
  const sp = await searchParams;
  const date = sp.date && isDateStr(sp.date) && sp.date <= today ? sp.date : today;
  const sheet = await stockSheet(ctx, date);
  const canWrite = actor.roles.some((r) => r === "operations" || r === "kitchen");
  const groups = [...new Set(sheet.lines.map((l) => l.foodGroup))];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`${S.stockTitle} · ${formatDate(date, "long")}`} description={S.stockDescription} />
      <form className="no-print mb-4 flex flex-wrap items-end gap-2" method="get">
        <div className="space-y-1.5">
          <Label htmlFor="stock-date">Count date</Label>
          <Input id="stock-date" name="date" type="date" defaultValue={date} max={today} className="h-11 w-44" />
        </div>
        <Button type="submit" variant="outline" className="h-11">Show</Button>
        {date !== today ? <Link href="/kitchen/stock" className="inline-flex h-11 items-center px-2 text-sm text-primary underline">Today</Link> : null}
      </form>
      <div className="sticky top-14 z-10 mb-2 rounded-xl border bg-background/95 p-3 backdrop-blur md:top-0">
        <p className="text-sm font-semibold" aria-live="polite">{sheet.counted} of {sheet.total} counted</p>
        <Progress value={sheet.total ? (sheet.counted / sheet.total) * 100 : 0} className="mt-2" aria-label={`${sheet.counted} of ${sheet.total} counted`} />
      </div>
      {sheet.lines.length === 0 ? (
        <EmptyState title="No ingredients are tracked in stock">Ask an owner to mark ingredients as tracked in Settings → Ingredients.</EmptyState>
      ) : groups.map((g) => (
        <section key={g} className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{GROUP_LABEL[g] ?? g}</h2>
          {canWrite ? (
            <ul>
              {sheet.lines.filter((l) => l.foodGroup === g).map((l) => <StockLine key={`${l.ingredientId}:${date}`} line={l} date={date} />)}
            </ul>
          ) : (
            <ul>
              {sheet.lines.filter((l) => l.foodGroup === g).map((l) => (
                <li key={l.ingredientId} className="flex justify-between border-b py-3 text-sm">
                  <span className="font-semibold">{l.name}</span>
                  <span>Expected {l.expectedUnits} {l.unit} · {l.countedUnits == null ? "not counted" : `counted ${l.countedUnits} ${l.unit}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
