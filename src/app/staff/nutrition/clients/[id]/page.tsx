import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { CheckinForm } from "@/components/nutrition/checkin-form";
import { ConsultationForm } from "@/components/nutrition/consultation-form";
import { SetNutritionForm } from "@/components/nutrition/set-nutrition-form";
import { requirePageActor, serviceCtx } from "@/server/session";
import { ServiceError } from "@/server/services/context";
import { clientNutrition } from "@/server/services/nutrition";
import { displayName } from "@/domain/format";
import { addisDate, addisTime, formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "../../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client nutrition" };

const ACTIVITY: Record<string, string> = { sedentary: "Sedentary", light: "Light", moderate: "Moderate", very_active: "Very active", athlete: "Athlete" };
const goalLabel = (g: string | null) => (g === "lean" ? "Lean" : g === "build" ? "Build" : "–");

export default async function ClientNutritionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const ctx = await serviceCtx(actor);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d;
  try { d = await clientNutrition(ctx, id); } catch (e) { if (e instanceof ServiceError) notFound(); throw e; }
  const c = d.client;
  const cur = d.current?.p ?? null;
  const sug = d.suggestion;
  const today = addisDate(ctx.now);
  const nowLocal = `${today}T${addisTime(ctx.now)}`;
  const statRows: [string, string][] = [
    ["Sex", c.sex === "male" ? "Male" : c.sex === "female" ? "Female" : "–"], ["Age", c.age ? `${c.age}` : "–"], ["Weight", c.weightG ? `${(c.weightG / 1000).toFixed(1)} kg` : "–"],
    ["Height", c.heightCm ? `${c.heightCm} cm` : "–"], ["Activity", c.activity ? ACTIVITY[c.activity] : "–"], ["Goal", goalLabel(c.goal)],
    ["Allergies", c.allergies.join(", ") || "None"], ["Dislikes", c.dislikes.join(", ") || "None"],
  ];
  const compare = [
    { label: "Size", s: sug ? sug.size : "–", v: cur ? cur.size : "–" },
    { label: "Calories", s: sug ? `${sug.sizeKcal} kcal` : "–", v: cur ? `${cur.kcalTarget} kcal` : "–" },
    { label: "Protein", s: sug ? `${sug.proteinG} g` : "–", v: cur ? `${cur.proteinG} g` : "–" },
    { label: "Carbs", s: sug ? `${sug.carbG} g` : "–", v: cur ? `${cur.carbG} g` : "–" },
    { label: "Fat", s: sug ? `${sug.fatG} g` : "–", v: cur ? `${cur.fatG} g` : "–" },
  ];
  const defaults = cur
    ? { size: cur.size, goal: cur.goal, kcalTarget: cur.kcalTarget, proteinG: cur.proteinG, carbG: cur.carbG, fatG: cur.fatG, note: "" }
    : sug && c.goal ? { size: sug.size, goal: c.goal, kcalTarget: sug.sizeKcal, proteinG: sug.proteinG, carbG: sug.carbG, fatG: sug.fatG, note: "" } : null;
  const weights = d.checkins.filter((r) => r.c.weightG != null);

  return (
    <div className="space-y-6">
      <PageHeader title={displayName(c.firstName, c.lastName)}
        description={<>
          {d.subscription ? `${d.subscription.pkg} · ` : ""}{c.status}
          {cur?.provisional ? <Badge className="ml-2 bg-amber-100 text-amber-900" variant="secondary">{S.provisional}</Badge> : null}
          {cur?.isOverride ? <Badge className="ml-2" variant="outline">{S.override}</Badge> : null}
        </>}
        actions={<Link href={`/staff/clients/${c.id}`} className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">Full client record</Link>} />

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>{S.stats}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {statRows.map(([k, v]) => (<div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>))}
            </dl>
            {sug ? <p className="mt-3 text-sm text-muted-foreground">BMR {sug.bmr} · TDEE {sug.tdee} · goal-adjusted {sug.targetKcal} kcal → nearest size {sug.size} ({sug.sizeKcal} kcal)</p> : <p className="mt-3 text-sm text-amber-800">{S.noStats}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{S.suggestedVsSet}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead /><TableHead>{S.suggested}</TableHead><TableHead>{S.set}</TableHead></TableRow></TableHeader>
              <TableBody>
                {compare.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="tabular-nums">{r.s}</TableCell>
                    <TableCell className={`tabular-nums font-semibold ${cur && r.s !== r.v ? "text-amber-800" : ""}`}>{r.v}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {cur ? <p className="mt-2 text-xs text-muted-foreground">Set by {d.current?.setByName ?? "the calculator"} on {formatAddisDateTime(cur.setAt)}</p> : <p className="mt-2 text-sm text-muted-foreground">No targets set yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{S.setForm}</CardTitle></CardHeader>
        <CardContent>
          {!d.canWrite ? <p className="text-sm text-muted-foreground">{S.readOnly}</p>
            : !defaults ? <p className="text-sm text-amber-800">{S.noStats}</p>
            : <SetNutritionForm clientId={c.id} defaults={defaults} presets={d.presets} help={S.setFormHelp(formatDate(d.effectiveWeek, "long"))}
                suggestion={sug && c.goal ? { size: sug.size, goal: c.goal, kcal: sug.sizeKcal, proteinG: sug.proteinG, carbG: sug.carbG, fatG: sug.fatG } : null} />}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>{S.checkins}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {d.checkins.length === 0 ? <EmptyState title={S.checkinEmpty} /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Weight</TableHead><TableHead>Adherence</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.checkins.map((r) => (
                    <TableRow key={r.c.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(r.c.checkinDate)}</TableCell>
                      <TableCell className="tabular-nums">{r.c.weightG != null ? `${(r.c.weightG / 1000).toFixed(1)} kg` : "–"}</TableCell>
                      <TableCell className="tabular-nums">{r.c.adherencePct != null ? `${r.c.adherencePct}%` : "–"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.c.source === "client" ? "Client" : r.byName ?? "Nutritionist"}{r.c.notes ? ` · ${r.c.notes}` : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {weights.length >= 2 ? (
              <p className="text-sm">Change since {formatDate(weights[weights.length - 1].c.checkinDate)}: <span className="stat-number">
                {((weights[0].c.weightG! - weights[weights.length - 1].c.weightG!) / 1000).toFixed(1).replace("-", "−")} kg</span></p>
            ) : null}
            {d.canWrite ? <><h3 className="font-semibold">{S.logCheckin}</h3><CheckinForm clientId={c.id} today={today} /></> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{S.consultations}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {d.consultations.length === 0 ? <EmptyState title={S.consultEmpty} /> : (
              <ul className="divide-y text-sm">
                {d.consultations.map((r) => (
                  <li key={r.c.id} className="py-2">
                    <p className="font-medium">{formatAddisDateTime(r.c.heldAt)} · {r.c.mode === "phone" ? "Phone" : "In person"} · {r.byName ?? "–"}</p>
                    {r.c.notes ? <p className="text-muted-foreground">{r.c.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            {d.canWrite ? <><h3 className="font-semibold">{S.logConsult}</h3><ConsultationForm clientId={c.id} nowLocal={nowLocal} /></> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>{S.swaps}</CardTitle></CardHeader>
          <CardContent>
            {d.swaps.length === 0 ? <EmptyState title={S.swapsEmpty} /> : (
              <ul className="divide-y text-sm">
                {d.swaps.map((r) => (
                  <li key={r.s.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{r.label ?? r.s.customRequest ?? "Custom request"} <span className="text-muted-foreground">· from {formatDate(r.s.effectiveWeekStart)}</span></span>
                    <Badge variant={r.s.status === "requested" ? "secondary" : r.s.status === "approved" ? "default" : "outline"}>{r.s.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {d.subscription ? <p className="mt-2 text-xs text-muted-foreground">Swap limit on {d.subscription.pkg}: {d.subscription.swapLimit}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{S.history}</CardTitle></CardHeader>
          <CardContent>
            {d.history.length === 0 ? <EmptyState title="No targets yet." /> : (
              <ul className="divide-y text-sm">
                {d.history.map((r) => (
                  <li key={r.p.id} className="py-2">
                    <p className="font-medium">{r.p.size} {goalLabel(r.p.goal)} · {r.p.kcalTarget} kcal · P {r.p.proteinG} / C {r.p.carbG} / F {r.p.fatG} g
                      {r.p.isCurrent ? <Badge className="ml-2">Current</Badge> : null}{r.p.isOverride ? <Badge variant="outline" className="ml-2">{S.override}</Badge> : null}</p>
                    <p className="text-muted-foreground">{formatAddisDateTime(r.p.setAt)} · {r.setByName ?? "Calculator"} · suggested {r.p.suggestedSize}, {r.p.suggestedKcal} kcal</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
