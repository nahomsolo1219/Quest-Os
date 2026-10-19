import Link from "next/link";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PurchaseForm } from "@/components/kitchen/purchase-form";
import { PrintButton } from "@/components/kitchen/print-button";
import { units } from "@/components/kitchen/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatBirr } from "@/domain/money";
import { nextServiceDay, weekLockedAt } from "@/domain/schedule";
import { addDays, addisDate, formatAddisDateTime, formatDate, isDateStr, weekStartOf } from "@/domain/time";
import { cn } from "@/lib/utils";
import { requirePageActor, serviceCtx } from "@/server/session";
import { priceHistory, purchaseLog, shoppingListForWeek, stockIngredients, topUpList } from "@/server/services/inventory";
import { loadSettings } from "@/server/services/settings";
import type { Ctx } from "@/server/services/context";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchasing" };

type Tab = keyof typeof S.tabs;
type Search = { tab?: string; week?: string; topup?: string; ingredient?: string };

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePageActor("owner", "operations");
  const ctx = await serviceCtx(actor);
  const sp = await searchParams;
  const tab: Tab = sp.tab && sp.tab in S.tabs ? (sp.tab as Tab) : sp.topup ? "topup" : "shopping";
  const settings = await loadSettings(ctx.db);
  const today = addisDate(ctx.now);
  const week = sp.week && isDateStr(sp.week) ? weekStartOf(sp.week) : weekLockedAt(ctx.now, settings.schedule);
  const topup = sp.topup && isDateStr(sp.topup) ? sp.topup : nextServiceDay(today, settings.schedule) ?? addDays(today, 1);
  const canWrite = actor.roles.includes("operations");

  const href = (t: Tab) => `/staff/purchasing?tab=${t}${t === "shopping" ? `&week=${week}` : t === "topup" ? `&topup=${topup}` : ""}`;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={S.title} description={S.description} />
      <nav aria-label="Purchasing sections" className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
        {(Object.keys(S.tabs) as Tab[]).map((t) => (
          <Link key={t} href={href(t)} aria-current={t === tab ? "page" : undefined}
            className={cn("inline-flex min-h-11 shrink-0 items-center rounded-md border px-3 text-sm font-medium",
              t === tab ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{S.tabs[t]}</Link>
        ))}
      </nav>
      {tab === "shopping" ? <Shopping ctx={ctx} week={week} /> : null}
      {tab === "topup" ? <TopUp ctx={ctx} date={topup} /> : null}
      {tab === "log" ? <PurchaseLog ctx={ctx} today={today} canWrite={canWrite} /> : null}
      {tab === "prices" ? <Prices ctx={ctx} ingredientId={sp.ingredient} /> : null}
    </div>
  );
}

