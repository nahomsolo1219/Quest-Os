"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reportAction } from "@/app/app/community/actions";
import { S } from "@/app/app/community/strings";

/** Report a post or comment to operations (dialog with a reason). */
export function ReportButton({ targetType, targetId, compact }: { targetType: "post" | "comment"; targetId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const id = `report-${targetId}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-11 gap-1.5 text-muted-foreground" aria-label={`${S.report} ${targetType}`}>
          <Flag className="size-4" aria-hidden />{compact ? null : S.report}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.reportTitle}</DialogTitle>
          <DialogDescription>{S.reportBody}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!reason.trim()) { toast.error("Tell us what is wrong with it."); return; }
          setBusy(true);
          const r = await reportAction({ targetType, targetId, reason });
          setBusy(false);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success(r.message ?? S.reportSent);
          setReason("");
          setOpen(false);
        }}>
          <Label htmlFor={id}>{S.reportReason}</Label>
          <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={S.reportPlaceholder} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>{S.cancel}</Button>
            <Button type="submit" className="h-11" disabled={busy}>{S.reportSend}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
