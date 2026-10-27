"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markDeliveredAction, markFailedAction } from "@/app/delivery/actions";
import { formatEthiopianPhone } from "@/domain/phone";
import { StatusChip } from "./status-chip";
import { toastWithUndo } from "./undo-toast";
import { SLOT_TEXT, type DropCardData } from "./types";

const REASONS = ["Not home", "Wrong address", "Refused", "Other"] as const;

/** Rider view of one drop: tap to call, one tap delivered, failed with a reason picker. */
export function RiderDropCard({ drop, position }: { drop: DropCardData; position: number }) {
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [other, setOther] = useState("");
  const [pending, start] = useTransition();

  const delivered = () => start(async () => {
    const r = await markDeliveredAction({ dropId: drop.id });
    if (r.ok) toast.success(`${drop.name}: delivered`); else toast.error(r.error);
  });
  const failed = () => {
    const text = reason === "Other" ? other.trim() : reason;
    if (!text) { toast.error(reason === "Other" ? "Write what happened." : "Pick a reason."); return; }
    start(async () => {
      const r = await markFailedAction({ dropId: drop.id, reason: reason === "Other" ? `Other: ${text}` : text });
      if (r.ok) { toastWithUndo(r.message ?? "Marked failed", drop.id, "failed", drop.riderUserId == null); setFailing(false); setReason(""); setOther(""); } else toast.error(r.error);
    });
  };

  return (
    <li className="rounded-xl border bg-card p-4" data-tour={position === 1 ? "drop-first" : undefined}>
      <div className="flex items-start gap-3">
        <span className="stat-number text-2xl text-primary">{position}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{drop.name}</h3>
            <StatusChip status={drop.status} />
          </div>
          <p className="text-sm text-muted-foreground">{drop.areaName ?? "No area"} · {drop.mealsCount} meals{drop.slot ? ` · ${SLOT_TEXT[drop.slot] ?? drop.slot}` : ""}</p>
          <p className="mt-1 flex gap-1 text-sm"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />{drop.address ?? "No address on file. Call the client."}</p>
          {drop.status === "failed" && drop.failedReason ? <p className="mt-1 text-sm font-semibold text-danger">Failed: {drop.failedReason}</p> : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {drop.phone ? (
          <a href={`tel:${drop.phone}`} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border text-base font-semibold hover:bg-muted">
            <Phone aria-hidden className="size-5" /> Call {formatEthiopianPhone(drop.phone)}
          </a>
        ) : null}
        <Button type="button" data-tour={position === 1 ? "drop-delivered" : undefined} className="h-12 bg-success text-base hover:bg-success/90 disabled:border disabled:border-success/30 disabled:bg-success-soft disabled:text-success disabled:opacity-100" disabled={pending || drop.status === "delivered"} onClick={delivered}>
          {drop.status === "delivered" ? "Delivered" : "Delivered ✓"}
        </Button>
        <Button type="button" data-tour={position === 1 ? "drop-failed" : undefined} variant="outline" className="h-12 border-danger/30 text-base text-danger" disabled={pending} aria-expanded={failing}
          onClick={() => setFailing((f) => !f)}>Failed…</Button>
      </div>
      {failing ? (
        <fieldset className="mt-3 space-y-2 rounded-lg border border-danger/30 bg-danger-soft/50 p-3">
          <legend className="px-1 text-sm font-semibold">Why did it fail?</legend>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm has-[:checked]:border-danger has-[:checked]:font-semibold">
                <input type="radio" name={`reason-${drop.id}`} value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4" />{r}
              </label>
            ))}
          </div>
          {reason === "Other" ? (
            <div className="space-y-1">
              <Label htmlFor={`other-${drop.id}`}>What happened?</Label>
              <Input id={`other-${drop.id}`} value={other} maxLength={200} onChange={(e) => setOther(e.target.value)} className="h-11" />
            </div>
          ) : null}
          <Button type="button" variant="destructive" className="h-11 w-full" disabled={pending} onClick={failed}>Save as failed</Button>
        </fieldset>
      ) : null}
    </li>
  );
}
