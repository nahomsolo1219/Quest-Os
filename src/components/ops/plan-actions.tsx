"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cashPaymentAction, discountAction, pauseAction, renewAction, repriceAction } from "@/app/staff/clients/actions";
import { S } from "@/app/staff/clients/strings";
import { useAction } from "./use-action";

/** Owner-only monthly discount with a reason (business rule 7). */
export function DiscountForm({ subscriptionId, current }: { subscriptionId: string; current: number }) {
  const { run, pending } = useAction();
  const [amount, setAmount] = useState(String(current));
  const [reason, setReason] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => discountAction({ subscriptionId, discountMonthBirr: Number(amount), reason })); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="discount-amount">{S.discount}</Label>
          <Input id="discount-amount" type="number" inputMode="numeric" min={0} step={1} className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="discount-reason">{S.discountReason}</Label>
          <Input id="discount-reason" required className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <Button type="submit" variant="outline" className="h-11" disabled={pending}>{S.applyDiscount}</Button>
    </form>
  );
}

export function PauseForm({ clientId, weeks: weekOptions }: { clientId: string; weeks: { value: string; label: string }[] }) {
  const { run, pending } = useAction();
  const [startWeek, setStartWeek] = useState(weekOptions[0]?.value ?? "");
  const [weeks, setWeeks] = useState("1");
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => pauseAction({ clientId, startWeek, weeks: Number(weeks) })); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pause-start">{S.pauseStart}</Label>
          <select id="pause-start" className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={startWeek} onChange={(e) => setStartWeek(e.target.value)}>
            {weekOptions.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pause-weeks">{S.pauseWeeks}</Label>
          <Input id="pause-weeks" type="number" inputMode="numeric" min={1} max={12} className="h-11" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </div>
      </div>
      <Button type="submit" variant="outline" className="h-11" disabled={pending}>{S.pause}</Button>
    </form>
  );
}

export function RenewButton({ clientId }: { clientId: string }) {
  const { run, pending } = useAction();
  return <Button variant="outline" className="h-11" disabled={pending} onClick={() => run(() => renewAction({ clientId }))}>{S.renew}</Button>;
}

export function RepriceForm({ subscriptionId, locked }: { subscriptionId: string; locked: boolean }) {
  const { run, pending } = useAction();
  const [reason, setReason] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => repriceAction({ subscriptionId, reason: reason || undefined })); }}>
      {locked ? (
        <div className="space-y-1.5">
          <Label htmlFor="reprice-reason">{S.repriceReason}</Label>
          <Input id="reprice-reason" required className="h-11" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      <Button type="submit" variant="outline" className="h-11" disabled={pending}>{S.reprice}</Button>
    </form>
  );
}

/** Cash at the counter: submits and confirms in one step. */
export function CashPaymentForm({ invoiceId, amountLabel }: { invoiceId: string; amountLabel: string }) {
  const { run, pending } = useAction();
  const [reference, setReference] = useState("");
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => cashPaymentAction({ invoiceId, reference: reference || undefined })); }}>
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor={`cash-ref-${invoiceId}`}>{S.cashReference}</Label>
        <Input id={`cash-ref-${invoiceId}`} className="h-11" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <Button type="submit" className="h-11" disabled={pending}>{S.recordCash} · {amountLabel}</Button>
    </form>
  );
}
