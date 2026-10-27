import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { TONE_PANEL } from "@/components/shell/status-badge";
import { MealCard } from "@/components/client/meal-card";
import { DayStrip } from "@/components/client/day-strip";
import { byEatingOrder } from "@/components/client/eating-order";
import { requirePageActor, serviceCtx } from "@/server/session";
import { weekMenu } from "@/server/services/client-app";
import { profileLabel } from "@/domain/format";
import { addDays, addisDate, formatAddisDateTime, formatDate, isDateStr, weekStartOf } from "@/domain/time";
import type { DateStr } from "@/domain/types";
import { cn } from "@/lib/utils";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu" };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ week?: string; day?: string }> }) {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const { week, day } = await searchParams;
  const today = addisDate(ctx.now);
  const thisWeek = weekStartOf(today);
  const next = week === "next";
  const m = await weekMenu(ctx, next ? addDays(thisWeek, 7) : thisWeek);
  const note = m.state === "locked" ? T.menu.locked : m.state === "open" ? T.menu.open(formatAddisDateTime(m.cutoff))
    : m.state === "paused" ? T.menu.paused : m.state === "skipped_unpaid" ? T.menu.skipped : T.menu.closed;
  const tone = m.state === "locked" ? "good" : m.state === "open" ? "info" : m.state === "paused" ? "paused" : "warn";

  const weekDays: DateStr[] = Array.from({ length: 7 }, (_, i) => addDays(m.weekStart, i));
  const withMeals = new Set(m.days.filter((d) => d.meals.length).map((d) => d.serviceDate));
  const fallback = weekDays.includes(today) && withMeals.has(today) ? today : m.days.find((d) => d.meals.length)?.serviceDate ?? (weekDays.includes(today) ? today : m.weekStart);
  const selected = day && isDateStr(day) && weekDays.includes(day) ? day : fallback;
  const shown = m.days.find((d) => d.serviceDate === selected);
  const base = next ? "/app/menu?week=next" : "/app/menu";
  const hrefFor = (d: DateStr) => `${base}${next ? "&" : "?"}day=${d}`;

  return (
    <div className="space-y-4">
      <PageHeader title={T.menu.title} description={`Week of ${formatDate(m.weekStart, "long")} · ${profileLabel(m.profile)}`} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1" role="tablist">
        {[[false, T.menu.thisWeek, "/app/menu"], [true, T.menu.nextWeek, "/app/menu?week=next"]].map(([isNext, label, href]) => (
          <Link key={String(href)} href={String(href)} role="tab" aria-selected={next === isNext}
            className={cn("flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold",
              next === isNext ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</Link>
        ))}
      </div>
      <p className={cn("rounded-xl border p-3 text-sm font-medium", TONE_PANEL[tone])}>{note}</p>
      {m.days.length === 0 ? (
        <EmptyState title="Nothing to show for this week.">Choose a plan and pay before Thursday&apos;s cutoff to get this week cooked.</EmptyState>
      ) : (
        <>
          <DayStrip days={weekDays} selected={selected} today={today} hasMeals={withMeals} hrefFor={hrefFor} />
          <section aria-labelledby="menu-day" className="space-y-2">
            <h2 id="menu-day" className="text-base font-semibold">
              {formatDate(selected, "long")}{" "}
              {shown ? (
                <span className="text-sm font-medium text-muted-foreground">
                  · Menu {shown.menu}{shown.dropDate !== shown.serviceDate ? ` · comes with ${formatDate(shown.dropDate)}` : ""}
                </span>
              ) : null}
            </h2>
            {shown && shown.meals.length ? (
              <div className="grid gap-2">
                {byEatingOrder(shown.meals).map((meal) => <MealCard key={meal.slot} meal={meal} compact />)}
              </div>
            ) : (
              <EmptyState title={T.menu.noMealsDay}>{T.menu.noMealsDayHint}</EmptyState>
            )}
          </section>
        </>
      )}
    </div>
  );
}
