"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/owner/use-action";
import { decideSwapAction } from "@/app/staff/nutrition/actions";

/** Approve (optionally mapping a custom request to a swap rule) or reject with a reason. */
export function SwapDecision({ id, isCustom, rules }: { id: string; isCustom: boolean; rules: { id: string; label: string }[] }) {
  const [note, setNote] = useState("");
  const [ruleId, setRuleId] = useState("");
  const { pending, run } = useAction();
  return (
    <div className="space-y-3">
      {isCustom ? (
        <div className="space-y-1.5">
          <Label htmlFor={`rule-${id}`}>Map to swap rule (optional)</Label>
          <select id={`rule-${id}`} className="h-11 w-full rounded-md border bg-card px-3" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            <option value="">Keep as a custom note for the kitchen</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`note-${id}`}>Note to the client (needed to reject)</Label>
        <Textarea id={`note-${id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button className="h-11 flex-1" disabled={pending} onClick={() => run(() => decideSwapAction({ id, approve: true, note, swapRuleId: ruleId || null }))}>Approve</Button>
        <Button variant="outline" className="h-11 flex-1" disabled={pending} onClick={() => run(() => decideSwapAction({ id, approve: false, note }))}>Reject</Button>
      </div>
    </div>
  );
}
