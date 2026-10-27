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
import { ResponsiveTable, type RtColumn } from "@/components/shell/responsive-table";
import { UnderlineTabNav } from "@/components/shell/underline-tabs";
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
      <UnderlineTabNav label="Purchasing sections"
        items={(Object.keys(S.tabs) as Tab[]).map((t) => ({ key: t, href: href(t), label: S.tabs[t], active: t === tab }))} />
      {tab === "shopping" ? <Shopping ctx={ctx} week={week} /> : null}
      {tab === "topup" ? <TopUp ctx={ctx} date={topup} /> : null}
      {tab === "log" ? <PurchaseLog ctx={ctx} today={today} canWrite={canWrite} /> : null}
      {tab === "prices" ? <Prices ctx={ctx} ingredientId={sp.ingredient} /> : null}
    </div>
  );
}

type BuyLine = Awaited<ReturnType<typeof shoppingListForWeek>>["lines"][number];

function BuyTable({ lines, totalBirr, showOnHand }: { lines: BuyLine[]; totalBirr: number; showOnHand: boolean }) {
  const columns: RtColumn<BuyLine>[] = [
    { key: "name", header: "Ingredient", cell: (l) => <>{l.name}{l.supplier ? <span className="block text-xs font-normal text-muted-foreground">{l.supplier}</span> : null}</> },
    { key: "buy", header: "Buy", align: "right", card: "key", className: "whitespace-nowrap font-bold",
      cell: (l) => <span className={cn("font-bold", l.buyQty === 0 && "font-medium text-muted-foreground")}>{l.buyQty === 0 ? "Covered" : units(l.buyUnits, l.unit)}</span> },
    { key: "cost", header: "Est. cost", align: "right", card: "key", className: "whitespace-nowrap",
      cell: (l) => l.costBirr == null ? <span className="font-semibold text-warning">{S.priceMissing}</span> : formatBirr(l.costBirr) },
    { key: "need", header: "Need", align: "right", card: "key", className: "whitespace-nowrap", cell: (l) => units(l.needUnits, l.unit) },
    ...(showOnHand ? [{ key: "onhand", header: "On hand", align: "right", card: "key", className: "whitespace-nowrap", cell: (l) => units(l.onHandUnits, l.unit) } satisfies RtColumn<BuyLine>] : []),
  ];
  return (
    <ResponsiveTable dense label="Shopping list" rows={lines} rowKey={(l) => l.ingredientId} columns={columns} minWidth={520}
      rowClassName={(l) => (l.buyQty === 0 ? "text-muted-foreground" : undefined)}
      cardFooter={<span className="flex justify-between gap-2"><span>Total (priced lines)</span><span className="tabular-nums">{formatBirr(totalBirr)}</span></span>}
      footer={
        <tr className="border-t bg-muted font-bold">
          <th scope="row" className="sticky left-0 bg-muted px-3 py-2 text-left" colSpan={2}>Total (priced lines)</th>
          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatBirr(totalBirr)}</td>
          <td colSpan={showOnHand ? 2 : 1} />
        </tr>
      } />
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
          {list.missingPrices.length ? <p role="alert" className="mb-2 rounded-md border border-warning/30 bg-warning-soft p-2 text-sm text-warning">{S.missingAlert} ({list.missingPrices.length} items)</p> : null}
          {toBuy === 0 ? <p className="mb-2 font-semibold text-success">{S.allCovered}</p> : null}
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
        <ResponsiveTable label="Purchase log" rows={log} rowKey={(p) => p.id} minWidth={680} columns={[
          { key: "ingredient", header: "Ingredient", cell: (p) => (
            <Link className="text-primary underline-offset-4 hover:underline" href={`/staff/purchasing?tab=prices&ingredient=${p.ingredientId}`}>{p.ingredientName}</Link>
          ) },
          { key: "date", header: "Date", card: "key", className: "whitespace-nowrap", cell: (p) => formatDate(p.purchasedOn) },
          { key: "qty", header: "Quantity", align: "right", card: "key", className: "whitespace-nowrap", cell: (p) => units(p.qtyUnits, p.unit) },
          { key: "total", header: "Total", align: "right", card: "key", className: "whitespace-nowrap", cell: (p) => formatBirr(p.totalPriceBirr) },
          { key: "unit", header: "Unit cost", align: "right", card: "key", className: "whitespace-nowrap font-semibold",
            cell: (p) => (p.unitCostBirr == null ? "–" : `${formatBirr(p.unitCostBirr)} / ${p.unit}`) },
          { key: "supplier", header: "Supplier", card: "more", cell: (p) => <>{p.supplier ?? "–"}{p.byName ? <span className="block text-xs text-muted-foreground">by {p.byName}</span> : null}</> },
        ]} />
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
          <select id="price-ingredient" name="ingredient" defaultValue={picked ?? ""} className="h-11 w-full rounded-md border bg-card px-3">
            <option value="">Pick an ingredient</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}{i.costPerUnitBirr == null ? " · price missing" : ` · ${formatBirr(i.costPerUnitBirr)}/${i.unit}`}</option>)}
          </select>
        </div>
        <Button type="submit" variant="outline" className="h-11">Show</Button>
      </form>
      <h2 id="prices-h" className="text-lg font-bold">{data ? `${data.ingredient.name}: ${data.ingredient.costPerUnitBirr == null ? S.priceMissing : `${formatBirr(data.ingredient.costPerUnitBirr)} per ${data.ingredient.unit}`}` : "Price history"}</h2>
      {!data ? <EmptyState title={S.pricesPick} /> : data.history.length === 0 ? <EmptyState title={S.pricesEmpty}>{S.pricesEmptyBody}</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
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
