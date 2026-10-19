"use client";

import { useState, useTransition } from "react";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { hideAction, muteAction, resolveReportAction, unhideAction, unmuteAction } from "@/app/staff/community/actions";
import { T } from "@/app/staff/community/strings";
import { ReasonDialog } from "./reason-dialog";

export function ReportActions({ reportId, reason, targetHidden }: { reportId: string; reason: string; targetHidden: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {!targetHidden ? (
        <ReasonDialog title={T.hideTitle} body={T.hideBody} label={T.hideReason} initial={reason} submitLabel={T.hide}
          trigger={<Button variant="destructive" className="h-11 gap-1.5"><EyeOff className="size-4" aria-hidden />{T.hide}</Button>}
          run={(r) => resolveReportAction({ reportId, action: "hide", reason: r })} />
      ) : null}
      <Button variant="outline" className="h-11" disabled={pending} onClick={() => start(async () => {
        const r = await resolveReportAction({ reportId, action: "dismiss" });
        if (!r.ok) toast.error(r.error); else toast.success(r.message ?? T.dismissed);
      })}>{T.dismiss}</Button>
    </div>
  );
}

export function HideButton({ targetType, targetId }: { targetType: "post" | "comment"; targetId: string }) {
  return (
    <ReasonDialog title={T.hideTitle} body={T.hideBody} label={T.hideReason} submitLabel={T.hide}
      trigger={<Button variant="outline" className="h-11 gap-1.5"><EyeOff className="size-4" aria-hidden />{T.hide}</Button>}
      run={(r) => hideAction({ targetType, targetId, reason: r })} />
  );
}

export function UnhideButton({ targetType, targetId }: { targetType: "post" | "comment"; targetId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" className="h-11" disabled={pending} onClick={() => start(async () => {
      const r = await unhideAction({ targetType, targetId });
      if (!r.ok) toast.error(r.error); else toast.success(r.message ?? T.unhidden);
    })}>{T.unhide}</Button>
  );
}

export function MuteButton({ userId, name }: { userId: string; name: string }) {
  const [days, setDays] = useState<1 | 3 | 7>(1);
  return (
    <ReasonDialog title={T.muteTitle(name)} body={T.muteBody} label={T.muteReason} submitLabel={T.mute}
      trigger={<Button variant="outline" className="h-11">{T.mute}</Button>}
      extra={
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{T.muteFor}</legend>
          <div className="grid grid-cols-3 gap-2">
            {T.muteOptions.map((o) => (
              <Label key={o.days} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${days === o.days ? "border-primary bg-primary/10 text-primary" : ""}`}>
                <input type="radio" name={`mute-${userId}`} className="sr-only" checked={days === o.days} onChange={() => setDays(o.days as 1 | 3 | 7)} />
                {o.label}
              </Label>
            ))}
          </div>
        </fieldset>
      }
      run={(r) => muteAction({ userId, days, reason: r })} />
  );
}

export function UnmuteButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" className="h-11" disabled={pending} onClick={() => start(async () => {
      const r = await unmuteAction({ userId });
      if (!r.ok) toast.error(r.error); else toast.success(r.message ?? T.unmuted);
    })}>{T.unmute}</Button>
  );
}
