import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { MacroRow } from "@/components/shell/stat";
import { MealCard } from "@/components/client/meal-card";
import { RatingForm } from "@/components/client/rating-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { todayForClient } from "@/server/services/client-app";
import { myRatings } from "@/server/services/ratings";
import { formatBirr } from "@/domain/money";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { T } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function TodayPage() {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const t = await todayForClient(ctx);
  const ratings = t.meals.length ? await myRatings(ctx, t.today, t.today) : [];
  const total = t.meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG, c: a.c + m.carbG, f: a.f + m.fatG }), { kcal: 0, p: 0, c: 0, f: 0 });

  return (
    <div className="space-y-4">
      <PageHeader title={T.today.title} description={formatDate(t.today, "long")} />
      {t.dueInvoice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
          <p className="text-sm font-medium">{T.today.payDue(formatBirr(t.dueInvoice.amountBirr), formatAddisDateTime(t.dueInvoice.dueAt))}</p>
          <Button asChild className="h-11 shrink-0"><Link href="/app/payments">{T.today.payNow}</Link></Button>
        </div>
      ) : null}
      {t.drops.map((d, i) => (
        <p key={i} className="rounded-xl bg-accent p-3 text-sm font-semibold">
          {(d.kind === "pickup" ? T.today.pickup : T.today.drop)[d.status]}{d.status === "failed" && d.failedReason ? `: ${d.failedReason}` : ""}
        </p>
      ))}
      {t.meals.length ? (
        <>
          <section aria-label="Today's total" className="rounded-2xl bg-primary/5 p-3">
            <MacroRow kcal={total.kcal} proteinG={total.p} carbG={total.c} fatG={total.f} />
          </section>
          {t.meals.map((m) => {
            const r = ratings.find((x) => x.mealId === m.mealId);
            return (
              <MealCard key={m.slot} meal={m}>
                <RatingForm mealId={m.mealId} serviceDate={t.today} initial={r ? { rating: r.rating, comment: r.comment } : undefined} />
              </MealCard>
            );
          })}
        </>
      ) : (
        <EmptyState title={emptyTitle(t)}
          action={!t.plan || t.dueInvoice ? <Button asChild className="h-11"><Link href="/app/payments">{T.today.payNow}</Link></Button>
            : <Button asChild variant="outline" className="h-11"><Link href="/app/menu">See this week&apos;s menu</Link></Button>}>
          {!t.plan ? T.today.noPlanHint : t.nextMealDate || t.paused ? null : T.today.nothingHint}
        </EmptyState>
      )}
      <nav className="grid grid-cols-2 gap-2 pt-2 text-sm font-semibold">
        {[["/app/swaps", "Swaps"], ["/app/pause", "Pause"], ["/app/payments", "Payments"], ["/app/profile", "Profile"]].map(([href, label]) => (
          <Link key={href} href={href} className="flex min-h-11 items-center justify-center rounded-xl border hover:bg-accent">{label}</Link>
        ))}
      </nav>
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
