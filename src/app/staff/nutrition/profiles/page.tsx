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

  return (
    <div className="space-y-4">
      <PageHeader title={S.tabs.profiles} description={S.profilesIntro} actions={t.canEdit ? <RecomputeButton /> : null} />
      <nav aria-label="Menu" className="flex flex-wrap gap-2">
        {[...MENU_CODES, "extra" as const].map((code) => (
          <Link key={code} href={`/staff/nutrition/profiles?menu=${code}`} aria-current={menu === code ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
              menu === code ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {code === "extra" ? "Replacement meals" : `Menu ${code} · ${MENU_DAYS[code]}`}
          </Link>
        ))}
      </nav>

      {menu !== "extra" ? (
        <section aria-label="Day totals" className="space-y-2">
          <h2 className="text-lg font-semibold">Menu {menu}: day totals per profile</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {t.days.map((d) => (
              <div key={d.profile} className={cn("rounded-xl border p-3", d.result?.flagged && "border-warning/60 bg-warning-soft")}>
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

      {t.meals.map((meal) => (
        <section key={meal.id} className="space-y-2">
          <h2 className="text-lg font-semibold"><span className="capitalize text-muted-foreground">{meal.slot}</span> · {meal.name}</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th scope="col" className="sticky left-0 bg-muted px-2 py-2 text-left">Part</th>
                  <th scope="col" className="px-2 py-2 text-right">Base</th>
                  {PROFILES.map((p) => <th key={p} scope="col" className="px-2 py-2 text-right">{profileLabel(p)}</th>)}
                </tr>
              </thead>
              <tbody>
                {meal.parts.map((part) => (
                  <tr key={part.id} className="border-t">
                    <th scope="row" className="sticky left-0 bg-background px-2 py-1 text-left font-medium">
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
                <tr className="border-t bg-muted/40 text-xs">
                  <th scope="row" className="sticky left-0 bg-muted px-2 py-2 text-left">Meal kcal · P/C/F g</th>
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
