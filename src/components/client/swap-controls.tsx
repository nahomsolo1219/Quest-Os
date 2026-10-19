"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addExtraProteinAction, endSwapAction, removeExtraProteinAction, requestSwapAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { formatDate } from "@/domain/time";
import { useAction } from "./use-action";

export function AddSwapButton({ ruleId, disabled }: { ruleId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button type="button" className="h-11 min-w-20" disabled={disabled || pending} onClick={() => start(async () => {
      const r = await requestSwapAction({ swapRuleId: ruleId });
      if (r.ok) { toast.success(T.swaps.approvedToast(formatDate(r.data.effectiveWeekStart, "long"))); router.refresh(); } else toast.error(r.error);
    })}>{T.swaps.add}</Button>
  );
}

export function EndSwapButton({ id, label }: { id: string; label: string }) {
  const { pending, run } = useAction();
  return (
    <Button type="button" variant="outline" className="h-11" disabled={pending}
      onClick={() => run(() => endSwapAction({ id }), undefined, "Done. The change starts from the next week after the cutoff.")}>{label}</Button>
  );
}

export function CustomSwapForm() {
  const [text, setText] = useState("");
  const { pending, run } = useAction();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => requestSwapAction({ customRequest: text }), () => setText(""), T.swaps.requestedToast); }}>
      <Label htmlFor="custom-swap">{T.swaps.customLabel}</Label>
      <Textarea id="custom-swap" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" variant="outline" className="h-11" disabled={pending || !text.trim()}>{T.swaps.customSend}</Button>
    </form>
  );
}

export function AddonButton({ slot, activeId }: { slot: string; activeId: string | null }) {
  const { pending, run } = useAction();
  return activeId
    ? <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => run(() => removeExtraProteinAction({ id: activeId }), undefined, "Extra protein ends from the next week after the cutoff.")}>{T.swaps.end}</Button>
    : <Button type="button" className="h-11" disabled={pending} onClick={() => run(() => addExtraProteinAction({ slot }), undefined, "Extra protein added from the next week after the cutoff.")}>{T.swaps.add}</Button>;
}
