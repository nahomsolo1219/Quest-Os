import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { MacroRow, Stat } from "@/components/shell/stat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntakeStep, PlanStep, ProvisionalButton } from "@/components/ops/onboard-steps";
import { CashPaymentForm } from "@/components/ops/plan-actions";
import { InvoiceBadge, ToneBadge } from "@/components/ops/badges";
import { INVOICE_KIND_LABEL } from "@/components/ops/labels";
import { cn } from "@/lib/utils";
import { requirePageActor, serviceCtx } from "@/server/session";
import { getClientDetail, listAreas } from "@/server/services/clients";
import { planOptions } from "@/server/services/ops";
import { ServiceError } from "@/server/services/context";
import { formatBirr } from "@/domain/money";
import { profileLabel } from "@/domain/format";
import { profileOf } from "@/domain/nutrition";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { W } from "../../strings";

export const dynamic = "force-dynamic";

const STEPS = ["intake", "nutrition", "plan", "swaps", "invoice"] as const;
type Step = (typeof STEPS)[number];

export default async function OnboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const actor = await requirePageActor("owner", "operations");
  const { id } = await params;
  const { step: raw } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const step: Step = STEPS.includes(raw as Step) ? (raw as Step) : "intake";
  const ctx = await serviceCtx(actor);
  let d;
  try {
    d = await getClientDetail(ctx, id);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  }
  const c = d.client;
  const href = (s: Step) => `/staff/clients/${c.id}/onboard?step=${s}`;
  const idx = STEPS.indexOf(step);
  const firstInvoice = d.invoices.filter((i) => i.subscriptionId === d.subscription?.id).at(-1) ?? null;

  let body: React.ReactNode = null;
  if (step === "intake") {
    const areas = await listAreas(ctx);
    body = (
      <>
        <p className="mb-4 text-sm text-muted-foreground">{W.intakeIntro}</p>
        <IntakeStep clientId={c.id} areas={areas} defaults={{ firstName: c.firstName, lastName: c.lastName, address: c.address, areaId: c.areaId, landmark: c.landmark,
          allergies: c.allergies, dislikes: c.dislikes, sex: c.sex, age: c.age, weightG: c.weightG, heightCm: c.heightCm, activity: c.activity, goal: c.goal, checkInWeekday: c.checkInWeekday }} />
      </>
    );
  } else if (step === "nutrition") {
    const s = d.suggestion;
    body = (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{W.nutritionIntro}</p>
        {s ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Size" value={profileLabel(s.profile)} />
              <Stat label="Size kcal" value={s.sizeKcal} unit="kcal" />
              <Stat label="Goal kcal" value={s.targetKcal} unit="kcal" />
              <Stat label="TDEE" value={s.tdee} unit="kcal" />
            </div>
            <MacroRow kcal={s.sizeKcal} proteinG={s.proteinG} carbG={s.carbG} fatG={s.fatG} />
          </>
        ) : <p className="text-sm font-medium text-danger">Fill in sex, age, weight, height, activity and goal on the intake step first.</p>}
        {d.nutrition ? (
          <div className="space-y-3 rounded-lg border p-3 bg-card">
            <p className="text-sm">{W.hasProfile} <span className="font-semibold">{profileLabel(profileOf(d.nutrition.size, d.nutrition.goal))}, {d.nutrition.kcalTarget} kcal</span>
              {d.nutrition.provisional ? <ToneBadge tone="warn" className="ml-2">Provisional — nutritionist to confirm within 48 h</ToneBadge> : null}</p>
            <Button asChild className="h-11"><Link href={href("plan")}>{W.skip}</Link></Button>
          </div>
        ) : s ? <ProvisionalButton clientId={c.id} /> : null}
      </div>
    );
  } else if (step === "plan") {
    if (d.subscription) {
      body = (
        <div className="space-y-3">
          <p className="text-sm">{W.hasPlan} {d.package?.name} from {formatDate(d.subscription.startDate, "long")}.</p>
          <Button asChild className="h-11"><Link href={href("swaps")}>{W.skip}</Link></Button>
        </div>
      );
    } else if (!d.nutrition) {
      body = <p className="text-sm font-medium text-danger">Set the calorie target and size on the nutrition step first. <Link className="underline" href={href("nutrition")}>Go to nutrition</Link></p>;
    } else {
      const pkgs = await planOptions(ctx);
      body = (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{W.planIntro}</p>
          <PlanStep clientId={c.id} packages={pkgs} />
        </>
      );
    }
  } else if (step === "swaps") {
    body = (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{W.swapsIntro}</p>
        {d.package ? <p className="font-medium">{W.swapLimit(d.package.swapLimit)}</p> : null}
        {d.subscription?.isQuickStart ? <ToneBadge tone="warn">Quick start: standard menu, provisional size — nutritionist to confirm within 48 h</ToneBadge> : null}
        <p>{d.swaps.length ? `${d.swaps.length} swap(s) on file.` : "No swaps on file."}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11"><Link href="/staff/nutrition/swaps">{W.openSwaps}</Link></Button>
          <Button asChild className="h-11"><Link href={href("invoice")}>{W.skip}</Link></Button>
        </div>
      </div>
    );
  } else {
    body = firstInvoice ? (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{W.invoiceIntro}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label={W.amount} value={formatBirr(firstInvoice.amountBirr)} />
          <Stat label={W.dueBy} value={formatAddisDateTime(firstInvoice.dueAt)} className="[&_.stat-number]:text-lg" />
          <Stat label={W.period} value={`${formatDate(firstInvoice.periodStart)} – ${formatDate(firstInvoice.periodEnd)}`} className="[&_.stat-number]:text-lg" />
        </div>
        <p className="flex items-center gap-2 text-sm">{INVOICE_KIND_LABEL[firstInvoice.kind]} invoice · {firstInvoice.serviceDays} service days <InvoiceBadge status={firstInvoice.status} /></p>
        {firstInvoice.status === "issued" && !firstInvoice.payments.some((p) => p.status === "submitted") ? (
          <CashPaymentForm invoiceId={firstInvoice.id} amountLabel={formatBirr(firstInvoice.amountBirr)} />
        ) : null}
        <Button asChild variant="outline" className="h-11"><Link href={`/staff/clients/${c.id}?tab=payments`}>{W.done}</Link></Button>
      </div>
    ) : <p className="text-sm text-muted-foreground">{W.noInvoice} <Link className="underline" href={href("plan")}>Go to plan</Link></p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`${W.title}: ${c.firstName} ${c.lastName}`} actions={<Button asChild variant="ghost" className="h-11"><Link href={`/staff/clients/${c.id}`}>Client page</Link></Button>} />
      <ol className="mb-4 grid grid-cols-5 gap-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <Link href={href(s)} aria-current={s === step ? "step" : undefined}
              className={cn("flex min-h-11 flex-col items-center justify-center rounded-md border px-1 text-center text-xs font-medium",
                s === step ? "border-primary bg-primary text-primary-foreground" : i < idx ? "border-primary/40 text-primary" : "text-muted-foreground")}>
              <span>{i + 1}</span><span className="truncate">{W.steps[i]}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Card>
        <CardHeader><CardTitle>{W.steps[idx]}</CardTitle></CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}
