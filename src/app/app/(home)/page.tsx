import Link from "next/link";
import { ChevronRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Deadline } from "@/components/shell/deadline";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { MealCard } from "@/components/client/meal-card";
import { RatingForm } from "@/components/client/rating-form";
import { TodayHero } from "@/components/client/today-hero";
import { byEatingOrder } from "@/components/client/eating-order";
import { requirePageActor, serviceCtx } from "@/server/session";
import { todayForClient, todayHero } from "@/server/services/client-app";
import { myRatings } from "@/server/services/ratings";
import { formatBirr } from "@/domain/money";
import { formatDate } from "@/domain/time";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function TodayPage() {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const [t, hero] = await Promise.all([todayForClient(ctx), todayHero(ctx)]);
  const ratings = t.meals.length ? await myRatings(ctx, t.today, t.today) : [];
  const meals = byEatingOrder(t.meals);
  const total = meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG, c: a.c + m.carbG, f: a.f + m.fatG }), { kcal: 0, p: 0, c: 0, f: 0 });
  const live = t.plan && ["active", "paused", "pending_payment"].includes(t.plan.status);

  return (
    <div className="space-y-4">
      <PageHeader title={T.today.title} description={formatDate(t.today, "long")} />
      {t.dueInvoice ? (
        <div className="space-y-2 rounded-2xl border border-warning/30 bg-warning-soft p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 font-semibold text-warning">
              <CreditCard aria-hidden className="size-5 shrink-0" />
              <span>{T.today.payDue(formatBirr(t.dueInvoice.amountBirr), `${formatDate(t.dueInvoice.periodStart)} – ${formatDate(t.dueInvoice.periodEnd)}`)}</span>
            </p>
            <Button asChild className="h-11 shrink-0"><Link href="/app/payments">{T.today.payNow}</Link></Button>
          </div>
          <Deadline cutoff={t.dueInvoice.dueAt} now={ctx.now} verb={T.today.payBy} passedLabel="Overdue" />
        </div>
      ) : null}
      {meals.length || t.drops.length ? (
        <TodayHero drops={t.drops} deliverBy={hero.deliverBy} mealsDropDate={hero.mealsDropDate} today={t.today}
          total={meals.length ? total : null} kcalTarget={hero.kcalTarget} />
      ) : null}
      {meals.length ? (
        <section aria-label={T.today.meals} className="space-y-3">
          <h2 className="text-lg font-semibold">{T.today.meals}</h2>
          {meals.map((m) => {
            const r = ratings.find((x) => x.mealId === m.mealId);
            return (
              <MealCard key={m.slot} meal={m}>
                <RatingForm mealId={m.mealId} serviceDate={t.today} initial={r ? { rating: r.rating, comment: r.comment } : undefined} />
              </MealCard>
            );
          })}
        </section>
      ) : (
        <EmptyState title={emptyTitle(t)}
          action={!t.plan || t.dueInvoice ? <Button asChild className="h-11"><Link href="/app/payments">{T.today.payNow}</Link></Button>
            : <Button asChild variant="outline" className="h-11"><Link href="/app/menu">See this week&apos;s menu</Link></Button>}>
          {!t.plan ? T.today.noPlanHint : t.nextMealDate || t.paused ? null : T.today.nothingHint}
        </EmptyState>
      )}
      {live ? (
        <Link href="/app/plan" className="flex min-h-11 items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-accent">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">{T.today.changesFor(formatDate(hero.changeWeek))}</p>
            <Deadline cutoff={hero.cutoff} now={ctx.now} />
          </div>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-sage" />
        </Link>
      ) : null}
    </div>
  );
}

function emptyTitle(t: Awaited<ReturnType<typeof todayForClient>>): string {
  if (t.paused) return T.today.paused;
  if (!t.plan) return T.today.noPlan;
  const first = t.plan.startDate > t.today;
  if (t.nextMealDate) return first ? T.today.firstMeals(formatDate(t.nextMealDate, "long")) : T.today.nextMeals(formatDate(t.nextMealDate, "long"));
  if (first) return T.today.firstMeals(formatDate(t.plan.startDate, "long"));
  return T.today.nothing;
}