function BuyTable({ lines, totalBirr, showOnHand }: {
  lines: Awaited<ReturnType<typeof shoppingListForWeek>>["lines"]; totalBirr: number; showOnHand: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted/60 text-left">
          <tr>
            <th scope="col" className="p-2">Ingredient</th>
            <th scope="col" className="p-2 text-right">Buy</th>
            <th scope="col" className="p-2 text-right">Est. cost</th>
            <th scope="col" className="p-2 text-right">Need</th>
            {showOnHand ? <th scope="col" className="p-2 text-right">On hand</th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.ingredientId} className={cn("border-t", l.buyQty === 0 && "text-muted-foreground")}>
              <td className="p-2">{l.name}{l.supplier ? <span className="block text-xs text-muted-foreground">{l.supplier}</span> : null}</td>
              <td className="whitespace-nowrap p-2 text-right font-bold tabular-nums">{l.buyQty === 0 ? "Covered" : units(l.buyUnits, l.unit)}</td>
              <td className={cn("whitespace-nowrap p-2 text-right tabular-nums", l.costBirr == null && "font-semibold text-amber-700")}>
                {l.costBirr == null ? S.priceMissing : formatBirr(l.costBirr)}
              </td>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">{units(l.needUnits, l.unit)}</td>
              {showOnHand ? <td className="whitespace-nowrap p-2 text-right tabular-nums">{units(l.onHandUnits, l.unit)}</td> : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 font-bold">
            <td className="p-2" colSpan={2}>Total (priced lines)</td>
            <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatBirr(totalBirr)}</td>
            <td colSpan={showOnHand ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

async function Shopping({ ctx, week }: { ctx: Ctx; week: string }) {
  const list = await shoppingListForWeek(ctx, week);
  const toBuy = list.lines.filter((l) => l.buyQty > 0).length;
  return (
    <section aria-labelledby="shopping-h">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="shopping-h" className="mr-auto text-lg font-bold">Week of {formatDate(list.weekStart, "long")}</h2>
        <Link href={`/staff/purchasing?tab=shopping&week=${addDays(list.weekStart, -7)}`} className="no-print inline-flex h-11 items-center rounded-md border px-3 text-sm">← Previous week</Link>
        <Link href={`/staff/purchasing?tab=shopping&week=${addDays(list.weekStart, 7)}`} className="no-print inline-flex h-11 items-center rounded-md border px-3 text-sm">Next week →</Link>
        {list.mealsCount ? <PrintButton /> : null}
      </div>
      {list.mealsCount === 0 ? <EmptyState title={S.shoppingEmpty}>{S.shoppingEmptyBody}</EmptyState> : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {list.mealsCount} meals · stock on hand as of the end of {formatDate(list.stockAsOf)} (last count, plus purchases, minus waste and cooking) · {toBuy} items to buy
          </p>
          {list.missingPrices.length ? <p role="alert" className="mb-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{S.missingAlert} ({list.missingPrices.length} items)</p> : null}
          {toBuy === 0 ? <p className="mb-2 font-semibold text-emerald-700">{S.allCovered}</p> : null}
          <BuyTable lines={list.lines} totalBirr={list.totalBirr} showOnHand />
        </>
      )}
    </section>
  );
}

async function TopUp({ ctx, date }: { ctx: Ctx; date: string }) {
  const list = await topUpList(ctx, date);
  return (
    <section aria-labelledby="topup-h">
      <form method="get" className="no-print mb-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="topup" />
        <div className="space-y-1.5">
          <Label htmlFor="topup-date">Cook day</Label>
          <Input id="topup-date" type="date" name="topup" defaultValue={date} className="h-11 w-44" />
        </div>
        <Button type="submit" variant="outline" className="h-11">Show</Button>
      </form>
      <h2 id="topup-h" className="text-lg font-bold">Top-up for {formatDate(date, "long")}</h2>
      <p className="mb-2 text-sm text-muted-foreground">Fresh items (chicken, beef, fish, eggs, dairy, vegetables, fruit) for {list.quickStartClients} quick-start clients · buy the morning of the cook day.</p>
      {list.lines.length === 0 ? <EmptyState title={S.topupEmpty}>{S.topupEmptyBody}</EmptyState> : <BuyTable lines={list.lines} totalBirr={list.totalBirr} showOnHand={false} />}
    </section>
  );
}

async function PurchaseLog({ ctx, today, canWrite }: { ctx: Ctx; today: string; canWrite: boolean }) {
  const [ingredients, log] = await Promise.all([stockIngredients(ctx), purchaseLog(ctx)]);
  return (
    <section aria-labelledby="log-h" className="space-y-4">
      {canWrite ? <PurchaseForm ingredients={ingredients} today={today} /> : <p className="text-sm text-muted-foreground">Only operations log purchases.</p>}
      <h2 id="log-h" className="text-lg font-bold">Purchase log</h2>
      {log.length === 0 ? <EmptyState title={S.logEmpty}>{S.logEmptyBody}</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Ingredient</th><th scope="col" className="p-2 text-right">Quantity</th>
                <th scope="col" className="p-2 text-right">Total</th><th scope="col" className="p-2 text-right">Unit cost</th><th scope="col" className="p-2">Supplier</th></tr>
            </thead>
            <tbody>
              {log.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="whitespace-nowrap p-2">{formatDate(p.purchasedOn)}</td>
                  <td className="p-2"><Link className="text-primary underline-offset-4 hover:underline" href={`/staff/purchasing?tab=prices&ingredient=${p.ingredientId}`}>{p.ingredientName}</Link></td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{units(p.qtyUnits, p.unit)}</td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatBirr(p.totalPriceBirr)}</td>
                  <td className="whitespace-nowrap p-2 text-right font-semibold tabular-nums">{p.unitCostBirr == null ? "–" : `${formatBirr(p.unitCostBirr)} / ${p.unit}`}</td>
                  <td className="p-2">{p.supplier ?? "–"}{p.byName ? <span className="block text-xs text-muted-foreground">by {p.byName}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function Prices({ ctx, ingredientId }: { ctx: Ctx; ingredientId?: string }) {
  const ingredients = await stockIngredients(ctx);
  const picked = ingredientId && ingredients.some((i) => i.id === ingredientId) ? ingredientId : null;
  const data = picked ? await priceHistory(ctx, picked) : null;
  return (
    <section aria-labelledby="prices-h" className="space-y-4">
      <form method="get" className="no-print flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="prices" />
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-sm">
          <Label htmlFor="price-ingredient">Ingredient</Label>
          <select id="price-ingredient" name="ingredient" defaultValue={picked ?? ""} className="h-11 w-full rounded-md border bg-background px-3">
            <option value="">Pick an ingredient</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}{i.costPerUnitBirr == null ? " · price missing" : ` · ${formatBirr(i.costPerUnitBirr)}/${i.unit}`}</option>)}
          </select>
        </div>
        <Button type="submit" variant="outline" className="h-11">Show</Button>
      </form>
      <h2 id="prices-h" className="text-lg font-bold">{data ? `${data.ingredient.name}: ${data.ingredient.costPerUnitBirr == null ? S.priceMissing : `${formatBirr(data.ingredient.costPerUnitBirr)} per ${data.ingredient.unit}`}` : "Price history"}</h2>
      {!data ? <EmptyState title={S.pricesPick} /> : data.history.length === 0 ? <EmptyState title={S.pricesEmpty}>{S.pricesEmptyBody}</EmptyState> : (
        <ul className="divide-y rounded-xl border">
          {data.history.map((h) => (
            <li key={h.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
              <span className="font-semibold tabular-nums">{formatBirr(h.costPerUnitBirr)} / {data.ingredient.unit}</span>
              <span className="text-muted-foreground">{h.source === "purchase" ? "From a purchase" : "Set by hand"} · {formatAddisDateTime(h.setAt)}{h.byName ? ` · ${h.byName}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
