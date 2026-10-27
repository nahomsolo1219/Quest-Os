import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { MacroRow, Stat } from "@/components/shell/stat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { UnderlineTabsList, UnderlineTabsTrigger } from "@/components/shell/underline-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountBox } from "@/components/ops/account-box";
import { ClientStatusBadge, ConflictList, InvoiceBadge, OrderStatusBadge, PaymentBadge, PaymentRowBadge, ToneBadge } from "@/components/ops/badges";
import { ClientProfileForm } from "@/components/ops/client-profile-form";
import { NotesForm } from "@/components/ops/notes-form";
import { CashPaymentForm, DiscountForm, PauseForm, RenewButton, RepriceForm } from "@/components/ops/plan-actions";
import { DELIVERY_LABEL, INVOICE_KIND_LABEL, METHOD_LABEL, SLOT_LABEL, SOURCE_LABEL, SUB_STATUS_LABEL, WEEKDAY_LABEL } from "@/components/ops/labels";
import { can } from "@/server/authz";
import { requirePageActor, serviceCtx } from "@/server/session";
import { getClientDetail, listAreas } from "@/server/services/clients";
import { receiptUrl } from "@/server/services/billing";
import { ServiceError } from "@/server/services/context";
import { formatBirr } from "@/domain/money";
import { formatEthiopianPhone } from "@/domain/phone";
import { profileLabel } from "@/domain/format";
import { profileOf } from "@/domain/nutrition";
import { addDays, addisDate, formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "../strings";

export const dynamic = "force-dynamic";

const TAB_KEYS = ["profile", "nutrition", "plan", "swaps", "payments", "orders", "checkins", "notes", "audit"] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const { id } = await params;
  const { tab } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await serviceCtx(actor);
  let d;
  try {
    d = await getClientDetail(ctx, id);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  }
  const areas = await listAreas(ctx);
  const c = d.client;
  const sub = d.subscription;
  const today = addisDate(ctx.now);
  const canWrite = can(actor, "clients.write");
  const isOwner = can(actor, "discounts.apply");
  const receipts = new Map<string, string>();
  for (const inv of d.invoices) for (const p of inv.payments) if (p.receiptKey) receipts.set(p.id, await receiptUrl(ctx, p.receiptKey));
  const pauseWeeks = Array.from({ length: 8 }, (_, i) => addDays(d.changeEffectiveWeek, 7 * i)).map((w) => ({ value: w, label: `Week of ${formatDate(w, "long")}` }));
  const defaultTab = TAB_KEYS.includes(tab as (typeof TAB_KEYS)[number]) ? tab! : "profile";
  const visibleTabs = TAB_KEYS.filter((k) => (k === "payments" ? d.canMoney : k === "audit" ? can(actor, "audit.read") : true));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        description={<span className="flex flex-wrap items-center gap-2">
          <ClientStatusBadge status={c.status} />
          {d.canMoney ? <PaymentBadge state={d.payment} /> : null}
          <a href={`tel:${c.phone}`} className="underline-offset-2 hover:underline">{formatEthiopianPhone(c.phone)}</a>
          {c.leadSource ? <span>· {SOURCE_LABEL[c.leadSource]}</span> : null}
        </span>}
        actions={canWrite && (!sub || c.status === "lead") ? <Button asChild className="h-11"><Link href={`/staff/clients/${c.id}/onboard`} data-tour="client-onboard">{S.onboard}</Link></Button> : null}
      />

      {d.conflicts.length ? (
        <div role="alert" className="mb-4 rounded-xl border-2 border-danger/30 bg-danger-soft p-4">
          <p className="font-semibold text-danger">{S.conflictsTitle}</p>
          <p className="mb-2 text-sm text-danger">{S.conflictsBody}</p>
          <ul className="space-y-1">
            {d.conflicts.map((m) => (
              <li key={m.mealName} className="text-sm text-danger">
                <span className="font-semibold">Menu {m.menu} {SLOT_LABEL[m.slot]} · {m.mealName}:</span> {m.conflicts.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Tabs defaultValue={defaultTab}>
        <UnderlineTabsList data-tour="client-tabs">
          {visibleTabs.map((k) => <UnderlineTabsTrigger key={k} value={k} data-tour={k === "plan" ? "client-plan" : k === "notes" ? "client-notes" : undefined}>{S.tabs[k]}</UnderlineTabsTrigger>)}
        </UnderlineTabsList>

        <TabsContent value="profile" className="mt-2">
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <Card>
              <CardHeader><CardTitle>{S.tabs.profile}</CardTitle></CardHeader>
              <CardContent>
                {canWrite || can(actor, "clients.writeBodyStats") ? (
                  <ClientProfileForm clientId={c.id} areas={areas} defaults={{ firstName: c.firstName, lastName: c.lastName, address: c.address, areaId: c.areaId, landmark: c.landmark, allergies: c.allergies, dislikes: c.dislikes, sex: c.sex, age: c.age, weightG: c.weightG, heightCm: c.heightCm, activity: c.activity, goal: c.goal, checkInWeekday: c.checkInWeekday }} />
                ) : null}
              </CardContent>
            </Card>
            {can(actor, "clients.resetPassword") ? (
              <Card className="h-fit">
                <CardHeader><CardTitle>{S.account}</CardTitle></CardHeader>
                <CardContent><AccountBox clientId={c.id} phone={c.phone} hasAccount={Boolean(d.account)} /></CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="nutrition" className="mt-2 space-y-4">
          {d.nutrition ? (
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>{d.nutrition.provisional ? S.setProvisional : S.set}</CardTitle>
                {d.nutrition.provisional ? <ToneBadge tone="warn">Provisional</ToneBadge> : null}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Profile" value={profileLabel(profileOf(d.nutrition.size, d.nutrition.goal))} />
                  <Stat label="Target" value={d.nutrition.kcalTarget} unit="kcal" />
                  <Stat label="TDEE" value={d.nutrition.tdee} unit="kcal" />
                  <Stat label="BMR" value={d.nutrition.bmr} unit="kcal" />
                </div>
                <MacroRow kcal={d.nutrition.kcalTarget} proteinG={d.nutrition.proteinG} carbG={d.nutrition.carbG} fatG={d.nutrition.fatG} />
                <p className="text-sm text-muted-foreground">
                  Suggested: size {d.nutrition.suggestedSize}, {d.nutrition.suggestedKcal} kcal, P {d.nutrition.suggestedProteinG} g / C {d.nutrition.suggestedCarbG} g / F {d.nutrition.suggestedFatG} g.
                  {d.nutrition.isOverride ? " The nutritionist overrode the suggestion." : ""} Set {formatAddisDateTime(d.nutrition.setAt)}.
                </p>
              </CardContent>
            </Card>
          ) : (
            <EmptyState title={S.nutritionNone} />
          )}
          <Card>
            <CardHeader><CardTitle>{S.suggested}</CardTitle></CardHeader>
            <CardContent>
              {d.suggestion ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Size" value={`${d.suggestion.size} · ${d.suggestion.sizeKcal}`} unit="kcal" />
                    <Stat label="Goal kcal" value={d.suggestion.targetKcal} unit="kcal" />
                    <Stat label="TDEE" value={d.suggestion.tdee} unit="kcal" />
                    <Stat label="BMR" value={d.suggestion.bmr} unit="kcal" />
                  </div>
                  <MacroRow kcal={d.suggestion.sizeKcal} proteinG={d.suggestion.proteinG} carbG={d.suggestion.carbG} fatG={d.suggestion.fatG} compact />
                </div>
              ) : <p className="text-sm text-muted-foreground">{S.needsStats}</p>}
            </CardContent>
          </Card>
          <Button asChild variant="outline" className="h-11"><Link href="/staff/nutrition">{S.openNutrition}</Link></Button>
        </TabsContent>

        <TabsContent value="plan" className="mt-2 space-y-4">
          {sub && d.package ? (
            <>
              <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle>{d.package.name} · {sub.goal === "lean" ? "Lean" : "Build"}</CardTitle>
                  <ToneBadge tone={sub.status === "active" ? "good" : sub.status === "pending_payment" ? "warn" : "muted"}>{SUB_STATUS_LABEL[sub.status]}</ToneBadge>
                </CardHeader>
                <CardContent>
                  <Row label="Delivery">{DELIVERY_LABEL[sub.deliveryOption]}</Row>
                  <Row label="Billing">{sub.billingPeriod === "weekly" ? "Weekly" : "Monthly"} · {sub.termMonths} month term</Row>
                  <Row label="Dates">{formatDate(sub.startDate, "long")} – {formatDate(sub.endDate, "long")}</Row>
                  {sub.isQuickStart ? <Row label="Quick start period">until {sub.quickStartPeriodEnd ? formatDate(sub.quickStartPeriodEnd, "long") : "—"}</Row> : null}
                  <Row label="Price per day">{formatBirr(sub.priceDayBirr)}</Row>
                  <Row label="Plan price per month">{formatBirr(sub.planPriceBirr)}</Row>
                  <Row label="Monthly discount">{sub.discountMonthBirr ? `${formatBirr(sub.discountMonthBirr)} (${sub.discountReason ?? ""})` : "None"}</Row>
                  <Row label="Price locked until">{formatDate(sub.priceLockedUntil, "long")}</Row>
                  <Row label="Swap limit">{d.package.swapLimit}</Row>
                  {d.pauses.length ? <Row label="Pauses">{d.pauses.map((p) => `${formatDate(p.startWeek)} × ${p.weeks} wk`).join(", ")}</Row> : null}
                </CardContent>
              </Card>
              {can(actor, "subscriptions.write") && ["active", "paused"].includes(sub.status) ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle>{S.pauseTitle}</CardTitle></CardHeader>
                    <CardContent><PauseForm clientId={c.id} weeks={pauseWeeks} /></CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Renew and price</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <RenewButton clientId={c.id} />
                      {isOwner || today >= sub.priceLockedUntil ? <RepriceForm subscriptionId={sub.id} locked={today < sub.priceLockedUntil} /> : null}
                    </CardContent>
                  </Card>
                  {isOwner ? (
                    <Card className="md:col-span-2">
                      <CardHeader><CardTitle>Discount (owner)</CardTitle></CardHeader>
                      <CardContent><DiscountForm subscriptionId={sub.id} current={sub.discountMonthBirr} /></CardContent>
                    </Card>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title={S.noPlan} action={canWrite ? <Button asChild className="h-11"><Link href={`/staff/clients/${c.id}/onboard`}>{S.onboard}</Link></Button> : null} />
          )}
        </TabsContent>

        <TabsContent value="swaps" className="mt-2 space-y-4">
          {d.swaps.length ? (
            <Card><CardContent className="pt-6">
              <ul className="divide-y">
                {d.swaps.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium">{s.label}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      from {formatDate(s.effectiveWeekStart)}{s.endedWeekStart ? ` to ${formatDate(s.endedWeekStart)}` : ""}
                      <ToneBadge tone={s.status === "approved" ? "good" : s.status === "requested" ? "warn" : "muted"}>{s.status}</ToneBadge>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          ) : <EmptyState title={S.swapsEmpty} />}
          {d.addons.length ? (
            <Card>
              <CardHeader><CardTitle>{S.addonsTitle}</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {d.addons.map((a) => <li key={a.id} className="py-2">Extra protein · {SLOT_LABEL[a.slot]} · {formatBirr(a.pricePerPortionBirr)} per portion · from {formatDate(a.effectiveWeekStart)}{a.endedWeekStart ? ` to ${formatDate(a.endedWeekStart)}` : ""}</li>)}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {d.canMoney ? (
          <TabsContent value="payments" className="mt-2 space-y-3">
            {d.invoices.length === 0 ? <EmptyState title={S.invoicesEmpty} /> : d.invoices.map((inv) => (
              <Card key={inv.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{INVOICE_KIND_LABEL[inv.kind]} · {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</p>
                      <p className="text-sm text-muted-foreground">{inv.serviceDays} service days · due {formatAddisDateTime(inv.dueAt)}{inv.creditAppliedBirr ? ` · credit ${formatBirr(inv.creditAppliedBirr)}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2"><span className="stat-number text-lg">{formatBirr(inv.amountBirr)}</span><InvoiceBadge status={inv.status} /></div>
                  </div>
                  {inv.payments.length ? (
                    <ul className="divide-y rounded-lg border text-sm bg-card">
                      {inv.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                          <span>{METHOD_LABEL[p.method]} {formatBirr(p.amountBirr)}{p.reference ? ` · ref ${p.reference}` : ""} · {formatAddisDateTime(p.submittedAt)}</span>
                          <span className="flex items-center gap-2">
                            {receipts.get(p.id) ? <a className="font-medium text-primary underline" href={receipts.get(p.id)} target="_blank" rel="noreferrer">{S.receipt}</a> : null}
                            <PaymentRowBadge status={p.status} />
                          </span>
                          {p.rejectionReason ? <p className="w-full text-danger">{p.rejectionReason}</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {inv.status === "issued" && can(actor, "payments.confirm") && !inv.payments.some((p) => p.status === "submitted") ? (
                    <CashPaymentForm invoiceId={inv.id} amountLabel={formatBirr(inv.amountBirr)} />
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ) : null}

        <TabsContent value="orders" className="mt-2">
          {d.orders.length === 0 ? <EmptyState title={S.ordersEmpty} /> : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader><TableRow><TableHead>Week</TableHead><TableHead>Status</TableHead><TableHead>Profile</TableHead><TableHead>Days</TableHead><TableHead>Conflicts</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="whitespace-nowrap"><Link className="underline-offset-2 hover:underline" href={`/staff/orders?week=${o.weekStart}`}>{formatDate(o.weekStart)}</Link>{o.isQuickStart ? <ToneBadge tone="info" className="ml-1">Quick start</ToneBadge> : null}</TableCell>
                      <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                      <TableCell>{profileLabel(o.profile)}</TableCell>
                      <TableCell>{o.days}</TableCell>
                      <TableCell className="min-w-48 whitespace-normal">{o.conflicts.length ? <ConflictList conflicts={o.conflicts} /> : <span className="text-muted-foreground">None</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="checkins" className="mt-2 space-y-4">
          {d.checkins.length === 0 ? <EmptyState title={S.checkinsEmpty} /> : (
            <Card><CardContent className="pt-6">
              <ul className="divide-y text-sm">
                {d.checkins.map((k) => (
                  <li key={k.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-medium">{formatDate(k.checkinDate, "long")}</span>
                    <span>{k.weightG ? `${(k.weightG / 1000).toFixed(1)} kg` : "—"}{k.adherencePct != null ? ` · ${k.adherencePct}% adherence` : ""}</span>
                    {k.notes ? <p className="w-full text-muted-foreground">{k.notes}</p> : null}
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          )}
          <p className="text-sm text-muted-foreground">Check-in day: {c.checkInWeekday ? WEEKDAY_LABEL[c.checkInWeekday] : "not set"}</p>
          <Card>
            <CardHeader><CardTitle>{S.consultsTitle}</CardTitle></CardHeader>
            <CardContent>
              {d.consultations.length === 0 ? <p className="text-sm text-muted-foreground">{S.consultsEmpty}</p> : (
                <ul className="divide-y text-sm">
                  {d.consultations.map((k) => (
                    <li key={k.id} className="py-2"><span className="font-medium">{formatAddisDateTime(k.heldAt)}</span> · {k.mode === "phone" ? "Phone" : "In person"}{k.byName ? ` · ${k.byName}` : ""}{k.notes ? <p className="text-muted-foreground">{k.notes}</p> : null}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-2 space-y-4">
          {c.leadNotes ? <Card><CardHeader><CardTitle>Lead notes</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm">{c.leadNotes}</CardContent></Card> : null}
          <Card><CardContent className="pt-6"><NotesForm clientId={c.id} notes={c.notes} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-2">
          {d.audit.length === 0 ? <EmptyState title={S.auditEmpty} /> : (
            <Card><CardContent className="pt-6">
              <ul className="divide-y text-sm">
                {d.audit.map((a) => (
                  <li key={a.id} className="space-y-1 py-2">
                    <p><span className="font-medium">{a.action}</span> · {a.actorName ?? "Quest Meals (automatic)"} · {formatAddisDateTime(a.createdAt)}</p>
                    {a.reason ? <p className="text-muted-foreground">Reason: {a.reason}</p> : null}
                    {a.after ? <p className="break-all font-mono text-xs text-muted-foreground">{a.before ? `${JSON.stringify(a.before)} → ` : ""}{JSON.stringify(a.after)}</p> : null}
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
