"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmPaymentAction, rejectPaymentAction } from "@/app/staff/payments/actions";
import { S } from "@/app/staff/payments/strings";
import { useAction } from "./use-action";

export type PaymentCardData = {
  paymentId: string; clientId: string; clientName: string; phone: string; amount: string; method: string; reference: string | null;
  period: string; kind: string; submitted: string; receiptUrl: string | null;
};

export function PaymentCard({ p }: { p: PaymentCardData }) {
  const { run, pending } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 sm:grid-cols-[160px_1fr]">
        {p.receiptUrl ? (
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="group relative block overflow-hidden rounded-lg border bg-muted" aria-label={S.tapToEnlarge}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
                <img src={p.receiptUrl} alt={S.receiptAlt(p.clientName)} className="h-40 w-full object-cover sm:h-40" />
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs text-white">{S.tapToEnlarge}</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-dvh max-w-3xl overflow-auto p-2">
              <DialogTitle className="sr-only">{S.receiptAlt(p.clientName)}</DialogTitle>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL */}
              <img src={p.receiptUrl} alt={S.receiptAlt(p.clientName)} className="h-auto w-full" />
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-xs text-muted-foreground sm:h-40">{S.noReceipt}</div>
        )}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/staff/clients/${p.clientId}?tab=payments`} className="font-semibold underline-offset-2 hover:underline">{p.clientName}</Link>
              <p className="text-sm text-muted-foreground">{p.phone}</p>
            </div>
            <p className="stat-number text-2xl">{p.amount}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Method</dt><dd className="font-medium">{p.method}</dd>
            <dt className="text-muted-foreground">{S.reference}</dt><dd className="font-medium break-all">{p.reference ?? "—"}</dd>
            <dt className="text-muted-foreground">{S.period}</dt><dd className="font-medium">{p.kind} · {p.period}</dd>
            <dt className="text-muted-foreground">{S.submitted}</dt><dd className="font-medium">{p.submitted}</dd>
          </dl>
          {rejecting ? (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => rejectPaymentAction({ paymentId: p.paymentId, reason })); }}>
              <Label htmlFor={`reason-${p.paymentId}`}>{S.rejectReason}</Label>
              <Textarea id={`reason-${p.paymentId}`} required minLength={3} rows={2} placeholder={S.rejectHint} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" className="h-11" disabled={pending}>{S.rejectSend}</Button>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setRejecting(false)}>{S.close}</Button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2" data-tour="payment-confirm">
              <Button className="h-11 flex-1 sm:flex-none sm:px-8" disabled={pending} onClick={() => run(() => confirmPaymentAction({ paymentId: p.paymentId }))}>{S.confirm}</Button>
              <Button variant="outline" className="h-11" disabled={pending} onClick={() => setRejecting(true)}>{S.reject}</Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
