import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { PortionCell } from "@/components/nutrition/portion-cell";
import { RecomputeButton } from "@/components/nutrition/recompute-button";
import { requirePageActor, serviceCtx } from "@/server/session";
import { profileTable } from "@/server/services/nutrition";
import { profileLabel } from "@/domain/format";
import { formatAddisDateTime } from "@/domain/time";
import { MENU_CODES, PROFILES, type MenuCode } from "@/domain/types";
import { cn } from "@/lib/utils";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile table" };

const MENU_DAYS: Record<MenuCode, string> = { A: "Mon & Fri", B: "Tue & Sat", C: "Wed & Sun", D: "Thu" };

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ menu?: string }> }) {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const { menu: m } = await searchParams;
  const menu: MenuCode | "extra" = m === "extra" ? "extra" : (MENU_CODES as readonly string[]).includes(m ?? "") ? (m as MenuCode) : "A";
  const t = await profileTable(await serviceCtx(actor), menu);
  const computedAt = t.days.find((d) => d.result)?.result?.computedAt;
  // the tour lights one day card: the first flagged one, else the first
  const tourDay = Math.max(0, t.days.findIndex((d) => d.result?.flagged));

  return (
    <div className="space-y-4">
      <PageHeader title={S.tabs.profiles} description={S.profilesIntro} actions={t.canEdit ? <RecomputeButton /> : null} />
      <nav aria-label="Menu" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-2 md:w-auto md:flex-wrap">
          {[...MENU_CODES, "extra" as const].map((code) => (
            <li key={code}>
              <Link href={`/staff/nutrition/profiles?menu=${code}`} aria-current={menu === code ? "page" : undefined}
                className={cn("inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium",
                  menu === code ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
                {code === "extra" ? "Replacement meals" : `Menu ${code} · ${MENU_DAYS[code]}`}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {menu !== "extra" ? (
        <section aria-label="Day totals" className="space-y-2">
          <h2 className="text-lg font-semibold">Menu {menu}: day totals per profile</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {t.days.map((d, di) => (
              <div key={d.profile} data-tour={di === tourDay ? "profiles-totals" : undefined}
                className={cn("rounded-xl border bg-card p-3", d.result?.flagged && "border-warning/60 bg-warning-soft")}>
                <p className="text-sm font-semibold">{profileLabel(d.profile)}</p>
                {d.result ? (
                  <>
                    <p className="stat-number text-xl">{d.result.kcal} <span className="text-xs font-semibold text-muted-foreground">kcal</span></p>
                    <p className="text-xs tabular-nums text-muted-foreground">P {d.result.proteinG} · C {d.result.carbG} · F {d.result.fatG} g</p>
                    {d.result.flagged ? <p className="mt-1 text-xs font-medium text-warning">{d.result.flagReason ?? "Outside target"}</p> : <p className="mt-1 text-xs text-success">On target</p>}
                  </>
                ) : <p className="text-sm text-muted-foreground">Not computed. Press Recompute.</p>}
              </div>
            ))}
          </div>
          {computedAt ? <p className="text-xs text-muted-foreground">Last computed {formatAddisDateTime(computedAt)}</p> : null}
        </section>
      ) : <p className="text-sm text-muted-foreground">Replacement meals (the savory snack) scale with Menu A&apos;s factors for each profile.</p>}

      {t.meals.map((meal, mi) => (
        <section key={meal.id} className="space-y-2">
          <h2 className="text-lg font-semibold"><span className="capitalize text-muted-foreground">{meal.slot}</span> · {meal.name}</h2>
          {/* phones: one card per part, the six profiles as a 3 × 2 grid */}
          <ul className="space-y-2 md:hidden" aria-label={`${meal.name} parts`}>
            {meal.parts.map((part, pi) => (
              <li key={part.id} className="rounded-xl border bg-card p-3 shadow-sm" data-tour={mi === 0 && pi === 0 ? "profiles-portions" : undefined}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{part.name}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">Base {part.baseQty} {part.unit === "piece" ? "pc" : "g"}</p>
                </div>
                <p className="text-xs text-muted-foreground">{part.category} · {part.unit === "piece" ? "pieces" : "g"}</p>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {part.cells.map((cell) => (
                    <div key={cell.profile} className="min-w-0 rounded-md bg-muted/50 p-1">
                      <p className="px-1 text-[11px] font-semibold text-muted-foreground">{profileLabel(cell.profile)}</p>
                      <PortionCell partId={part.id} profile={cell.profile} qty={cell.qty} computedQty={cell.computedQty} isManual={cell.isManual}
                        unit={part.unit} canEdit={t.canEdit && part.category !== "seasoning"} label={`${part.name}, ${profileLabel(cell.profile)}`} />
                    </div>
                  ))}
                </div>
              </li>
            ))}
            <li className="rounded-xl border bg-muted p-3">
              <p className="text-sm font-semibold">Meal kcal · P/C/F g</p>
              <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                {meal.macros.map((mm) => (
                  <div key={mm.profile} className="tabular-nums">
                    <span className="block font-semibold text-muted-foreground">{profileLabel(mm.profile)}</span>
                    <span className="block text-sm font-semibold">{mm.kcal}</span>
                    {mm.proteinG}/{mm.carbG}/{mm.fatG}
                  </div>
                ))}
              </div>
            </li>
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-muted px-2 py-2 text-left shadow-[1px_0_0_var(--border)]">Part</th>
                  <th scope="col" className="px-2 py-2 text-right">Base</th>
                  {PROFILES.map((p) => <th key={p} scope="col" className="px-2 py-2 text-right">{profileLabel(p)}</th>)}
                </tr>
              </thead>
              <tbody>
                {meal.parts.map((part, pi) => (
                  <tr key={part.id} className="border-t" data-tour={mi === 0 && pi === 0 ? "profiles-portions" : undefined}>
                    <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium shadow-[1px_0_0_var(--border)]">
                      {part.name}
                      <span className="block text-xs font-normal text-muted-foreground">{part.category} · {part.unit === "piece" ? "pieces" : "g"}</span>
                    </th>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{part.baseQty}</td>
                    {part.cells.map((cell) => (
                      <td key={cell.profile} className="px-1 py-1">
                        <PortionCell partId={part.id} profile={cell.profile} qty={cell.qty} computedQty={cell.computedQty} isManual={cell.isManual}
                          unit={part.unit} canEdit={t.canEdit && part.category !== "seasoning"} label={`${part.name}, ${profileLabel(cell.profile)}`} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t bg-muted text-xs">
                  <th scope="row" className="sticky left-0 z-10 bg-muted px-2 py-2 text-left shadow-[1px_0_0_var(--border)]">Meal kcal · P/C/F g</th>
                  <td />
                  {meal.macros.map((mm) => (
                    <td key={mm.profile} className="px-2 py-2 text-right tabular-nums">
                      <span className="block text-sm font-semibold">{mm.kcal}</span>
                      {mm.proteinG}/{mm.carbG}/{mm.fatG}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {t.meals.length === 0 ? <p className="text-sm text-muted-foreground">No meals on this menu yet.</p> : null}
    </div>
  );
}
