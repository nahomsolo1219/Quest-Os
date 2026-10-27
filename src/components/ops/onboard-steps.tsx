"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Stat } from "@/components/shell/stat";
import { formatBirr } from "@/domain/money";
import { createPlanAction, provisionalProfileAction, quoteAction } from "@/app/staff/clients/actions";
import { W } from "@/app/staff/clients/strings";
import { ClientProfileForm, type ProfileDefaults } from "./client-profile-form";
import { DELIVERY_LABEL } from "./labels";
import { useAction } from "./use-action";

export function IntakeStep({ clientId, defaults, areas }: { clientId: string; defaults: ProfileDefaults; areas: { id: string; name: string }[] }) {
  const router = useRouter();
  return <ClientProfileForm clientId={clientId} defaults={defaults} areas={areas} mode="intake" submitLabel={W.next}
    onSaved={() => router.push(`/staff/clients/${clientId}/onboard?step=nutrition`)} />;
}

export function ProvisionalButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <Button className="h-11 w-full sm:w-auto" disabled={pending}
      onClick={() => run(() => provisionalProfileAction({ clientId }), { refresh: false, onDone: () => router.push(`/staff/clients/${clientId}/onboard?step=plan`) })}>
      {W.saveProvisional}
    </Button>
  );
}

type Pkg = { id: string; name: string; swapLimit: number; coaching: string; deliveryOptions: string[] };
type Quote = { ok: true; priceDayBirr: number; priceMonth: number; planPrice: number } | { ok: false; missing: string[] };

export function PlanStep({ clientId, packages }: { clientId: string; packages: Pkg[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const pkg = packages.find((p) => p.id === packageId);
  const [deliveryOption, setDelivery] = useState(pkg?.deliveryOptions[0] ?? "");
  const [billingPeriod, setBilling] = useState<"weekly" | "monthly">("weekly");
  const [termMonths, setTerm] = useState(1);
  const [start, setStart] = useState<"quick_start" | "next_week">("next_week");
  const [quote, setQuote] = useState<Quote | null>(null);
  const options = pkg?.deliveryOptions ?? [];
  const reset = () => setQuote(null);
  const radio = "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5";

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{W.package}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {packages.map((p) => (
            <label key={p.id} htmlFor={`pkg-${p.id}`} className={radio}>
              <input id={`pkg-${p.id}`} type="radio" name="package" className="accent-primary" checked={packageId === p.id}
                onChange={() => { setPackageId(p.id); setDelivery(p.deliveryOptions.includes(deliveryOption) ? deliveryOption : (p.deliveryOptions[0] ?? "")); reset(); }} />
              <span><span className="font-semibold">{p.name}</span><br /><span className="text-xs text-muted-foreground">{p.swapLimit} swaps · {p.coaching}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="plan-delivery">{W.delivery}</Label>
          <select id="plan-delivery" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={deliveryOption} onChange={(e) => { setDelivery(e.target.value); reset(); }}>
            {options.map((o) => <option key={o} value={o}>{DELIVERY_LABEL[o]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-billing">{W.billing}</Label>
          <select id="plan-billing" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={billingPeriod} onChange={(e) => setBilling(e.target.value as "weekly" | "monthly")}>
            <option value="weekly">{W.weekly}</option>
            <option value="monthly">{W.monthly}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-term">{W.term}</Label>
          <select id="plan-term" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={termMonths} onChange={(e) => setTerm(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{W.start}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["quick_start", W.startQuick], ["next_week", W.startNext]] as const).map(([v, l]) => (
            <label key={v} htmlFor={`start-${v}`} className={radio}>
              <input id={`start-${v}`} type="radio" name="start" className="accent-primary" checked={start === v} onChange={() => { setStart(v); reset(); }} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>

      {quote && !quote.ok ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm font-medium text-danger">{W.priceMissing(quote.missing.join(", "))}</p>
      ) : null}
      {quote && quote.ok ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label={W.priceDay} value={formatBirr(quote.priceDayBirr)} />
          <Stat label={W.priceMonth} value={formatBirr(quote.priceMonth)} />
          <Stat label={W.planPrice} value={formatBirr(quote.planPrice)} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" disabled={pending || !deliveryOption}
          onClick={() => run(() => quoteAction({ clientId, packageId, deliveryOption: deliveryOption as "daily", quickStart: start === "quick_start" }), { refresh: false, onDone: (q) => setQuote(q) })}>
          {W.getQuote}
        </Button>
        <Button className="h-11" disabled={pending || !quote || !quote.ok}
          onClick={() => run(() => createPlanAction({ clientId, packageId, deliveryOption: deliveryOption as "daily", billingPeriod, termMonths, start }),
            { refresh: false, onDone: () => router.push(`/staff/clients/${clientId}/onboard?step=swaps`) })}>
          {W.createPlan}
        </Button>
      </div>
    </div>
  );
}
