"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/server/actions";
import { T } from "@/app/staff/community/strings";

/** A button that opens a dialog asking for a reason, then runs a server action and toasts the result. */
export function ReasonDialog({ trigger, title, body, label, initial = "", submitLabel, extra, run }: {
  trigger: ReactNode; title: string; body: string; label: string; initial?: string; submitLabel: string;
  extra?: ReactNode; run: (reason: string) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(initial);
  const [busy, setBusy] = useState(false);
  const id = `reason-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!reason.trim()) { toast.error("Give a reason."); return; }
          setBusy(true);
          const r = await run(reason.trim());
          setBusy(false);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success(r.message ?? "Saved.");
          setOpen(false);
        }}>
          {extra}
          <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>{T.cancel}</Button>
            <Button type="submit" className="h-11" disabled={busy}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
