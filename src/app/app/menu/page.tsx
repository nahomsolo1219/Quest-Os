import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { MealCard } from "@/components/client/meal-card";
import { requirePageActor, serviceCtx } from "@/server/session";
import { weekMenu } from "@/server/services/client-app";
import { profileLabel } from "@/domain/format";
import { addDays, addisDate, formatAddisDateTime, formatDate, weekStartOf } from "@/domain/time";
import { cn } from "@/lib/utils";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu" };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const { week } = await searchParams;
  const thisWeek = weekStartOf(addisDate(ctx.now));
  const next = week === "next";
  const m = await weekMenu(ctx, next ? addDays(thisWeek, 7) : thisWeek);
  const note = m.state === "locked" ? T.menu.locked : m.state === "open" ? T.menu.open(formatAddisDateTime(m.cutoff))
    : m.state === "paused" ? T.menu.paused : m.state === "skipped_unpaid" ? T.menu.skipped : T.menu.closed;
  return (
    <div className="space-y-4">
      <PageHeader title={T.menu.title} description={`Week of ${formatDate(m.weekStart, "long")} · ${profileLabel(m.profile)}`} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
        {[[false, T.menu.thisWeek, "/app/menu"], [true, T.menu.nextWeek, "/app/menu?week=next"]].map(([isNext, label, href]) => (
          <Link key={String(href)} href={String(href)} role="tab" aria-selected={next === isNext}
            className={cn("flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold", next === isNext ? "bg-background shadow-sm" : "text-muted-foreground")}>{label}</Link>
        ))}
      </div>
      <p className={cn("rounded-xl p-3 text-sm font-medium", m.state === "locked" ? "bg-success-soft text-success" : m.state === "open" ? "bg-accent" : "bg-warning-soft text-warning")}>{note}</p>
      {m.days.length === 0 ? (
        <EmptyState title="Nothing to show for this week.">Choose a plan and pay before Thursday&apos;s cutoff to get this week cooked.</EmptyState>
      ) : m.days.map((d) => (
        <section key={d.serviceDate} className="space-y-2">
          <h2 className="sticky top-14 z-10 bg-background/95 py-1 text-base font-bold">
            {formatDate(d.serviceDate, "long")} <span className="text-sm font-medium text-muted-foreground">· Menu {d.menu}{d.dropDate !== d.serviceDate ? ` · comes with ${formatDate(d.dropDate)}` : ""}</span>
          </h2>
          <div className="grid gap-2">
            {d.meals.map((meal) => <MealCard key={meal.slot} meal={meal} compact />)}
          </div>
        </section>
      ))}
    </div>
  );
}
